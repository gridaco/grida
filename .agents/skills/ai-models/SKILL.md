---
name: ai-models
description: >
  Research, compare, and update AI model configurations.
  Covers text model tiers, image and video generation models, image tool models,
  release provenance, pricing data sourcing, and provider-cost metering against prepaid org credit.
  Use when bumping model versions, adding new models, updating pricing, or
  auditing model specs against provider documentation.
---

# AI Models — Research & Update Workflow

## When to Use This Skill

- Bumping a text, image, or video model to a newer version
- Adding a new image/video generation model or provider (Vercel gateway, Replicate, fal.ai)
- Updating pricing data (per-token, per-image flat, per-image tiered, per-second)
- Verifying model specs (context window, output limit, cost) against providers
- Grounding a model's first broad public release date and source
- Auditing hosted usage metering against prepaid organization credit

---

## Key Files

| File                                       | Role                                                                                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/grida-ai-models/src/models.ts`   | Central catalogue. Sole export is the `models` namespace: `models.text` (`ModelSpec`, `catalog`, `byTier`, `modelSpecById`), `models.image`, `models.audio`, `models.video`, `models.image_tools` |
| `packages/grida-ai-models/src/tiers.ts`    | `ModelTier` set + `TIER_MODEL_IDS` (type-uses `models.text.CatalogId` from `models.ts`)                                                                                                           |
| `editor/lib/ai/models.ts`                  | AI Gateway + BYOK provider seam (catalogue is re-exported from `@grida/ai-models`)                                                                                                                |
| `editor/lib/ai/ai.ts`                      | `toMills()` + Replicate call shapes; re-aggregates the shared catalogue under `ai.*`                                                                                                              |
| `editor/lib/ai/server.ts`                  | AI seam: prepaid-credit gate, provider call, and post-flight usage ingest                                                                                                                         |
| `editor/lib/billing/metronome.ts`          | Organization credit entitlement, cached balance gate, and Metronome usage ledger                                                                                                                  |
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

Discovery source: `models.dev/api.json`. Accepts exact IDs (`anthropic/claude-sonnet-4.6`) or substring search (`gpt-5.4`). Its `release_date` is a lead to verify, not authoritative provenance to copy into the catalogue.

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

- **text / audio / image_tools / 3D** — one card = one provider or exact endpoint;
  `id` is in that provider's format, and the `provider` field (or namespace) fixes the route.
- **image** — one intrinsic card carries per-provider bindings, like video, plus a
  primary provider retained for older single-provider consumers.
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
- Image cards are multi-homed across Vercel, fal, and OpenRouter where verified;
  `listed` cards must retain the catalogue's one-key/universal-provider promise.

---

## What the catalogue is for

The catalogue states what is true and useful **now**. Its shape must never be a
record of how recently someone got round to updating it — a stale entry is a
wrong answer, not a conservative one.

- **Price the steady state, not the promotion.** When a vendor runs an
  introductory or time-limited rate, catalogue the price that applies once it
  ends and note the date in a comment. Otherwise the promotion expiring is a
  silent cost increase. Recheck when that date passes: a promotion can also be
  made permanent, which changes the fact, not the rule.
- **Deprecate a card that is still a real choice; remove one that is not.**
  `deprecated: true` is for a model someone might still reasonably pick — same
  price as its successor, or better at something. Delete the entry when the
  successor is _strictly dominant_ (never worse on any axis, better on at least
  one): a card nobody should choose is noise in every picker, and keeping it is
  not caution.

Removal is the kill switch — the id stops passing the run gate, and on a
published catalogue that reaches installed clients within a refresh interval
(`docs/wg/platform/hosted-ai.md`). That decisiveness is the point; it also means
removal is the wrong tool for tidying.

## Release dates and provenance

Every bundled entry carries a `release` object:

```ts
{
  date: "2026-07-09", // YYYY-MM-DD, or null only when an endpoint day is unknown
  basis: "model", // or "provider_endpoint"
  source_url: "https://vendor.example/release-note"
}
```

The date means the earliest day the exact named model or variant became broadly
available. A public preview counts; a closed, invitation-only, or limited
preview does not. This is intrinsic model metadata, so adding a provider binding
does not change a `basis: "model"` release. Use `basis: "provider_endpoint"`
only when the release fact describes a serving route because no exact upstream
model launch can be established. An endpoint-shaped card may still use
`basis: "model"` when its exact underlying model and launch are documented.

Do not substitute any of these:

- snapshot `generated_at`
- the date Grida added the card
- the date one provider added a binding
- a later GA date when an exact public preview date exists
- an API object's opaque `created` timestamp

Source priority for release facts:

1. Vendor release note, changelog, announcement, or model card that names the exact variant.
2. Vendor-maintained repository or official provider documentation for the exact endpoint.
3. First-party vendor social announcement when no durable release page exists.
4. Serving-provider history, only for `basis: "provider_endpoint"` or when the vendor has no usable record.
5. `models.dev` only to discover candidates; verify its date against one of the sources above.

If no authoritative source establishes the exact day, keep `date: null` with an
HTTPS source showing the endpoint's history. Never infer a day from search-result
ordering, repository commit time, or Grida history. Base snapshot types keep the
field optional solely for older snapshots and custom models; every bundled card
must include it, and tests enforce valid calendar dates, complete provenance,
and the narrow `null` rule.

## Text Models

Live in `packages/grida-ai-models/src/models.ts` under `models.text.catalog: Record<CatalogId, ModelSpec>`. The tier set and tier→model id table sit in `packages/grida-ai-models/src/tiers.ts` and type-use `models.text.CatalogId` from `models.ts` — so every tier id must resolve to a real catalogued spec.

Fields to update per tier:

- `id` — gateway format: `provider/model-name`
- `label` — human-readable name
- `release` — grounded date, basis, and first-party source under the contract above
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
- `avg_cost_usd` — fallback billable-cost estimate, not displayed to users. Mid-tier for tiered, flat rate for flat, conservative estimate for per-token.
- `release` — intrinsic model release; do not use a provider-binding date
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

- **Model (intrinsic):** `id` (canonical), `label`, `release`, `vendor`, `aspect_ratios`, `min_duration`/`max_duration`, `audio`, `default` (resolution/aspect/duration/audio), `url` (original vendor's model card).
- **`providers: Partial<Record<VideoProvider, VideoProviderBinding>>`** — one binding per serving provider: `provider`, `id`, `pricing`, `avg_cost_usd`, optional `url`/`deprecated`. **No preference order** — the default-provider choice is deliberately deferred to the runtime. Look a route up with `video.binding(card, provider)`.

Cards catalogue the **image-to-video** route only (canvas-relevant; Grok's sole mode), so each binding has a single `id` — on fal the capability is keyed into the id (`fal-ai/veo3.1/image-to-video`). Don't add a per-capability `endpoints` map until a second capability is actually served: identical ids across capabilities are YAGNI, and divergent ones (other fal endpoints) are a new binding/id when needed.

`provider` is a bare routing tag — auth (incl. BYOK) is a runtime concern, not catalogue data, so there is no provider registry or `byok` flag. The catalogue's only job is to hold each provider's real id + rate.

### Cost

`avg_cost_usd` (per binding) = its rate at the model's default `(resolution, audio)` × default duration, plus any required input-image surcharge. **Video dwarfs image costs** (Veo 3.1 ≈ `$3.20` for an 8s 1080p clip). The current prepaid-credit gate checks a global balance floor, not an estimated per-request ceiling, so audit metering and bounded-overspend exposure before serving a new video route.

### Pricing (lives on the binding)

`per_second`, nested `resolution → audio-mode → USD/s`, with an optional
provider-native `usd_per_input_image` surcharge. The rate varies by both
resolution **and** whether audio is generated, so the keys are the exact
`(resolution, mode)` combos that provider serves & meters:

```
{ type: "per_second", usd_per_second: {
    "720p":  { audio: 0.4, silent: 0.2 },   // fal: meters both modes
    "1080p": { audio: 0.4, silent: 0.2 },
    "4k":    { audio: 0.6, silent: 0.4 },
} }
// Vercel Veo omits "4k" + "silent" (gateway sells neither); Seedance lists only "audio" (bundled free).
```

### Adding a model / route

- Catalogue boundary: never add or list a model Grida cannot call. A model
  requires at least one verified provider binding with grounded pricing;
  announcements, `listed: false`, and compatibility-only records stay out
  entirely.
- New model → add the canonical id to `VideoModelId` and a card with ≥1 binding. Every binding must price the model's `default` `(resolution, audio)` — enforced by catalogue-invariant tests (plus: provider field matches key).
- New route for an existing model → add a `VideoProviderBinding` under its provider key, **only with a verified rate** (e.g. OpenRouter surfaces `$0/MTok` for video — not usable; leave it out).
- New capability (e.g. text-to-video) → only when actually used. If a provider keys it into a separate id (fal), that's a new binding/id; revisit the single-`id` shape only then.

## Image Tool Models

Live in `models.image_tools.models` in `packages/grida-ai-models/src/models.ts`. Flat `cost_usd` pricing via Replicate.

## Hosted Usage Metering

Grida Gateway (GG) usage is metered against the organization's prepaid AI
credit. Unit: **mills** (1 mill = $0.001 USD).

- `ai.toMills(cost_usd)` converts a provider cost to the integer usage unit.
- The AI seam checks the organization's cached credit entitlement before the
  provider call and ingests usage into Metronome after the call.
- Text uses observed token usage. Media routes use verified catalogue pricing
  for the served request, with `avg_cost_usd` only where the provider does not
  expose a more exact billable dimension.
- The current gate is a global balance floor. There is no per-model
  provider-cost budget; do not invent one when updating a card.
- BYOK text calls bypass GG metering because the user pays the provider
  directly. Hosted media remains billable unless its route explicitly uses a
  supported BYOK provider.

## After Any Update

- [ ] Every bundled model has a complete `release`; date semantics and source priority were followed
- [ ] `models.dev` dates were treated as discovery hints and verified against authoritative sources
- [ ] `pnpm tsc --noEmit` passes
- [ ] `docs/models/index.md` matches the code
- [ ] `/ai/models` page renders correctly
- [ ] No stale model IDs remain (grep for old IDs)
