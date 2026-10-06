# Joker

Two browser tools under one big top, built with Nuxt 4 + Nuxt UI and deployed to Cloudflare Pages.

| Route | Act | What it does |
| --- | --- | --- |
| `/` | The big top | Landing page |
| `/compress` | The shrinking act | Compresses images (WebP, AVIF, JPEG, PNG) and video (MP4, WebM), including bulk import from a CSV of URLs |
| `/upscale` | The strongman | Upscales images to an exact resolution with [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN), entirely on the user's device |

## Development

```bash
pnpm install
pnpm dev                      # http://localhost:3000
```

The compressor talks to the Express/ffmpeg API in `api-server/` (run it locally on port 8787, or set
`NUXT_PUBLIC_API_BASE`, see `.env.example`). The upscaler needs no server.

## How the upscaler works

1. The official Real-ESRGAN PyTorch weights are converted to ONNX (`scripts/export-onnx.py`) and served from
   `public/models/`, split into 20 MB chunks to stay under Cloudflare's 25 MiB per-file limit.
2. A Web Worker ([app/workers/upscaler.worker.ts](app/workers/upscaler.worker.ts)) downloads the model once,
   keeps it in the Cache API, and runs it with [onnxruntime-web](https://onnxruntime.ai/) on WebGPU, falling
   back to multi-threaded WASM. The onnxruntime WebGPU `.wasm` (26.8 MB) is too big for Cloudflare static
   assets, so the worker loads it from jsDelivr, pinned to the installed version.
3. [pica](https://github.com/nodeca/pica) resizes to the exact target with Lanczos3.

| Model | Download | Notes |
| --- | --- | --- |
| `realesr-general-x4v3` | 5 MB | Default. Fast, good for photos |
| `realesrgan-x4plus` | 67 MB | Highest quality, much slower |
| `realesrgan-x4plus-anime` | 18 MB | Anime / illustrations |
| `realesr-animevideov3` | 2.5 MB | Very fast, anime style |

To rebuild the models from the official weights:

```bash
python3 -m venv .venv && .venv/bin/pip install torch onnx onnxscript
.venv/bin/python scripts/export-onnx.py
```

If you change a model, bump `MODEL_CACHE` in the worker so browsers drop their cached copy.

## Cross-origin isolation

The whole site is served with `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` (see `routeRules` in `nuxt.config.ts`), which multi-threaded WASM
needs. It's site-wide, not just `/upscale`, because isolation is fixed when a document loads and the landing
page links to the upscaler client-side. The catch is that every cross-origin subresource must opt in with CORS
or CORP: the Google Fonts `<link>` carries `crossorigin`, and the compressor API sends CORS headers.

## Production

```bash
pnpm build                    # cloudflare_pages preset, output in dist/
npx wrangler pages dev dist   # preview locally
```
