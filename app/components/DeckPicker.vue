<script setup lang="ts">
import { DECKS, useDeck, type Deck } from '~/composables/useDeck'

const { deck, setDeck, restoreDeck } = useDeck()

const tokenRefs = ref<HTMLButtonElement[]>([])

onMounted(restoreDeck)

const LABELS: Record<Deck, string> = {
  heart: 'Heart deck',
  spade: 'Spade deck',
  club: 'Club deck',
  diamond: 'Diamond deck'
}

// Radiogroup keyboard pattern: arrows move and select, focus follows.
function onKeydown(e: KeyboardEvent, index: number) {
  const step = e.key === 'ArrowRight' || e.key === 'ArrowDown'
    ? 1
    : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
  if (!step) return
  e.preventDefault()
  const next = (index + step + DECKS.length) % DECKS.length
  setDeck(DECKS[next]!)
  tokenRefs.value[next]?.focus()
}
</script>

<template>
  <div
    class="deck-picker"
    role="radiogroup"
    aria-label="Pick a deck"
  >
    <button
      v-for="(d, i) in DECKS"
      :key="d"
      ref="tokenRefs"
      type="button"
      role="radio"
      class="token"
      :class="d === 'heart' || d === 'diamond' ? 'suit-red' : 'suit-black'"
      :aria-checked="deck === d"
      :aria-label="LABELS[d]"
      :tabindex="deck === d ? 0 : -1"
      @click="setDeck(d)"
      @keydown="onKeydown($event, i)"
    >
      <SuitIcon :suit="d" />
    </button>
  </div>
</template>

<style scoped>
.deck-picker {
  display: flex;
  gap: var(--space-chip);
}
</style>
