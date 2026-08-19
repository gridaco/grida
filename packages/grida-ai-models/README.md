# @grida/ai-models

A standalone model catalog.

This package publishes typed data for AI model selection, display, pricing, and
size validation. It does not create provider clients, make network requests,
enforce billing, or decide access. Its scope ends at exported objects, types,
and lookup helpers.

## Anti-goals

- Not a provider router or provider client.
- Not an inference engine for capabilities a provider did not publish.
- Not a catalogue of any particular application's encoder formats.

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
- Separate music and sound-effect catalogues with provider-native IO and
  pricing contracts
- Staged 3D generation endpoint cards for text-to-3D and image-to-3D
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
const spec = models.text.modelSpecById("claude-fable-5");

const imageModel = models.image.models["openai/gpt-image-2"];
const compactImageModel = imageModel && models.image.toCompact(imageModel);

const musicModel = models.audio.music.models["google/lyria-3"];
const sfxModel = models.audio.sound_effects.models.eleven_text_to_sound_v2;
const staged3d = models.three_d.staged_models();
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
- `imageInputMimes` — exact provider-documented image MIME types accepted as
  native model input. This list is independent of `multimodal`: a broad
  capability never manufactures exact formats, and consumers intersect it with
  the representations they can actually produce.
- `tool_call` — whether the model supports native tool/function calling
  (explicit on every entry; the agent loop is tool-heavy)
- `contextWindow`
- `outputLimit`
- `cost` — base token rates plus any provider-published request-wide
  long-context multiplier
- `deprecated` — optional Grida catalogue lifecycle marker; this does not
  imply that the upstream provider has retired the model

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
model is first-class without a price card. Custom hosts may declare
`imageInputMimes`; absence normalizes to an empty list even when `multimodal` is
true, while a non-empty exact declaration implies broad multimodal support.

```ts
const spec = models.text.registry.resolve("llama3.1:8b", customSpecs);
```

## Media Models

Media model data lives under the `models` namespace:

- `models.image`
- `models.audio.music`
- `models.audio.sound_effects`
- `models.three_d`
- `models.video`
- `models.image_tools`

Image cards can describe both preset sizes and continuous size constraints.
When both are present, `constraints` is the validation envelope and `sizes` is a
set of suggested presets or pricing anchors.

Image pricing is a discriminated union:

- `per_image_tiered`: quality and size based image prices
- `per_image_flat`: one price per image
- `per_token`: token rates for input and output

`models.audio` is an organizational parent, not a callable model family.
`models.audio.music` describes Replicate Lyria with flat USD-per-run pricing;
`models.audio.sound_effects` describes ElevenLabs Sound Effects with the
provider's own credits meter (100 credits for automatic duration, or 11 credits
per second when duration is specified). Credits intentionally are not converted
to USD because their effective dollar value depends on the account plan. The
two catalogues deliberately share no model-card or pricing union.

Audio and 3D cards use `status: "listed" | "staged"`. `listed` means the model
has an integrated execution surface and can appear in normal user-facing
selection. `staged` means its provider id, modalities, output, and price are
grounded for a dedicated compatibility playground, but it is not yet part of
normal integrated model selection and the catalogue alone does not make the
model callable. Use `listed_models()` or `staged_models()` rather than
inferring runtime availability from presence in `models`.

Music execution accepts `models.audio.music.ModelId`; ElevenLabs SFX execution
accepts `models.audio.sound_effects.ModelId`. There is intentionally no broader
audio model id.

### 3D models

`models.three_d` currently contains fal-only, staged endpoint cards:

- Hunyuan 3D v3.1 Pro text-to-3D
- Hunyuan 3D v3.1 Pro image-to-3D
- TRELLIS.2 image-to-3D

The card id is the exact fal endpoint id. Hunyuan guarantees a GLB result and
may also return FBX, OBJ, or USDZ entries; TRELLIS.2 guarantees GLB. Pricing is
also endpoint-shaped: Hunyuan stores its base generation price plus additive
option surcharges, while TRELLIS.2 stores its 512/1024/1536 resolution tiers.
No default provider selection or inference client lives in this package.

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
`resolution → audio-mode → USD/s`, plus any provider-published input-image
surcharge). Cards catalogue the image-to-video route only.
No default provider is encoded; resolve a route with
`models.video.binding(card, provider)`.

The video catalogue contains only models Grida can call: every card must have at
least one verified provider binding with grounded pricing and be enabled in
model selection. Announced, `listed: false`, or compatibility-only models stay
out of the catalogue until that support exists.

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

To add or update a text model (or any image / audio / 3D / video / image-tool
model), edit `src/models.ts`. That file is the central catalogue and also the
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
