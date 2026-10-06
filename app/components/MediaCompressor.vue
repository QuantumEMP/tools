<script setup lang="ts">
import { useMediaCompression, type MediaKind } from '~/composables/useMediaCompression'
import type { Suit } from '~/components/SuitIcon.vue'

const {
  tasks,
  addFiles,
  removeTask,
  clearFinished,
  compressImages,
  compressVideos,
  importImagesFromCsv,
  downloadTasksAsZip
} = useMediaCompression()

type Task = typeof tasks.value[number]

const mode = ref<MediaKind>('image')
const isDragging = ref(false)
const isProcessing = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const csvInput = ref<HTMLInputElement | null>(null)
const isImportingCsv = ref(false)
const csvImportSummary = ref('')
const isZipping = ref(false)

// per-mode output settings — each mode remembers its own choice, per the brief
const imageFormat = ref<'webp' | 'jpeg' | 'png' | 'avif'>('webp')
const imageQuality = ref(80)
const videoFormat = ref<'mp4' | 'webm'>('mp4')
const videoCrf = ref(28)
const videoPreset = ref('fast')

const accept = computed(() => (mode.value === 'image' ? 'image/*' : 'video/*'))

const visibleTasks = computed(() => tasks.value.filter(t => t.kind === mode.value))
const queuedCount = computed(() => visibleTasks.value.filter(t => t.status === 'queued').length)

// Each file in the line-up is dealt a suit, in deck order, so neighbours are
// easy to tell apart. Suits keep real card inks on every deck.
const SUITS: Suit[] = ['spade', 'heart', 'club', 'diamond']
const suitFor = (i: number) => SUITS[i % SUITS.length]!
const suitInk = (suit: Suit) => (suit === 'heart' || suit === 'diamond' ? 'suit-red' : 'suit-black')

// The words on each file's status chip. This is the one place the line-up
// talks, so it should sound like the ringmaster while staying instantly clear.
function statusLabel(task: Task): string {
  switch (task.status) {
    case 'queued': return 'Rehearsal'
    case 'uploading': return `Places · ${task.progress}%`
    case 'done': return 'Curtain call'
    default: return 'Failed'
  }
}

function onFilesPicked(fileList: FileList | null) {
  if (!fileList || fileList.length === 0) return
  addFiles(Array.from(fileList), mode.value)
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  onFilesPicked(e.dataTransfer?.files ?? null)
}

async function onCsvPicked(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  mode.value = 'image'
  isImportingCsv.value = true
  csvImportSummary.value = ''
  try {
    const { found, added, skipped } = await importImagesFromCsv(file)
    csvImportSummary.value = found === 0
      ? 'No image links in that CSV. Check the file has a column of URLs.'
      : `Found ${found} link${found === 1 ? '' : 's'}: ${added} image${added === 1 ? '' : 's'} joined the line-up${skipped ? `, ${skipped} skipped` : ''}.`
  } catch {
    csvImportSummary.value = 'We couldn\'t read that CSV file. Try saving it again as plain CSV.'
  } finally {
    isImportingCsv.value = false
  }
}

async function downloadAllAsZip() {
  const doneIds = visibleTasks.value.filter(t => t.status === 'done').map(t => t.id)
  if (!doneIds.length) return
  isZipping.value = true
  try {
    await downloadTasksAsZip(doneIds, `compressed-${mode.value}s.zip`)
  } finally {
    isZipping.value = false
  }
}

async function compressAll() {
  const queued = visibleTasks.value.filter(t => t.status === 'queued').map(t => t.id)
  if (queued.length === 0) return
  isProcessing.value = true
  if (mode.value === 'image') {
    await compressImages(queued, { format: imageFormat.value, quality: imageQuality.value })
  } else {
    await compressVideos(queued, { format: videoFormat.value, crf: videoCrf.value, preset: videoPreset.value })
  }
  isProcessing.value = false
}

function formatBytes(bytes?: number) {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(1)} ${units[i]}`
}
</script>

<template>
  <div class="jk-page">
    <!-- The table: logo, deck picker, the act's title and the two acts -->
    <section class="blk blk-base jk-hero">
      <div class="wrap">
        <div class="jk-topbar">
          <NuxtLink
            class="marquee"
            to="/"
            aria-label="Joker, back to the big top"
          ><span>Joker</span></NuxtLink>
          <DeckPicker />
        </div>

        <h1 class="section-title">
          The shrinking act
        </h1>
        <p class="section-sub jk-hero-sub">
          Images and video squeezed small, right here in your browser tab. Nothing leaves the big top but the smaller file.
        </p>

        <div
          class="jk-modes"
          role="tablist"
          aria-label="Media type"
        >
          <button
            type="button"
            role="tab"
            class="chip jk-mode"
            :aria-selected="mode === 'image'"
            @click="mode = 'image'"
          >
            Images
          </button>
          <button
            type="button"
            role="tab"
            class="chip jk-mode"
            :aria-selected="mode === 'video'"
            @click="mode = 'video'"
          >
            Video
          </button>
        </div>
      </div>
    </section>

    <!-- The ring: drop files in, set the recipe beside it -->
    <section class="blk blk-gold">
      <div class="wrap jk-ring">
        <div class="jk-stage">
          <span
            class="sticker jk-sticker"
            aria-hidden="true"
          >toss them in!</span>

          <input
            ref="fileInput"
            type="file"
            multiple
            :accept="accept"
            class="sr-only"
            tabindex="-1"
            @change="onFilesPicked(($event.target as HTMLInputElement).files)"
          >
          <button
            type="button"
            class="stock jk-dropzone"
            :class="{ 'is-dragging': isDragging }"
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="onDrop"
            @click="fileInput?.click()"
          >
            <span
              class="jk-dropzone-suits"
              aria-hidden="true"
            >
              <SuitIcon
                v-for="s in SUITS"
                :key="s"
                :suit="s"
                :class="suitInk(s)"
              />
            </span>
            <span class="object-title">
              Drop {{ mode === 'image' ? 'images' : 'videos' }} into the ring
            </span>
            <span class="jk-dropzone-sub">
              or click to pick them. Every file performs at the same time.
            </span>
          </button>

          <div
            v-if="mode === 'image'"
            class="jk-csv"
          >
            <input
              ref="csvInput"
              type="file"
              accept=".csv,text/csv"
              class="sr-only"
              tabindex="-1"
              @change="onCsvPicked"
            >
            <button
              type="button"
              class="btn"
              :disabled="isImportingCsv"
              @click="csvInput?.click()"
            >
              {{ isImportingCsv ? 'Reading the list…' : 'Import image links from a CSV' }}
            </button>
            <p
              v-if="csvImportSummary"
              class="jk-csv-summary"
              aria-live="polite"
            >
              {{ csvImportSummary }}
            </p>
          </div>
        </div>

        <!-- Output settings, specific to the active mode -->
        <aside
          class="stock jk-note"
          aria-labelledby="recipe-title"
        >
          <h2
            id="recipe-title"
            class="object-title"
          >
            The recipe
          </h2>

          <template v-if="mode === 'image'">
            <label class="jk-field">
              <span class="label">Output format</span>
              <select
                v-model="imageFormat"
                class="jk-input"
              >
                <option value="webp">WebP</option>
                <option value="jpeg">JPEG</option>
                <option value="png">PNG</option>
                <option value="avif">AVIF</option>
              </select>
            </label>
            <label class="jk-field">
              <span class="label">Quality: {{ imageQuality }}</span>
              <input
                v-model.number="imageQuality"
                type="range"
                min="10"
                max="100"
                class="jk-range"
              >
            </label>
          </template>

          <template v-else>
            <label class="jk-field">
              <span class="label">Output format</span>
              <select
                v-model="videoFormat"
                class="jk-input"
              >
                <option value="mp4">MP4 (H.264)</option>
                <option value="webm">WebM (VP9)</option>
              </select>
            </label>
            <label class="jk-field">
              <span class="label">Quality (CRF, lower is better): {{ videoCrf }}</span>
              <input
                v-model.number="videoCrf"
                type="range"
                min="18"
                max="40"
                class="jk-range"
              >
            </label>
            <label class="jk-field">
              <span class="label">Encode speed</span>
              <select
                v-model="videoPreset"
                class="jk-input"
              >
                <option value="ultrafast">Ultrafast</option>
                <option value="fast">Fast</option>
                <option value="medium">Medium</option>
                <option value="slow">Slow (smaller file)</option>
              </select>
            </label>
          </template>
        </aside>
      </div>
    </section>

    <!-- The line-up: every queued file, dealt a suit -->
    <section
      v-if="visibleTasks.length"
      class="blk blk-primary"
      aria-labelledby="lineup-title"
    >
      <div class="wrap">
        <h2
          id="lineup-title"
          class="section-title"
        >
          The line-up
        </h2>
        <p class="section-sub jk-lineup-sub">
          {{ visibleTasks.length }} {{ mode === 'image' ? 'image' : 'video' }}{{ visibleTasks.length === 1 ? '' : 's' }} waiting in the wings.
        </p>

        <div class="jk-actions">
          <button
            type="button"
            class="btn btn-gold"
            :disabled="isProcessing || queuedCount === 0"
            @click="compressAll"
          >
            {{ isProcessing ? 'Shrinking…' : `Shrink them all (${queuedCount})` }}
          </button>
          <button
            type="button"
            class="btn"
            :disabled="isZipping || !visibleTasks.some(t => t.status === 'done')"
            @click="downloadAllAsZip"
          >
            {{ isZipping ? 'Zipping…' : 'Download all (.zip)' }}
          </button>
          <button
            type="button"
            class="btn"
            @click="clearFinished"
          >
            Clear finished
          </button>
        </div>

        <ul
          class="jk-tasks"
          aria-live="polite"
        >
          <li
            v-for="(task, i) in visibleTasks"
            :key="task.id"
            class="stock jk-task"
          >
            <SuitIcon
              :suit="suitFor(i)"
              :class="suitInk(suitFor(i))"
              class="jk-task-suit"
            />

            <div class="jk-task-body">
              <div class="jk-task-top">
                <span class="jk-task-name">{{ task.file.name }}</span>
                <span class="label jk-task-size">{{ formatBytes(task.file.size) }}</span>
              </div>

              <div
                class="jk-progress"
                role="progressbar"
                :aria-valuenow="task.progress"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-label="`${task.file.name} progress`"
              >
                <div
                  class="jk-progress-fill"
                  :class="{ 'is-error': task.status === 'error' }"
                  :style="{ width: `${task.progress}%` }"
                />
              </div>

              <div class="jk-task-bottom">
                <span
                  class="chip jk-status"
                  :class="`jk-status-${task.status}`"
                >
                  {{ statusLabel(task) }}
                </span>
                <span
                  v-if="task.status === 'error'"
                  class="jk-error-msg"
                >{{ task.errorMessage }}</span>
                <a
                  v-if="task.status === 'done'"
                  :href="task.resultUrl"
                  :download="`compressed-${task.resultName ?? task.file.name}`"
                  class="jk-download"
                >
                  Download ({{ formatBytes(task.resultSize) }})
                </a>
                <button
                  type="button"
                  class="jk-remove"
                  :aria-label="`Remove ${task.file.name}`"
                  @click="removeTask(task.id)"
                >
                  Remove
                </button>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </section>

    <footer class="blk blk-base jk-footer">
      <div class="wrap">
        <p class="section-sub">
          Life is like a deck of cards; sometimes you have to play the joker.
        </p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.jk-page {
  min-height: 100dvh;
  overflow-x: hidden;
  font-size: 17px;
  line-height: 1.65;
}

/* Hero */
.jk-hero {
  border-top: none;
  padding-top: var(--space-gutter);
}

.jk-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-gutter);
  margin-bottom: var(--space-block-sm);
}

.jk-hero-sub {
  max-width: 34ch;
  margin-top: var(--space-stack);
}

.jk-modes {
  display: flex;
  gap: var(--space-chip);
  margin-top: 40px;
}

.jk-mode {
  cursor: pointer;
  padding: 10px 22px;
  font-size: 17px;
}

.jk-mode[aria-selected="true"] {
  background: var(--gold);
  box-shadow: 5px 5px 0 var(--drop);
}

/* The ring: dropzone beside the recipe note */
.jk-ring {
  display: grid;
  gap: var(--space-grid);
  align-items: start;
}

@media (min-width: 1024px) {
  .jk-ring { grid-template-columns: 1.6fr 1fr; }
}

.jk-stage {
  position: relative;
}

.jk-sticker {
  position: absolute;
  top: -22px;
  right: -8px;
  z-index: 1;
  pointer-events: none;
}

.jk-dropzone {
  display: grid;
  justify-items: center;
  gap: 12px;
  width: 100%;
  padding: 56px var(--space-object);
  border-width: var(--stroke-feature);
  border-style: dashed;
  border-radius: var(--radius-panel);
  box-shadow: 10px 10px 0 var(--ink);
  font: inherit;
  text-align: center;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.jk-dropzone:hover,
.jk-dropzone.is-dragging {
  border-style: solid;
  transform: translate(-3px, -3px);
  box-shadow: 13px 13px 0 var(--ink);
}

.jk-dropzone-suits {
  display: flex;
  gap: 10px;
  font-size: 28px;
}

.jk-dropzone-sub {
  font-size: 17px;
}

.jk-csv {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-stack);
  margin-top: 36px;
}

.jk-csv-summary {
  margin: 0;
}

.jk-note {
  display: grid;
  gap: 20px;
  padding: var(--space-object);
  border-width: var(--stroke-feature);
  border-radius: var(--radius-note);
  box-shadow: 10px 10px 0 var(--ink);
  rotate: var(--tilt-note);
}

.jk-field {
  display: grid;
  gap: 6px;
}

.jk-input {
  width: 100%;
  padding: 12px 14px;
  border: var(--stroke-chip) solid var(--ink);
  border-radius: var(--radius-input);
  background: var(--paper);
  color: var(--ink);
  font: 400 16px var(--font-sans);
}

.jk-range {
  width: 100%;
  accent-color: var(--primary);
}

/* The line-up */
.jk-lineup-sub {
  margin: var(--space-stack) 0 40px;
}

.jk-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-stack);
  margin-bottom: 40px;
}

.jk-tasks {
  display: grid;
  gap: var(--space-gutter);
  margin: 0;
  padding: 0;
  list-style: none;
}

.jk-task {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  padding: 20px 24px;
  border-radius: var(--radius-card);
}

.jk-task-suit {
  font-size: 32px;
  margin-top: 2px;
}

.jk-task-body {
  flex: 1;
  min-width: 0;
}

.jk-task-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-stack);
  margin-bottom: 10px;
}

.jk-task-name {
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.jk-task-size {
  flex-shrink: 0;
}

.jk-progress {
  height: 14px;
  border: var(--stroke-chip) solid var(--ink);
  border-radius: var(--radius-pill);
  background: var(--paper);
  overflow: hidden;
  margin-bottom: 14px;
}

.jk-progress-fill {
  height: 100%;
  background: var(--primary);
  transition: width 0.2s ease;
}

/* Flat colour only: a failed run fills with ink, and the chip says why */
.jk-progress-fill.is-error {
  background: var(--ink);
}

.jk-task-bottom {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px var(--space-stack);
}

.jk-status { font-size: 14px; padding: 4px 12px; }
.jk-status-done { background: var(--gold); }
.jk-status-error { background: var(--ink); color: var(--paper); }

.jk-error-msg {
  font-size: 15px;
}

.jk-download {
  margin-left: auto;
  color: var(--primary);
  font-weight: 700;
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}

.jk-remove {
  padding: 0;
  border: none;
  background: none;
  color: var(--ink);
  font: 700 15px var(--font-sans);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.jk-task-bottom:not(:has(.jk-download)) .jk-remove {
  margin-left: auto;
}

.jk-footer {
  padding: 48px 0;
}

@media (prefers-reduced-motion: reduce) {
  .jk-dropzone,
  .jk-progress-fill { transition: none; }
}
</style>
