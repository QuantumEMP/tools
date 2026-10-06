import express from 'express'
import cors from 'cors'
import multer from 'multer'
import sharp from 'sharp'
import ffmpeg from 'fluent-ffmpeg'
import { createReadStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import net from 'node:net'

const app = express()

// Lock this down to your actual Cloudflare Pages domain(s) before going live —
// wildcard '*' is fine for local testing, not for production.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',')
app.use(cors({ origin: allowedOrigins }))
app.use(express.json({ limit: '10kb' }))

const upload = multer({ storage: multer.memoryStorage() })

app.post('/compress-image', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

  const format = req.query.format || 'webp'
  const quality = req.query.quality ? Number(req.query.quality) : 80
  const width = req.query.width ? Number(req.query.width) : undefined

  try {
    let pipeline = sharp(req.file.buffer).rotate()
    if (width) pipeline = pipeline.resize({ width, withoutEnlargement: true })

    let output, contentType
    switch (format) {
      case 'jpeg':
      case 'jpg':
        output = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer()
        contentType = 'image/jpeg'
        break
      case 'png':
        output = await pipeline.png({ quality, compressionLevel: 9 }).toBuffer()
        contentType = 'image/png'
        break
      case 'avif':
        output = await pipeline.avif({ quality }).toBuffer()
        contentType = 'image/avif'
        break
      default:
        output = await pipeline.webp({ quality }).toBuffer()
        contentType = 'image/webp'
    }

    res.set('Content-Type', contentType)
    res.set('Content-Disposition', `attachment; filename="compressed.${format}"`)
    res.send(output)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Image compression failed' })
  }
})

const FORMATS = {
  mp4: { ext: 'mp4', codec: 'libx264', mime: 'video/mp4' },
  webm: { ext: 'webm', codec: 'libvpx-vp9', mime: 'video/webm' }
}

// video needs a real file on disk for ffmpeg, so use disk storage here instead of memory
const videoUpload = multer({ dest: tmpdir() })

app.post('/compress-video', videoUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

  const formatKey = req.query.format || 'mp4'
  const preset = req.query.preset || 'fast'
  const crf = req.query.crf ? Number(req.query.crf) : 28
  const target = FORMATS[formatKey] ?? FORMATS.mp4

  const inputPath = req.file.path
  const outputPath = join(tmpdir(), `${randomUUID()}-compressed.${target.ext}`)

  try {
    await new Promise((resolve, reject) => {
      const cmd = ffmpeg(inputPath)
        .videoCodec(target.codec)
        .outputOptions([`-crf ${crf}`, `-preset ${preset}`])
        .audioCodec('aac')

      if (target.codec === 'libvpx-vp9') {
        cmd.outputOptions(['-b:v 0', '-deadline good', '-cpu-used 2'])
        cmd.audioCodec('libopus')
      }

      cmd.save(outputPath).on('end', resolve).on('error', reject)
    })

    res.set('Content-Type', target.mime)
    res.set('Content-Disposition', `attachment; filename="compressed.${target.ext}"`)
    const stream = createReadStream(outputPath)
    stream.pipe(res)
    stream.on('close', () => {
      unlink(outputPath).catch(() => {})
    })
  } catch (err) {
    console.error(err)
    const killedBySignal = /killed with signal/i.test(err.message || '')
    res.status(killedBySignal ? 507 : 500).json({
      error: killedBySignal
        ? 'The server ran out of memory encoding this video — try a smaller file or lower quality.'
        : 'Video compression failed'
    })
  } finally {
    unlink(inputPath).catch(() => {})
  }
})

// This endpoint has the server fetch an arbitrary client-supplied URL, which is a
// classic SSRF vector — a bare fetch() here would let a client reach Fly's internal
// 6PN network (fdaa::/16), cloud-metadata-style link-local addresses, or localhost
// services. isBlockedAddress + the per-hop check in fetchImageSafely close that off,
// including redirect chains that only turn private after the first hop.
const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const FETCH_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 5

function isBlockedAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number)
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    if (a === 169 && b === 254) return true // link-local, incl. cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a >= 224) return true // multicast/reserved
    return false
  }
  if (net.isIPv6(address)) {
    const addr = address.toLowerCase()
    if (addr === '::1' || addr === '::') return true
    if (addr.startsWith('fe80:')) return true
    if (addr.startsWith('fc') || addr.startsWith('fd')) return true // unique local, incl. Fly's 6PN
    if (addr.startsWith('::ffff:')) {
      const v4 = addr.split(':').pop()
      if (v4 && net.isIPv4(v4)) return isBlockedAddress(v4)
    }
    return false
  }
  return true // unrecognized format — block rather than risk it
}

async function assertPublicHost(hostname) {
  const { address } = await lookup(hostname)
  if (isBlockedAddress(address)) {
    const err = new Error('That URL points at a private or reserved address')
    err.statusCode = 400
    throw err
  }
}

async function fetchImageSafely(startUrl) {
  let current = new URL(startUrl)

  for (let redirects = 0; ; redirects++) {
    if (!['http:', 'https:'].includes(current.protocol)) {
      const err = new Error('Only http(s) URLs are supported')
      err.statusCode = 400
      throw err
    }
    await assertPublicHost(current.hostname)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let upstream
    try {
      upstream = await fetch(current, { redirect: 'manual', signal: controller.signal })
    } finally {
      clearTimeout(timeout)
    }

    if ([301, 302, 303, 307, 308].includes(upstream.status)) {
      if (redirects >= MAX_REDIRECTS) {
        const err = new Error('Too many redirects')
        err.statusCode = 502
        throw err
      }
      const location = upstream.headers.get('location')
      if (!location) {
        const err = new Error('Redirect with no location header')
        err.statusCode = 502
        throw err
      }
      current = new URL(location, current)
      continue
    }

    if (!upstream.ok) {
      const err = new Error(`Upstream responded ${upstream.status}`)
      err.statusCode = 502
      throw err
    }

    const contentType = upstream.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) {
      const err = new Error(`Not an image (${contentType || 'unknown content type'})`)
      err.statusCode = 415
      throw err
    }

    const declaredLength = Number(upstream.headers.get('content-length') || 0)
    if (declaredLength > MAX_IMAGE_BYTES) {
      const err = new Error('Image exceeds size limit')
      err.statusCode = 413
      throw err
    }

    const reader = upstream.body.getReader()
    const chunks = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_IMAGE_BYTES) {
        reader.cancel().catch(() => {})
        const err = new Error('Image exceeds size limit')
        err.statusCode = 413
        throw err
      }
      chunks.push(value)
    }

    return { buffer: Buffer.concat(chunks.map(c => Buffer.from(c))), contentType }
  }
}

app.post('/fetch-image', async (req, res) => {
  const { url } = req.body || {}
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'Missing url' })

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return res.status(400).json({ error: 'Invalid URL' })
  }

  try {
    const { buffer, contentType } = await fetchImageSafely(parsed.toString())
    res.set('Content-Type', contentType)
    res.send(buffer)
  } catch (err) {
    const status = err.statusCode || 502
    if (status >= 500) console.error(err)
    res.status(status).json({ error: err.message || 'Failed to fetch image' })
  }
})

app.get('/health', (_req, res) => res.json({ ok: true }))

const port = process.env.PORT || 8787
app.listen(port, () => console.log(`Compression API listening on :${port}`))
