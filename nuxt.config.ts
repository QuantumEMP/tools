import { fileURLToPath } from 'node:url'

// Cross-origin isolation enables multi-threaded WASM for the upscaler (used when
// WebGPU is unavailable). It's site-wide, not just /upscale: isolation is fixed
// when a document loads, so a client-side hop from / to /upscale would otherwise
// arrive un-isolated. The cloudflare_pages preset writes routeRules headers into
// dist/_headers for static assets too, so don't repeat them in public/_headers:
// Pages comma-joins duplicates ("same-origin, same-origin"), which breaks isolation.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
}

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
  ],

  css: ['~/assets/css/joker-theme.css'],

  runtimeConfig: {
    public: {
      // Overridden per-environment — see .env.example. Falls back to the
      // local Express server for `npm run dev`.
      apiBase: 'http://localhost:8787'
    }
  },

  routeRules: {
    '/**': {
      headers: {
        ...isolationHeaders,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      }
    }
  },

  compatibilityDate: '2025-01-01',

  // Static/edge build target for Cloudflare Pages — this is what makes the
  // deploy work at all. It's also *why* server/api/compress-*.ts can't run
  // here: this preset doesn't ship a Node runtime, so those routes are
  // effectively dead code once deployed. Safe to delete them, or keep as a
  // local-dev-only fallback — just don't rely on them in production.
  nitro: {
    preset: 'cloudflare_pages'
  },

  vite: {
    server: { headers: isolationHeaders },
    resolve: {
      // Use the ORT build that doesn't bundle its 26.8 MB wasm (over Cloudflare's
      // 25 MiB per-file limit); the upscaler worker loads the runtime from jsDelivr.
      alias: [{
        find: /^onnxruntime-web\/webgpu$/,
        replacement: fileURLToPath(new URL('./node_modules/onnxruntime-web/dist/ort.webgpu.min.mjs', import.meta.url))
      }]
    },
    optimizeDeps: { exclude: ['onnxruntime-web'] },
    worker: { format: 'es' }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
