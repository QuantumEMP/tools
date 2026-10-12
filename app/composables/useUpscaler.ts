import type { Fit, ModelInfo, RawImage, WorkerRequest, WorkerResponse } from '~/utils/upscaler-types'

export type OutputFormat = 'png' | 'jpeg' | 'webp'

export interface UpscaleOptions {
  source: ImageBitmap
  model: ModelInfo
  width: number
  height: number
  fit: Fit
  format: OutputFormat
  quality: number
}

export interface UpscaleResult {
  blob: Blob
  passes: number
  backend: 'webgpu' | 'wasm' | 'none'
  seconds: number
}

// Limits keep memory and canvas sizes within what browsers reliably support.
export const MAX_OUTPUT_PIXELS = 64_000_000
export const MAX_DIMENSION = 16_384
const MAX_INTERMEDIATE_PIXELS = 64_000_000
const EXTRA_PASS_THRESHOLD = 1.5

/** Number of 4× AI passes needed to reach `ratio` (small remainders are left to Lanczos). */
export function planPasses(ratio: number, inputPixels: number) {
  let passes = 0
  let current = 1
  while (ratio / current > (passes ? EXTRA_PASS_THRESHOLD : 1)) {
    if (inputPixels * (current * 4) ** 2 > MAX_INTERMEDIATE_PIXELS) break
    passes++
    current *= 4
  }
  return passes
}

function makeCanvas(width: number, height: number) {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  return c
}

export function useUpscaler() {
  const stage = ref('')
  const progress = ref(0)
  const backend = ref<'webgpu' | 'wasm'>()
  let worker: Worker | undefined

  function getWorker() {
    worker ??= new Worker(new URL('../workers/upscaler.worker.ts', import.meta.url), { type: 'module' })
    return worker
  }

  function runWorker(req: WorkerRequest, transfer: Transferable[]) {
    return new Promise<{ image: RawImage, backend?: 'webgpu' | 'wasm' }>((resolve, reject) => {
      const w = getWorker()
      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data
        if (msg.type === 'progress') {
          stage.value = msg.stage
          progress.value = msg.progress
        } else if (msg.type === 'backend') backend.value = msg.backend
        else if (msg.type === 'done') resolve(msg)
        else if (msg.type === 'error') reject(new Error(msg.message))
      }
      w.onerror = (e) => {
        worker?.terminate()
        worker = undefined
        reject(new Error(e.message || 'Upscaler worker crashed'))
      }
      w.postMessage(req, transfer)
    })
  }

  async function upscale(opts: UpscaleOptions): Promise<UpscaleResult> {
    const started = performance.now()
    const { source, width, height, fit } = opts
    const ratio = Math.max(width / source.width, height / source.height)
    const passes = planPasses(ratio, source.width * source.height)

    // The only canvas readback. Fingerprinting protection may add faint noise
    // here, but nothing after this point depends on reading a canvas back.
    const canvas = makeCanvas(source.width, source.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(source, 0, 0)
    const imageData = ctx.getImageData(0, 0, source.width, source.height)
    const raw: RawImage = { width: imageData.width, height: imageData.height, data: imageData.data }
    const { image, backend: b } = await runWorker(
      { type: 'upscale', model: toRaw(opts.model), image: raw, passes, target: { width, height, fit } },
      [raw.data.buffer]
    )
    const usedBackend: UpscaleResult['backend'] = b ?? 'none'

    // For contain, the worker returns the fitted image; centre it on the full canvas.
    const final = makeCanvas(width, height)
    const fctx = final.getContext('2d')!
    if (opts.format === 'jpeg') {
      fctx.fillStyle = '#000'
      fctx.fillRect(0, 0, width, height)
    }
    const pixels = new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height)
    const dx = Math.floor((width - image.width) / 2)
    const dy = Math.floor((height - image.height) / 2)
    if (opts.format === 'jpeg' || dx || dy) {
      // putImageData ignores compositing, so go via a canvas to keep the black JPEG backdrop.
      const tmp = makeCanvas(image.width, image.height)
      tmp.getContext('2d')!.putImageData(pixels, 0, 0)
      fctx.drawImage(tmp, dx, dy)
    } else {
      fctx.putImageData(pixels, 0, 0)
    }

    stage.value = 'Encoding'
    const blob = await new Promise<Blob>((resolve, reject) =>
      final.toBlob(b => (b ? resolve(b) : reject(new Error('Encoding failed — image may be too large for this browser'))), `image/${opts.format}`, opts.quality / 100)
    )
    if (blob.type !== `image/${opts.format}`) throw new Error(`This browser cannot encode ${opts.format.toUpperCase()}`)

    return { blob, passes, backend: usedBackend, seconds: Math.round((performance.now() - started) / 100) / 10 }
  }

  onBeforeUnmount(() => worker?.terminate())

  return { upscale, stage, progress, backend }
}
