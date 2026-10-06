<script setup lang="ts">
// The brand's own suit paths (100 × 100, currentColor). Never type ♠♥♦♣:
// many devices render those as colour emoji.
export type Suit = 'spade' | 'heart' | 'club' | 'diamond'

// 'star' isn't a suit; it's the drop-zone mark on the upscaler.
defineProps<{ suit: Suit | 'star' }>()
</script>

<template>
  <svg
    class="jk-suit"
    viewBox="0 0 100 100"
    aria-hidden="true"
  >
    <path
      v-if="suit === 'spade'"
      d="M50 3 C36 24 6 40 6 61 C6 75 17 84 29 84 C37 84 43 80 47 74 C46 84 42 91 33 97 L67 97 C58 91 54 84 53 74 C57 80 63 84 71 84 C83 84 94 75 94 61 C94 40 64 24 50 3 Z"
    />
    <path
      v-else-if="suit === 'heart'"
      d="M50 92 C22 68 4 50 4 30 C4 14 16 4 30 4 C40 4 47 10 50 18 C53 10 60 4 70 4 C84 4 96 14 96 30 C96 50 78 68 50 92 Z"
    />
    <g v-else-if="suit === 'club'">
      <circle
        cx="50"
        cy="27"
        r="21"
      />
      <circle
        cx="25"
        cy="58"
        r="21"
      />
      <circle
        cx="75"
        cy="58"
        r="21"
      />
      <circle
        cx="50"
        cy="52"
        r="14"
      />
      <path d="M46 56 C46 78 42 89 33 97 L67 97 C58 89 54 78 54 56 Z" />
    </g>
    <path
      v-else-if="suit === 'diamond'"
      d="M50 2 L86 50 L50 98 L14 50 Z"
    />
    <path
      v-else
      d="M50 6 L62 38 L96 38 L68 58 L78 92 L50 72 L22 92 L32 58 L4 38 L38 38 Z"
    />
  </svg>
</template>
