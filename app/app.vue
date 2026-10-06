<script setup>
import { DECK_HEAD_SCRIPT } from '~/composables/useDeck'

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: '/jester-hat.svg' },
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    // crossorigin is required: COEP require-corp blocks no-cors cross-origin stylesheets.
    {
      rel: 'stylesheet',
      crossorigin: 'anonymous',
      href: 'https://fonts.googleapis.com/css2?family=Comfortaa:wght@400;700&family=DM+Serif+Display&family=DM+Serif+Text:ital@0;1&family=Kings&display=swap'
    }
  ],
  script: [
    { innerHTML: DECK_HEAD_SCRIPT, tagPriority: 'critical' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

// Each page sets its own title/description; this is the fallback and suffix.
useSeoMeta({
  titleTemplate: t => (t ? `${t} · Joker` : 'Joker'),
  twitterCard: 'summary'
})
</script>

<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
