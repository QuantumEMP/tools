<script setup lang="ts">
defineProps<{ before: string, after: string, fit: 'fill' | 'cover' | 'contain' }>()

const pos = ref(50)
const el = ref<HTMLElement>()

function update(e: PointerEvent) {
  const rect = el.value!.getBoundingClientRect()
  pos.value = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100))
}

function onDown(e: PointerEvent) {
  el.value!.setPointerCapture(e.pointerId)
  update(e)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft') pos.value = Math.max(0, pos.value - 5)
  if (e.key === 'ArrowRight') pos.value = Math.min(100, pos.value + 5)
}
</script>

<template>
  <div
    ref="el"
    class="compare"
    role="slider"
    tabindex="0"
    aria-label="Before / after comparison"
    :aria-valuenow="Math.round(pos)"
    aria-valuemin="0"
    aria-valuemax="100"
    @pointerdown="onDown"
    @pointermove="(e: PointerEvent) => e.buttons && update(e)"
    @keydown="onKey"
  >
    <img
      :src="after"
      alt="Upscaled"
      draggable="false"
    >
    <img
      :src="before"
      alt="Original"
      class="before"
      :style="{ objectFit: fit, clipPath: `inset(0 ${100 - pos}% 0 0)` }"
      draggable="false"
    >
    <div
      class="handle"
      :style="{ left: `${pos}%` }"
    >
      <span />
    </div>
    <span class="tag left">Original</span>
    <span class="tag right">Upscaled</span>
  </div>
</template>

<style scoped>
.compare {
  position: relative;
  display: inline-block;
  max-width: 100%;
  vertical-align: top;
  overflow: hidden;
  border-radius: var(--radius-panel);
  cursor: ew-resize;
  user-select: none;
  touch-action: none;
  background: repeating-conic-gradient(var(--checker) 0 25%, var(--paper) 0 50%) 0 0 / 20px 20px;
}
img {
  display: block;
  max-width: 100%;
  max-height: 70vh;
}
.before {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
}
/* Handle: a gold juggling ball on an ink rail, flat with a hard shadow. */
.handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--ink);
  border-inline: 1px solid var(--gold);
  transform: translateX(-2px);
}
.handle span {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 36px;
  height: 36px;
  border: var(--stroke-object) solid var(--ink);
  border-radius: var(--radius-pill);
  background: var(--gold);
  box-shadow: 4px 4px 0 var(--ink);
  transform: translate(-50%, -50%);
}
.tag {
  position: absolute;
  top: 12px;
  padding: 6px 14px;
  border: var(--stroke-chip) solid var(--ink);
  border-radius: var(--radius-pill);
  background: var(--paper);
  color: var(--ink);
  font: 700 14px/1.2 var(--font-sans);
}
.left { left: 12px; }
.right { right: 12px; }
</style>
