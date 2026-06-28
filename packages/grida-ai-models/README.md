# @grida/ai-models

A standalone model catalog.

This package publishes typed data for AI model selection, display, pricing, and
size validation. It does not create provider clients, make network requests,
enforce billing, or decide access. Its scope ends at exported objects, types,
and lookup helpers.

## Related

- [Model pricing docs](https://grida.co/docs/models/pricing)
- [AI models catalog](https://grida.co/ai/models)

## Contents

- Agentic model: `nano`, `mini`, `pro`, and `max`
- Text model specs: labels, modality, context windows, output limits, and token
  pricing
- Image generation model cards: labels, vendors, speed hints, supported sizes,
  size constraints, defaults, and pricing
- Video generation model cards: canonical (provider-agnostic) models, each with
  per-provider bindings carrying that provider's call id and pricing
- Audio generation model cards
- Image tool model cards, such as background removal and upscaling
- Shared discriminator types for providers, vendors, speed labels, and pricing
  schemes

## Usage

The package's primary export is the `models` namespace, available as either
a default or a named import. `TIER_MODEL_IDS` plus the `ModelTier` /
`TierModelId` types live at the top level alongside it.

```ts
import models, { TIER_MODEL_IDS } from "@grida/ai-models";

const proModelId = TIER_MODEL_IDS.pro;
const proModel = models.text.byTier.pro;
const spec = models.text.modelSpecById("claude-sonnet-4.6");

const imageModel = models.image.models["openai/gpt-image-2"];
const compactImageModel = imageModel && models.image.toCompact(imageModel);

const audioModel = models.audio.models["google/lyria-3"];
const upscaleTool = models.image_tools.models["nightmareai/real-esrgan"];
```

## Text Models

Text models live under `models.text` and are split into two tables:

- `TIER_MODEL_IDS`: maps each `ModelTier` to a model id (top-level export
  from `./tiers`)
- `models.text.catalog`: maps model ids to `models.text.ModelSpec` objects

`models.text.byTier` is derived from those two tables and exposes the
resolved `Record<ModelTier, ModelSpec>`.

Each `ModelSpec` contains:

- `id`
- `label` — full human-readable name (e.g. `"Claude Opus 4.8"`)
- `short_label` — optional, manually-curated compact name for space-constrained
  UI (e.g. `"Opus 4.8"`); falls back to `label` when unset
- `multimodal`
- `tool_call` — whether the model supports native tool/function calling
  (explicit on every entry; the agent loop is tool-heavy)
- `contextWindow`
- `outputLimit`
- `cost`

Token costs are stored as USD per 1 million tokens.

For UI that needs the compact name, call `models.text.displayLabel(spec)` — it
returns `short_label` when present and `label` otherwise, so call sites never
repeat the fallback.

### Open registry (`models.text.registry`)

`models.text.registry` is the seam for **user-registered models** the static
catalogue does not know — local Ollama models, self-hosted OpenAI-compatible
gateways. A `CustomModelSpec` needs only an `id`; `normalize` fills
conservative defaults (8k context, tool-calling assumed) and
`resolve(id, custom)` looks an id up over catalogue ∪ custom (the catalogue
wins on collision). `cost` is optional on custom specs by design — a local
model is first-class without a price card.

```ts
const spec = models.text.registry.resolve("llama3.1:8b", customSpecs);
```

## Media Models

Media model data lives under the `models` namespace:

- `models.image`
- `models.audio`
- `models.video`
- `models.image_tools`

Image cards can describe both preset sizes and continuous size constraints.
When both are present, `constraints` is the validation envelope and `sizes` is a
set of suggested presets or pricing anchors.

Image pricing is a discriminated union:

- `per_image_tiered`: quality and size based image prices
- `per_image_flat`: one price per image
- `per_token`: token rates for input and output

Audio models currently use flat per-run pricing. Image tools use flat
per-invocation pricing.

Image cards are multi-homed like video: each card holds a `providers` record of
bindings — one per serving provider (`vercel` / `fal` / `openrouter`), each with
that provider's own call `id` and pricing — alongside a top-level `provider` +
`pricing` that name the **primary/default** binding (kept for the legacy
single-provider readers). Resolve a route with
`models.image.binding(card, provider)`. A `listed` boolean marks the curated,
user-facing set (proprietary · SOTA · **universal**, so one BYOK key serves the
whole list); non-universal/legacy cards stay in the catalog with `listed: false`
and a `listed_reason`. `models.image.listed_models()` returns the curated set.

Video is different: the provider ecosystem is fragmented, so a video card is
**canonical** (provider-agnostic `vendor/model` id + intrinsic specs) and holds a
`providers` record of bindings — one per serving provider (`vercel` / `fal` /
`openrouter`), each with its own call `id` and `per_second` pricing (nested
`resolution → audio-mode → USD/s`). Cards catalogue the image-to-video route only.
No default provider is encoded; resolve a route with
`models.video.binding(card, provider)`.

## Lookups

`models.text.modelSpecById(modelId)` accepts:

- Full ids, such as `openai/gpt-5.4-mini`
- Bare ids, such as `gpt-5.4-mini`
- Date-suffixed provider ids, such as `gpt-5.4-mini-2025-08-07`

`models.image.findImageModelCard(model)` accepts:

- Full image model ids
- Bare image model ids when the match is unambiguous
- The deprecated `{ provider, modelId }` wrapper shape

## Updating The Catalog

To add or update a text model (or any image / audio / video / image-tool model),
edit `src/models.ts`. That file is the central catalogue and also the
type source — `models.text.CatalogId` is derived from the text-model table.

To change a tier mapping, update `TIER_MODEL_IDS` in `src/tiers.ts`. The
mapped id must already exist in the text catalogue; the compiler enforces
this because `TIER_MODEL_IDS` is typed against `models.text.CatalogId`.

Keep the stored data literal and portable:

- Use model ids as stable keys.
- Store real published prices, not application-specific estimates, except for
  `avg_cost_usd`, which is explicitly a coarse invocation estimate.
- Keep provider and vendor values as data labels. This package should not
  import SDKs or contain routing logic.
- Prefer adding explicit types before widening existing ones.

## Scripts

```sh
pnpm build
pnpm typecheck
```
