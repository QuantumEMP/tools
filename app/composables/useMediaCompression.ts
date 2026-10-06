export type MediaKind = 'image' | 'video'
export type TaskStatus = 'queued' | 'uploading' | 'done' | 'error'

export interface CompressionTask {
  id: string
  file: File
  kind: MediaKind
  status: TaskStatus
  progress: number // 0-100, driven by XHR upload.onprogress
  resultUrl?: string
  resultSize?: number
  resultName?: string
  errorMessage?: string
}

interface ImageOptions {
  format: 'webp' | 'jpeg' | 'png' | 'avif'
  quality: number
  width?: number
}

interface VideoOptions {
  format: 'mp4' | 'webm'
  crf: number
  preset: string
}

export function useMediaCompression() {
  const tasks = ref<CompressionTask[]>([])
  const { public: { apiBase } } = useRuntimeConfig()

  function addFiles(files: File[], kind: MediaKind) {
    const added = files.map<CompressionTask>(file => ({
      id: crypto.randomUUID(),
      file,
      kind,
      status: 'queued',
      progress: 0
    }))
    tasks.value.push(...added)
    return added
  }

  function removeTask(id: string) {
    const task = tasks.value.find(t => t.id === id)
    if (task?.resultUrl) URL.revokeObjectURL(task.resultUrl)
    tasks.value = tasks.value.filter(t => t.id !== id)
  }

  function clearFinished() {
    tasks.value
      .filter(t => t.status === 'done' || t.status === 'error')
      .forEach(t => removeTask(t.id))
  }

  // Swaps the original extension for the format the file was actually compressed
  // to, so downloaded names reflect the real container/codec rather than the input.
  function withExtension(filename: string, ext: string): string {
    const base = filename.replace(/\.[^./\\]+$/, '')
    return `${base}.${ext}`
  }

  // Runs one upload over XHR so we get real upload progress events.
  // $fetch/fetch can't report progress on the request body in every browser yet.
  function runOne(task: CompressionTask, url: string, outputExt: string): Promise<void> {
    return new Promise((resolve) => {
      task.status = 'uploading'
      task.progress = 0

      const xhr = new XMLHttpRequest()
      xhr.open('POST', url)
      xhr.responseType = 'blob'

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          task.progress = Math.round((e.loaded / e.total) * 100)
        }
      }

      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const blob = xhr.response as Blob
          task.resultUrl = URL.createObjectURL(blob)
          task.resultSize = blob.size
          task.resultName = withExtension(task.file.name, outputExt)
          task.status = 'done'
          task.progress = 100
        } else {
          task.status = 'error'
          // Error responses come back as a JSON blob (responseType is 'blob' for
          // the success path's binary output), so unwrap it for the real message.
          task.errorMessage = await (xhr.response as Blob)
            .text()
            .then(text => JSON.parse(text).error as string)
            .catch(() => `Server responded ${xhr.status}`)
        }
        resolve()
      }

      xhr.onerror = () => {
        task.status = 'error'
        task.errorMessage = 'Network error'
        resolve()
      }

      const body = new FormData()
      body.append('file', task.file)
      xhr.send(body)
    })
  }

  // One task at a time, in order — files can still be added in bulk, but running
  // them concurrently would multiply memory/CPU load on the API (ffmpeg in
  // particular is heavy enough per-job that a few at once can OOM the server).
  async function runQueue(targets: CompressionTask[], url: string, outputExt: string) {
    for (const task of targets) {
      await runOne(task, url, outputExt)
    }
  }

  async function compressImages(taskIds: string[], opts: ImageOptions) {
    const params = new URLSearchParams({
      format: opts.format,
      quality: String(opts.quality),
      ...(opts.width ? { width: String(opts.width) } : {})
    })
    const targets = tasks.value.filter(t => taskIds.includes(t.id))
    await runQueue(targets, `${apiBase}/compress-image?${params}`, opts.format)
  }

  async function compressVideos(taskIds: string[], opts: VideoOptions) {
    const params = new URLSearchParams({
      format: opts.format,
      crf: String(opts.crf),
      preset: opts.preset
    })
    const targets = tasks.value.filter(t => taskIds.includes(t.id))
    await runQueue(targets, `${apiBase}/compress-video?${params}`, opts.format)
  }

  const URL_RE = /https?:\/\/[^\s"'<>]+/gi

  // Runs a limited number of fetches at once so a big CSV doesn't fire hundreds of
  // requests at the API simultaneously.
  async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length)
    let index = 0
    async function worker() {
      while (index < items.length) {
        const current = index++
        const item = items[current]
        if (item === undefined) continue
        results[current] = await fn(item)
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
    return results
  }

  // The server fetches the URL itself (avoids CORS on arbitrary third-party image
  // hosts) and only hands back bytes if they're actually an image — see /fetch-image.
  async function fetchImageFromUrl(url: string): Promise<File | null> {
    const res = await fetch(`${apiBase}/fetch-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    })
    if (!res.ok) return null

    const blob = await res.blob()
    const lastSegment = url.split('/').pop()?.split('?')[0] || 'image'
    const ext = blob.type.split('/')[1]?.split('+')[0] || 'jpg'
    const filename = /\.[a-z0-9]+$/i.test(lastSegment) ? lastSegment : `${lastSegment}.${ext}`
    return new File([blob], filename, { type: blob.type })
  }

  // Minimal RFC 4180 state machine: quoted fields, "" escaping, CRLF/LF line
  // endings, no trailing-newline requirement. We only need cell values, not
  // headers or typed columns, so this is simpler and safer to bundle than a
  // full CSV library (papaparse's CJS worker shim breaks Nitro's server build).
  function parseCsv(text: string): string[][] {
    const rows: string[][] = []
    let row: string[] = []
    let field = ''
    let inQuotes = false

    for (let i = 0; i < text.length; i++) {
      const char = text[i]

      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') {
            field += '"'
            i++
          } else {
            inQuotes = false
          }
        } else {
          field += char
        }
        continue
      }

      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        row.push(field)
        field = ''
      } else if (char === '\r') {
        continue
      } else if (char === '\n') {
        row.push(field)
        rows.push(row)
        row = []
        field = ''
      } else {
        field += char
      }
    }

    if (field.length || row.length) {
      row.push(field)
      rows.push(row)
    }

    return rows
  }

  async function importImagesFromCsv(file: File) {
    const text = await file.text()
    const data = parseCsv(text)

    const urls = new Set<string>()
    for (const row of data) {
      for (const cell of row) {
        const matches = String(cell).match(URL_RE)
        matches?.forEach(m => urls.add(m.replace(/[),.;'"]+$/, '')))
      }
    }

    const uniqueUrls = Array.from(urls)
    const results = await mapWithConcurrency(uniqueUrls, 4, url => fetchImageFromUrl(url).catch(() => null))

    const files = results.filter((f): f is File => f !== null)
    if (files.length) addFiles(files, 'image')

    return { found: uniqueUrls.length, added: files.length, skipped: uniqueUrls.length - files.length }
  }

  async function downloadTasksAsZip(taskIds: string[], zipName: string) {
    const targets = tasks.value.filter(t => taskIds.includes(t.id) && t.status === 'done' && t.resultUrl)
    if (!targets.length) return

    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const usedNames = new Set<string>()
    for (const task of targets) {
      const blob = await fetch(task.resultUrl!).then(r => r.blob())
      const outputName = task.resultName ?? task.file.name
      let name = `compressed-${outputName}`
      let i = 1
      while (usedNames.has(name)) name = `compressed-${i++}-${outputName}`
      usedNames.add(name)
      zip.file(name, blob)
    }

    const content = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(content)
    const a = document.createElement('a')
    a.href = url
    a.download = zipName
    a.click()
    URL.revokeObjectURL(url)
  }

  return {
    tasks,
    addFiles,
    removeTask,
    clearFinished,
    compressImages,
    compressVideos,
    importImagesFromCsv,
    downloadTasksAsZip
  }
}
