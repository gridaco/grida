---
name: ai-models
description: >
  Research, compare, and update AI model configurations.
  Covers text model tiers, image and video generation models, image tool models,
  pricing data sourcing, and the budget/rate-limit system.
  Use when bumping model versions, adding new models, updating pricing, or
  auditing model specs against provider documentation.
---

# AI Models — Research & Update Workflow

## When to Use This Skill

- Bumping a text, image, or video model to a newer version
- Adding a new image/video generation model or provider (Vercel gateway, Replicate, fal.ai)
- Updating pricing data (per-token, per-image flat, per-image tiered, per-second)
- Verifying model specs (context window, output limit, cost) against providers
- Auditing the budget/rate-limit system

---

## Key Files

| File                                       | Role                                                                                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/grida-ai-models/src/models.ts`   | Central catalogue. Sole export is the `models` namespace: `models.text` (`ModelSpec`, `catalog`, `byTier`, `modelSpecById`), `models.image`, `models.audio`, `models.video`, `models.image_tools` |
| `packages/grida-ai-models/src/tiers.ts`    | `ModelTier` set + `TIER_MODEL_IDS` (type-uses `models.text.CatalogId` from `models.ts`)                                                                                                           |
| `editor/lib/ai/models.ts`                  | AI Gateway + BYOK provider seam (catalogue is re-exported from `@grida/ai-models`)                                                                                                                |
| `editor/lib/ai/ai.ts`                      | `toMills()` + Replicate call shapes; re-aggregates catalogue under `models.*`                                                                                                                     |
| `editor/app/(api)/private/ai/ratelimit.ts` | Budget enforcement (Upstash sliding window, mills)                                                                                                                                                |
| `editor/app/(www)/(ai)/ai/models/page.tsx` | Public models catalog page                                                                                                                                                                        |
| `docs/models/index.md`                     | User-facing models & pricing documentation                                                                                                                                                        |

## Tools

Script: `.agents/skills/ai-models/scripts/model_info.py` (symlink to `.tools/model_info.py`)

### Model lookup

```sh
# Text / language models
python .agents/skills/ai-models/scripts/model_info.py <model_id>

# Image models
python .agents/skills/ai-models/scripts/model_info.py --image <model_id>
python .agents/skills/ai-models/scripts/model_info.py --image --all
```

Source: `models.dev/api.json`. Accepts exact IDs (`anthropic/claude-sonnet-4.6`) or substring search (`gpt-5.4`).

Note: `models.dev` has per-token costs but not per-image tier breakdowns. For per-image pricing (OpenAI quality tiers, BFL flat rates), consult provider docs directly.

### Provider pricing pages

| Provider   | URL                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| OpenAI     | `https://developers.openai.com/api/docs/models/<model_id>`                                                  |
| Anthropic  | `https://docs.anthropic.com/en/docs/about-claude/models`                                                    |
| Google     | `https://ai.google.dev/pricing`                                                                             |
| BFL (Flux) | `https://docs.bfl.ml/pricing`                                                                               |
| fal.ai     | `https://fal.ai/models/<endpoint-id>` · pricing API: `https://fal.ai/docs/documentation/model-apis/pricing` |
| OpenRouter | `https://openrouter.ai/<vendor>/<model>`                                                                    |

### Providers & model IDs

The same model has different ids — and different availability and pricing — across
providers; an id is never portable. Two cataloguing patterns:

- **text / image / audio / image_tools** — one card = one provider; `id` is in that
  provider's format, and the `provider` field (or the namespace) fixes the route.
- **video** — the ecosystem is fragmented, so a card is **canonical** (`vendor/model`,
  e.g. `google/veo-3.1`) and carries a `providers` record (keyed by provider) of bindings,
  each with its own call id + meter. Default-provider choice is deferred (see Video Models).
  Pick a route with `video.binding(card, provider)`.

| Provider          | Used in catalogue for      | ID format / example                                                            |
| ----------------- | -------------------------- | ------------------------------------------------------------------------------ |
| Vercel AI Gateway | text, image, video binding | `google/veo-3.1-generate-001`, `bytedance/seedance-2.0`                        |
| Replicate         | audio, image_tools         | `google/lyria-3`, `nightmareai/real-esrgan`                                    |
| fal.ai            | video binding (+ image)    | `fal-ai/veo3.1`, `fal-ai/kling-video/v3/pro/image-to-video`, `fal-ai/flux/dev` |
| OpenRouter        | video binding              | `google/veo-3.1`, `google/veo-3.1-fast`, `google/veo-3.1-lite`                 |

- **Availability + price differ per provider.** **Veo 3.1 Lite** is on OpenRouter/fal.ai but **not** the Vercel gateway — a canonical card just omits the Vercel binding. Veo 3.1 audio-on is `$0.40/s` on both Vercel and fal, but fal also meters silent (`$0.20/s`) and 4K, while **OpenRouter exposes only `$0/MTok` token pricing for video — no usable per-second meter (don't invent one).**
- **fal.ai** is the broadest video/image catalogue (pay-per-use); billing unit is per-model — per-image, per-megapixel, or per-second video — retrievable from its Platform pricing API.
- Image is still Vercel-gateway-only in code; a non-Vercel image provider would mirror video's binding shape (or add a `provider` label like audio's `"replicate"`).

---

## Text Models

Live in `packages/grida-ai-models/src/models.ts` under `models.text.catalog: Record<CatalogId, ModelSpec>`. The tier set and tier→model id table sit in `packages/grida-ai-models/src/tiers.ts` and type-use `models.text.CatalogId` from `models.ts` — so every tier id must resolve to a real catalogued spec.

Fields to update per tier:

- `id` — gateway format: `provider/model-name`
- `label` — human-readable name
- `contextWindow`, `outputLimit` — from `model_info.py`
- `cost` — `{ input, output, cacheRead?, cacheWrite? }` per 1M tokens

## Image Models

Live in `packages/grida-ai-models/src/models.ts` under `models.image.models`. Editor consumers reach the same data via `import { ai } from "@/lib/ai/ai"` (a thin re-aggregator that adds `ai.toMills` and `ai.server.methods.*`).

### Pricing types

Three pricing schemes, modeled as discriminated union `ImageModelPricing`:

```
per_image_tiered  — quality x size tiers (e.g. OpenAI)
    { type: "per_image_tiered", tiers: { "medium/1024x1024": 0.034, ... } }

per_image_flat    — single price per image (e.g. BFL Flux)
    { type: "per_image_flat", usd: 0.06 }

per_token         — charged by token (e.g. Google Gemini)
    { type: "per_token", input: 0.5, output: 3.0 }
```

### Fields per model

- `pricing` — real provider data, one of the three types above
- `avg_cost_usd` — rate limiter budget cost only, not displayed to users. Mid-tier for tiered, flat rate for flat, conservative estimate for per-token.
- `min_width`, `max_width`, `min_height`, `max_height`, `sizes` — dimension constraints
- Add new model IDs to the `ImageModelId` type union

### New providers

Image generation currently routes through the Vercel AI Gateway (`gateway.image(id)`); fal.ai is the main alternative for models the gateway lacks (see Providers & model IDs). For a new provider:

- Verify the gateway supports it (or wire a new `provider` label for fal.ai / OpenRouter)
- Add to the `Vendor` type if needed
- Add a logo component and register in the `Logos` map on the models page

## Video Models

Live in `models.video.models` in `packages/grida-ai-models/src/models.ts`. The video provider ecosystem is **fragmented**, so unlike image/audio (one card = one provider) a video card is **canonical**: `id` is provider-agnostic (`vendor/model`, e.g. `google/veo-3.1`) and holds the intrinsic specs; per-provider routes live in `providers`, a record keyed by provider.

### Card shape

- **Model (intrinsic):** `id` (canonical), `label`, `vendor`, `aspect_ratios`, `min_duration`/`max_duration`, `audio`, `default` (resolution/aspect/duration/audio), `url` (original vendor's model card).
- **`providers: Partial<Record<VideoProvider, VideoProviderBinding>>`** — one binding per serving provider: `provider`, `id`, `pricing`, `avg_cost_usd`, optional `url`/`deprecated`. **No preference order** — the default-provider choice is deliberately deferred to the runtime. Look a route up with `video.binding(card, provider)`.

Cards catalogue the **image-to-video** route only (canvas-relevant; Grok's sole mode), so each binding has a single `id` — on fal the capability is keyed into the id (`fal-ai/veo3.1/image-to-video`). Don't add a per-capability `endpoints` map until a second capability is actually served: identical ids across capabilities are YAGNI, and divergent ones (other fal endpoints) are a new binding/id when needed.

`provider` is a bare routing tag — auth (incl. BYOK) is a runtime concern, not catalogue data, so there is no provider registry or `byok` flag. The catalogue's only job is to hold each provider's real id + rate.

### Cost

`avg_cost_usd` (per binding) = its rate at the model's default `(resolution, audio)` × default duration. **Video dwarfs image costs** (Veo 3.1 ≈ `$3.20` for an 8s 1080p clip) and a single clip exceeds the current `$1.00`/window budget — revisit `ratelimit.ts` before wiring video into the editor.

### Pricing (lives on the binding)

`per_second`, nested `resolution → audio-mode → USD/s`. The rate varies by both resolution **and** whether audio is generated, so the keys are the exact `(resolution, mode)` combos that provider serves & meters:

```
{ type: "per_second", usd_per_second: {
    "720p":  { audio: 0.4, silent: 0.2 },   // fal: meters both modes
    "1080p": { audio: 0.4, silent: 0.2 },
    "4k":    { audio: 0.6, silent: 0.4 },
} }
// Vercel Veo omits "4k" + "silent" (gateway sells neither); Seedance lists only "audio" (bundled free).
```

### Adding a model / route

- New model → add the canonical id to `VideoModelId` and a card with ≥1 binding. Every binding must price the model's `default` `(resolution, audio)` — enforced by catalogue-invariant tests (plus: provider field matches key).
- New route for an existing model → add a `VideoProviderBinding` under its provider key, **only with a verified rate** (e.g. OpenRouter surfaces `$0/MTok` for video — not usable; leave it out).
- New capability (e.g. text-to-video) → only when actually used. If a provider keys it into a separate id (fal), that's a new binding/id; revisit the single-`id` shape only then.

## Image Tool Models

Live in `models.image_tools.models` in `packages/grida-ai-models/src/models.ts`. Flat `cost_usd` pricing via Replicate.

## Budget System

Upstash sliding-window rate limiting. Unit: **mills** (1 mill = $0.001 USD).

- Budget: `1000` mills = $1.00 per 30-day window
- Configured in `editor/app/(api)/private/ai/ratelimit.ts`
- `ai.toMills(cost_usd)` converts USD to mills

Currently deducts `avg_cost_usd` before generation. TODO: switch to real cost tracking post-generation.

## After Any Update

- [ ] `pnpm tsc --noEmit` passes
- [ ] `docs/models/index.md` matches the code
- [ ] `/ai/models` page renders correctly
- [ ] No stale model IDs remain (grep for old IDs)
