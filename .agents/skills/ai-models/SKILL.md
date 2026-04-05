---
name: ai-models
description: >
  Research, compare, and update AI model configurations.
  Covers text model tiers, image generation models, image tool models, pricing
  data sourcing, and the budget/rate-limit system.
  Use when bumping model versions, adding new models, updating pricing, or
  auditing model specs against provider documentation.
---

# AI Models — Research & Update Workflow

## When to Use This Skill

- Bumping a text or image model to a newer version
- Adding a new image generation model or provider
- Updating pricing data (per-token, per-image flat, per-image tiered)
- Verifying model specs (context window, output limit, cost) against providers
- Auditing the budget/rate-limit system

---

## Key Files

| File                                       | Role                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| `editor/lib/ai/models.ts`                  | Text model tiers (nano/mini/pro/max), gateway config, `ModelSpec` type |
| `editor/lib/ai/ai.ts`                      | Image model registry, image tool models, pricing types, `toMills()`    |
| `editor/app/(api)/private/ai/ratelimit.ts` | Budget enforcement (Upstash sliding window, mills)                     |
| `editor/app/(www)/(ai)/ai/models/page.tsx` | Public models catalog page                                             |
| `docs/models/index.md`                     | User-facing models & pricing documentation                             |

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

| Provider   | URL                                                        |
| ---------- | ---------------------------------------------------------- |
| OpenAI     | `https://developers.openai.com/api/docs/models/<model_id>` |
| Anthropic  | `https://docs.anthropic.com/en/docs/about-claude/models`   |
| Google     | `https://ai.google.dev/pricing`                            |
| BFL (Flux) | `https://docs.bfl.ml/pricing`                              |

---

## Text Models

Live in `editor/lib/ai/models.ts` as `Record<ModelTier, ModelSpec>`.

Fields to update per tier:

- `id` — gateway format: `provider/model-name`
- `label` — human-readable name
- `contextWindow`, `outputLimit` — from `model_info.py`
- `cost` — `{ input, output, cacheRead?, cacheWrite? }` per 1M tokens

## Image Models

Live in `editor/lib/ai/ai.ts` under `ai.image.models`.

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

All image generation routes through the Vercel AI Gateway (`gateway.image(id)`). For a new provider:

- Verify the gateway supports it
- Add to the `Vendor` type if needed
- Add a logo component and register in the `Logos` map on the models page

## Image Tool Models

Live in `ai.image_tools.models` in `editor/lib/ai/ai.ts`. Flat `cost_usd` pricing via Replicate.

## Budget System

Upstash sliding-window rate limiting. Unit: **mills** (1 mill = $0.001 USD).

- Budget: `1000` mills = $1.00 per 30-day window
- Configured in `editor/app/(api)/private/ai/ratelimit.ts`
- `ai.toMills(cost_usd)` converts, `ai.millsToUSD(mills)` formats

Currently deducts `avg_cost_usd` before generation. TODO: switch to real cost tracking post-generation.

## After Any Update

- [ ] `pnpm tsc --noEmit` passes
- [ ] `docs/models/index.md` matches the code
- [ ] `/ai/models` page renders correctly
- [ ] No stale model IDs remain (grep for old IDs)
