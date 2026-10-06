<script setup lang="ts">
import manifest from '~~/public/models/manifest.json'
import type { ModelInfo } from '~/utils/upscaler-types'
import { MAX_DIMENSION, MAX_OUTPUT_PIXELS, planPasses, useUpscaler } from '~/composables/useUpscaler'
import type { Fit, OutputFormat, UpscaleResult } from '~/composables/useUpscaler'

const MAX_UPLOAD_MB = 50
const models: ModelInfo[] = manifest.models.map(m => ({ ...m, parts: m.parts.map(p => `/models/${p}`) }))
const { upscale: runUpscale, stage, progress } = useUpscaler()
const hasWebGPU = ref(true)
onMounted(() => {
  hasWebGPU.value = 'gpu' in navigator
})

const PRESETS = [
  { label: '2×', factor: 2 },
  { label: '4×', factor: 4 },
  { label: '1080p', box: [1920, 1080] },
  { label: '1440p', box: [2560, 1440] },
  { label: '4K', box: [3840, 2160] },
  { label: '8K', box: [7680, 4320] }
] as const

const file = ref<File>()
const bitmap = shallowRef<ImageBitmap>()
const originalUrl = ref('')
const original = reactive({ width: 0, height: 0 })
const width = ref(0)
const height = ref(0)
const lockAspect = ref(true)
const activePreset = ref<string>('4×')
const fit = ref<Fit>('fill')
const model = ref(models[0]!.id)
const format = ref<OutputFormat>('png')
const quality = ref(92)
const dragging = ref(false)
const busy = ref(false)
const result = ref<UpscaleResult & { url: string, name: string, input: string, output: string }>()
const error = ref('')
const selectedModel = computed(() => models.find(m => m.id === model.value)!)
const passes = computed(() => (original.width ? planPasses(scaleFactor.value, original.width * original.height) : 0))

const aspect = computed(() => (original.width && original.height ? original.width / original.height : 1))
const scaleFactor = computed(() => (original.width ? Math.max(width.value / original.width, height.value / original.height) : 0))
const megapixels = computed(() => (width.value * height.value) / 1e6)
const tooLarge = computed(() => width.value * height.value > MAX_OUTPUT_PIXELS || width.value > MAX_DIMENSION || height.value > MAX_DIMENSION)
const aspectDiffers = computed(() => original.width && Math.abs(width.value / height.value - aspect.value) > 0.01)

function applyPreset(p: typeof PRESETS[number]) {
  activePreset.value = p.label
  if ('factor' in p) {
    width.value = Math.round(original.width * p.factor)
    height.value = Math.round(original.height * p.factor)
    return
  }
  const [bw, bh] = p.box
  if (lockAspect.value) {
    // Fit inside the box, keeping the original aspect ratio.
    const s = Math.min(bw / original.width, bh / original.height)
    width.value = Math.round(original.width * s)
    height.value = Math.round(original.height * s)
  } else {
    width.value = bw
    height.value = bh
  }
}

function onWidth(v: number) {
  activePreset.value = ''
  width.value = v
  if (lockAspect.value && v > 0) height.value = Math.max(1, Math.round(v / aspect.value))
}

function onHeight(v: number) {
  activePreset.value = ''
  height.value = v
  if (lockAspect.value && v > 0) width.value = Math.max(1, Math.round(v * aspect.value))
}

watch(lockAspect, (locked) => {
  if (locked && original.width) onWidth(width.value)
})

async function loadFile(f?: File | null) {
  error.value = ''
  if (!f) return
  if (!f.type.startsWith('image/')) {
    error.value = 'That isn\'t an image. Try a PNG, JPEG or WebP.'
    return
  }
  if (f.size > MAX_UPLOAD_MB * 1024 * 1024) {
    error.value = `That image is over ${MAX_UPLOAD_MB} MB.`
    return
  }
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(f, { imageOrientation: 'from-image' })
  } catch {
    error.value = 'We couldn\'t read that image.'
    return
  }
  reset()
  file.value = f
  bitmap.value = bmp
  originalUrl.value = URL.createObjectURL(f)
  original.width = bmp.width
  original.height = bmp.height
  applyPreset(PRESETS.find(p => p.label === activePreset.value) ?? PRESETS[1])
}

function onDrop(e: DragEvent) {
  dragging.value = false
  loadFile(e.dataTransfer?.files?.[0])
}

function onPaste(e: ClipboardEvent) {
  const item = [...(e.clipboardData?.items ?? [])].find(i => i.type.startsWith('image/'))
  if (item) loadFile(item.getAsFile())
}

onMounted(() => window.addEventListener('paste', onPaste))
onBeforeUnmount(() => window.removeEventListener('paste', onPaste))

async function upscale() {
  if (!bitmap.value) return
  error.value = ''
  clearResult()
  busy.value = true
  stage.value = 'Starting'
  progress.value = 0
  try {
    const r = await runUpscale({
      source: bitmap.value,
      model: selectedModel.value,
      width: width.value,
      height: height.value,
      fit: fit.value,
      format: format.value,
      quality: quality.value
    })
    const base = file.value!.name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_') || 'image'
    result.value = {
      ...r,
      url: URL.createObjectURL(r.blob),
      name: `${base}_${width.value}x${height.value}.${format.value === 'jpeg' ? 'jpg' : format.value}`,
      input: `${original.width}×${original.height}`,
      output: `${width.value}×${height.value}`
    }
  } catch (e) {
    console.error(e)
    error.value = e instanceof Error ? e.message : 'Upscaling failed.'
  } finally {
    busy.value = false
  }
}

function clearResult() {
  if (result.value) URL.revokeObjectURL(result.value.url)
  result.value = undefined
}

function reset() {
  clearResult()
  if (originalUrl.value) URL.revokeObjectURL(originalUrl.value)
  bitmap.value?.close()
  bitmap.value = undefined
  file.value = undefined
  originalUrl.value = ''
  error.value = ''
}
</script>

<template>
  <div class="up-page">
    <header class="blk blk-base hero">
      <div class="wrap">
        <div class="topbar">
          <NuxtLink
            class="marquee"
            to="/"
            aria-label="Joker, back to the big top"
          ><span>Joker</span></NuxtLink>
          <DeckPicker />
        </div>

        <div class="intro">
          <h1 class="hero-title">
            The strongman
          </h1>
          <p class="section-sub">
            Lifts small pictures into big ones with Real-ESRGAN, right here in your browser.
            Your images never leave the tent.
          </p>
        </div>

        <p
          v-if="!hasWebGPU"
          class="stock note"
          role="note"
        >
          This browser has no WebGPU, so the act runs on the CPU and takes much longer.
          A recent Chrome, Edge or Safari gives the best show.
        </p>
      </div>
    </header>

    <main class="blk blk-primary">
      <div class="wrap layout">
        <section
          class="stage"
          aria-label="Image"
        >
          <label
            v-if="!file"
            class="stock drop"
            :class="{ dragging }"
            @dragover.prevent="dragging = true"
            @dragleave="dragging = false"
            @drop.prevent="onDrop"
          >
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              class="sr-only"
              @change="loadFile(($event.target as HTMLInputElement).files?.[0])"
            >
            <SuitIcon
              suit="star"
              class="drop-star"
            />
            <span class="object-title">Step right up</span>
            <span>Drop an image here, click to browse, or paste one in.</span>
            <small>PNG, JPEG or WebP up to {{ MAX_UPLOAD_MB }} MB</small>
          </label>

          <template v-else>
            <div class="stock frame">
              <CompareSlider
                v-if="result"
                :before="originalUrl"
                :after="result.url"
                :fit="fit"
              />
              <div
                v-else
                class="preview"
              >
                <img
                  :src="originalUrl"
                  alt="Original image"
                >
              </div>
            </div>

            <div class="meta">
              <span>{{ file.name }} · {{ original.width }}×{{ original.height }}</span>
              <button
                class="btn"
                type="button"
                :disabled="busy"
                @click="reset"
              >
                Pick another image
              </button>
            </div>
          </template>
        </section>

        <aside
          class="stock panel"
          aria-label="Settings"
        >
          <fieldset :disabled="!file || busy">
            <legend>Target size</legend>
            <div class="chips">
              <button
                v-for="p in PRESETS"
                :key="p.label"
                type="button"
                class="chip"
                :aria-pressed="activePreset === p.label"
                @click="applyPreset(p)"
              >
                {{ p.label }}
              </button>
            </div>

            <div class="dims">
              <label class="field">Width
                <input
                  type="number"
                  min="1"
                  max="20000"
                  :value="width"
                  @input="onWidth(+($event.target as HTMLInputElement).value)"
                >
              </label>
              <button
                type="button"
                class="lock"
                :aria-pressed="lockAspect"
                :aria-label="lockAspect ? 'Aspect ratio locked' : 'Aspect ratio unlocked'"
                :title="lockAspect ? 'Aspect ratio locked' : 'Aspect ratio unlocked'"
                @click="lockAspect = !lockAspect"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  aria-hidden="true"
                >
                  <rect
                    x="5"
                    y="11"
                    width="14"
                    height="10"
                    rx="2"
                  />
                  <path :d="lockAspect ? 'M8 11V7a4 4 0 0 1 8 0v4' : 'M8 11V7a4 4 0 0 1 7.5-2'" />
                </svg>
              </button>
              <label class="field">Height
                <input
                  type="number"
                  min="1"
                  max="20000"
                  :value="height"
                  @input="onHeight(+($event.target as HTMLInputElement).value)"
                >
              </label>
            </div>

            <p
              class="hint"
              :class="{ warn: tooLarge }"
            >
              {{ megapixels.toFixed(1) }} MP · {{ scaleFactor.toFixed(2) }}× scale
              · {{ passes ? `${passes} AI pass${passes > 1 ? 'es' : ''}` : 'no AI (downscale)' }}
              <template v-if="tooLarge">
                · over the {{ MAX_OUTPUT_PIXELS / 1e6 }} MP / {{ MAX_DIMENSION }} px limit
              </template>
            </p>

            <label
              v-if="aspectDiffers"
              class="field"
            >Shape doesn't match
              <select v-model="fit">
                <option value="fill">Stretch to fit</option>
                <option value="cover">Crop to fill</option>
                <option value="contain">Pad (letterbox)</option>
              </select>
            </label>
          </fieldset>

          <fieldset :disabled="!file || busy">
            <legend>Model</legend>
            <label
              v-for="m in models"
              :key="m.id"
              class="radio"
              :class="{ picked: model === m.id }"
            >
              <input
                v-model="model"
                type="radio"
                name="model"
                :value="m.id"
              >
              <span>
                <strong>{{ m.label }}</strong>
                <small>{{ m.description }} {{ (m.bytes / 1e6).toFixed(0) }} MB download.</small>
              </span>
            </label>
          </fieldset>

          <fieldset :disabled="!file || busy">
            <legend>Output</legend>
            <div class="row">
              <label class="field">Format
                <select v-model="format">
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                  <option value="webp">WebP</option>
                </select>
              </label>
              <label
                v-if="format !== 'png'"
                class="field"
              >Quality
                <input
                  v-model.number="quality"
                  type="number"
                  min="1"
                  max="100"
                >
              </label>
            </div>
          </fieldset>

          <button
            class="btn"
            :class="{ 'btn-gold': !result }"
            :disabled="!file || busy || tooLarge || width < 1 || height < 1"
            @click="upscale"
          >
            {{ busy ? 'Lifting…' : result ? 'Upscale again' : 'Upscale it' }}
          </button>

          <div
            v-if="busy"
            class="progress"
            role="status"
          >
            <div class="bar">
              <div :style="{ width: `${Math.round(progress * 100)}%` }" />
            </div>
            <small>{{ stage }} · {{ Math.round(progress * 100) }}%</small>
          </div>

          <p
            v-if="error"
            class="error"
            role="alert"
          >
            {{ error }}
          </p>

          <div
            v-if="result"
            class="result"
          >
            <p>
              {{ result.input }} → <strong>{{ result.output }}</strong><br>
              <small>
                AI {{ result.passes ? `${4 ** result.passes}× on ${result.backend === 'webgpu' ? 'WebGPU' : 'CPU'}` : 'skipped (downscale)' }}
                · {{ result.seconds }}s · {{ (result.blob.size / 1e6).toFixed(1) }} MB
              </small>
            </p>
            <a
              class="btn btn-gold"
              :href="result.url"
              :download="result.name"
            >Take it home</a>
          </div>
        </aside>
      </div>
    </main>

    <footer class="blk blk-base footer">
      <div class="wrap">
        <p class="section-sub">
          "Life is like a deck of cards; sometimes you have to play the joker."
        </p>
        <p class="credits">
          Powered by <a href="https://github.com/xinntao/Real-ESRGAN">Real-ESRGAN</a> and
          <a href="https://onnxruntime.ai/">ONNX Runtime</a>. Everything runs on your device.
        </p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* The shared theme sits on Tailwind's preflight, so restore the base type and
   cursor this page was designed against. */
.up-page { font-size: 17px; line-height: 1.65; }
.up-page :where(button:not(:disabled), label.radio, .drop) { cursor: pointer; }

/* Hero: the table, with the marquee sign and deck picker on top */
.hero { border-top: 0; padding-top: 24px; }
.topbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-gutter);
}

.marquee {
  position: relative;
  display: grid;
  place-items: center;
  width: 176px;
  height: 76px;
  border: var(--stroke-feature) solid var(--ink);
  border-radius: var(--radius-ticket);
  background: var(--primary);
  color: var(--paper);
  box-shadow: 6px 6px 0 var(--gold);
  font: 400 40px/1 var(--font-kings);
  text-decoration: none;
}
.marquee::before {
  content: '';
  position: absolute;
  inset: 7px 14px;
  background:
    radial-gradient(circle, var(--gold) 0 4px, transparent 4.5px) top left / 20px 10px repeat-x,
    radial-gradient(circle, var(--gold) 0 4px, transparent 4.5px) bottom left / 20px 10px repeat-x;
}
.marquee span { position: relative; }
@media (min-width: 1024px) {
  .marquee { width: 248px; height: 104px; border-radius: var(--radius-joker); font-size: 58px; }
  .marquee::before {
    inset: 10px 19px;
    background:
      radial-gradient(circle, var(--gold) 0 5px, transparent 5.5px) top left / 25.6px 12px repeat-x,
      radial-gradient(circle, var(--gold) 0 5px, transparent 5.5px) bottom left / 25.6px 12px repeat-x;
  }
}

.intro { max-width: 46rem; margin-top: var(--space-block-sm); }
.hero-title { font: 400 clamp(4.5rem, 10vw, 8.5rem)/1 var(--font-display); }
.intro .section-sub { margin: var(--space-stack) 0 0; }

.note {
  max-width: 34rem;
  margin: var(--space-grid) 0 0;
  padding: 20px 24px;
  border-radius: var(--radius-note);
  rotate: -2.5deg;
}

/* Workspace: paper objects on the primary block */
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: var(--space-grid);
  align-items: start;
}
@media (max-width: 1023px) {
  .layout { grid-template-columns: 1fr; }
}

.stage { min-width: 0; }

.drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 420px;
  padding: var(--space-object);
  border-width: var(--stroke-feature);
  border-style: dashed;
  border-radius: var(--radius-panel);
  box-shadow: 10px 10px 0 var(--ink);
  text-align: center;
  cursor: pointer;
  transition: transform .15s ease, box-shadow .15s ease;
}
.drop:hover, .drop.dragging { transform: translate(-2px, -2px); box-shadow: 12px 12px 0 var(--ink); border-style: solid; }
.drop:focus-within { outline: 3px solid var(--gold); outline-offset: 3px; }
.drop-star { font-size: 44px; color: var(--primary); }
.drop small { font-size: 15px; }

.frame {
  padding: 12px;
  border-width: var(--stroke-feature);
  border-radius: var(--radius-panel);
  box-shadow: 10px 10px 0 var(--ink);
  text-align: center;
}
.preview {
  border-radius: var(--radius-card);
  overflow: hidden;
  background: repeating-conic-gradient(var(--checker) 0 25%, var(--paper) 0 50%) 0 0 / 20px 20px;
}
.preview img {
  display: block;
  max-width: 100%;
  max-height: 70vh;
  margin: 0 auto;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-stack);
  margin-top: var(--space-gutter);
  font: 700 15px/1.4 var(--font-sans);
  overflow-wrap: anywhere;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-gutter);
  padding: var(--space-object) 28px;
  border-width: var(--stroke-feature);
  border-radius: var(--radius-panel);
  box-shadow: 10px 10px 0 var(--ink);
}

fieldset {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
fieldset:disabled .chip, fieldset:disabled .lock, fieldset:disabled .radio { cursor: not-allowed; }
fieldset:disabled .chip[aria-pressed='false'], fieldset:disabled input, fieldset:disabled select { border-style: dashed; }
legend {
  margin-bottom: 10px;
  padding: 0;
  font: 400 24px/1.2 var(--font-serif);
}

.chips { display: flex; flex-wrap: wrap; gap: var(--space-chip); }
.chip[aria-pressed='true'] { background: var(--gold); text-decoration: underline; text-underline-offset: 3px; }

.field { display: grid; gap: 6px; font: 700 14px/1.2 var(--font-sans); }
.field input, .field select {
  width: 100%;
  padding: 12px 14px;
  border: var(--stroke-chip) solid var(--ink);
  border-radius: var(--radius-input);
  background: var(--paper);
  color: var(--ink);
  font: 400 16px var(--font-sans);
}

.dims {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: var(--space-chip);
  align-items: end;
}
.lock {
  display: grid;
  place-items: center;
  width: 44px;
  height: 46px;
  border: var(--stroke-chip) solid var(--ink);
  border-radius: var(--radius-input);
  background: var(--paper);
  color: var(--ink);
}
.lock[aria-pressed='true'] { background: var(--gold); }

.row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-chip); }

.hint { margin: 0; font-size: 15px; }
.hint.warn { font-weight: 700; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 3px; }

.radio {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border: var(--stroke-chip) solid var(--ink);
  border-radius: var(--radius-card);
  cursor: pointer;
}
.radio.picked { background: var(--gold); }
.radio input { width: 18px; height: 18px; margin: 3px 0 0; accent-color: var(--ink); }
.radio span { display: flex; flex-direction: column; gap: 2px; }
.radio strong { font-size: 15px; line-height: 1.3; }
small { font-size: 14px; line-height: 1.4; }

.panel > .btn, .result .btn { width: 100%; }

.progress { display: flex; flex-direction: column; gap: 8px; }
.bar {
  height: 18px;
  border: var(--stroke-chip) solid var(--ink);
  border-radius: var(--radius-pill);
  background: var(--paper);
  overflow: hidden;
}
.bar div { height: 100%; background: var(--primary); transition: width .3s; }

.error {
  margin: 0;
  padding: 14px 16px;
  border: var(--stroke-object) solid var(--ink);
  border-radius: var(--radius-note);
  background: var(--gold);
  color: var(--ink);
  font-weight: 700;
  font-size: 15px;
}

.result p { margin: 0 0 var(--space-stack); }

/* Footer */
.footer .section-sub { margin: 0; }
.credits { margin: var(--space-stack) 0 0; font-size: 15px; }
.credits a { color: inherit; text-decoration-thickness: 2px; text-underline-offset: 3px; }

@media (prefers-reduced-motion: reduce) {
  .drop, .bar div { transition: none; }
}
</style>
