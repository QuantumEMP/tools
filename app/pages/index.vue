<script setup lang="ts">
import type { Suit } from '~/components/SuitIcon.vue'

useSeoMeta({
  title: 'The big top',
  description: 'Two acts, one tent: shrink images and video, or blow small pictures up big. Everything runs in your browser.'
})

const ACTS: { to: string, suit: Suit, title: string, blurb: string, cta: string }[] = [
  {
    to: '/compress',
    suit: 'spade',
    title: 'The shrinking act',
    blurb: 'Images and video squeezed small. WebP, AVIF, JPEG, PNG, MP4 or WebM, one at a time or a whole CSV of links.',
    cta: 'Shrink something'
  },
  {
    to: '/upscale',
    suit: 'heart',
    title: 'The strongman',
    blurb: 'Lifts small pictures into big ones with Real-ESRGAN, up to 8K, on your own device. Your images never leave the tent.',
    cta: 'Lift something'
  }
]
</script>

<template>
  <div class="jk-page">
    <section class="blk blk-base jk-hero">
      <div class="wrap">
        <div class="jk-topbar">
          <NuxtLink
            class="marquee"
            to="/"
            aria-label="Joker, the big top"
          >
            <span>Joker</span>
          </NuxtLink>
          <DeckPicker />
        </div>

        <h1 class="section-title">
          The big top
        </h1>
        <p class="section-sub jk-hero-sub">
          Two acts, one tent. Pick a show: everything runs right here in your browser.
        </p>
      </div>
    </section>

    <main class="blk blk-primary">
      <div class="wrap jk-acts">
        <NuxtLink
          v-for="act in ACTS"
          :key="act.to"
          :to="act.to"
          class="stock jk-act"
        >
          <SuitIcon
            :suit="act.suit"
            class="jk-act-suit"
            :class="act.suit === 'heart' || act.suit === 'diamond' ? 'suit-red' : 'suit-black'"
          />
          <h2 class="object-title">
            {{ act.title }}
          </h2>
          <p class="jk-act-blurb">
            {{ act.blurb }}
          </p>
          <span class="btn btn-gold jk-act-cta">{{ act.cta }}</span>
        </NuxtLink>
      </div>
    </main>

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

.jk-acts {
  display: grid;
  gap: var(--space-grid);
}

@media (min-width: 768px) {
  .jk-acts { grid-template-columns: 1fr 1fr; }
}

/* The whole card is the link; the pill inside is only its visual cue. */
.jk-act {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-stack);
  padding: var(--space-object);
  border-width: var(--stroke-feature);
  border-radius: var(--radius-panel);
  box-shadow: 10px 10px 0 var(--ink);
  text-decoration: none;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.jk-act:nth-child(2) { rotate: 1.5deg; }
.jk-act:nth-child(1) { rotate: -1.5deg; }

.jk-act:hover {
  transform: translate(-3px, -3px);
  box-shadow: 13px 13px 0 var(--ink);
}

.jk-act-suit { font-size: 44px; }

.jk-act-blurb {
  flex: 1;
  margin: 0;
}

.jk-act-cta { pointer-events: none; }

.jk-footer .section-sub { margin: 0; }

@media (prefers-reduced-motion: reduce) {
  .jk-act { transition: none; }
}
</style>
