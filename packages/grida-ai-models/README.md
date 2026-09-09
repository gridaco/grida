# @grida/ai-models

A standalone model catalog.

This package publishes typed data for AI model selection, display, release
provenance, pricing, and size validation. It does not create provider clients,
make network requests, enforce billing, or decide access. Its scope ends at
exported objects, types, and lookup helpers.

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
- Source-backed release dates shared across model families
- Image generation model cards: labels, vendors, speed hints, supported sizes,
  size constraints, defaults, and pricing
- Video generation model cards: canonical (provider-agnostic) models, each with
  per-provider bindings carrying that provider's call id and pricing
- Separate music, sound-effect, and text-to-speech catalogues with
  provider-native IO and pricing contracts
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

const imageModel = models.image.models["openai/gpt-image-2.5-flare"];
const compactImageModel = imageModel && models.image.toCompact(imageModel);
const falImageBinding = imageModel && models.image.binding(imageModel, "fal");

const musicModel = models.audio.music.models["google/lyria-3"];
const sfxModel = models.audio.sound_effects.models.eleven_text_to_sound_v2;
const voiceModel = models.audio.text_to_speech.models.eleven_v3;
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
- `release` — earliest broad public availability of the exact model or variant,
  with its basis and authoritative source URL
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
- `models.audio.text_to_speech`
- `models.three_d`
- `models.video`
- `models.image_tools`

Every bundled model card includes `release`. Public preview counts as release;
closed or limited preview does not. A model-level date is intrinsic and does
not change when a new serving provider adds a binding. Endpoint-shaped tools
may instead use `basis: "provider_endpoint"`; when their official history does
not expose an exact day, `date` is `null` rather than guessed. The base text,
image, and video types keep `release` optional only so older published
snapshots and custom model records remain readable.

Image cards can describe both preset sizes and continuous size constraints.
When both are present, `constraints` is the validation envelope and `sizes` is a
set of suggested presets or pricing anchors.

The optional `quality` field declares a model's available quality strings and
default. Consumers should read it instead of assuming every image model accepts
only `low`, `medium`, and `high`. GPT Image 2.5 Flare and Sunburst declare
`auto`, `low`, `medium`, `high`, `xhigh`, and `max`, with the fal default `high`.

The optional model-level `transparent_background` declares native alpha output:
`true` means supported, `false` means unsupported, and absence means unknown.
Each provider binding may override it with a boolean; `null` means unverified
and blocks inheritance. An omitted binding field deliberately inherits the
model declaration. Verify every bound generation endpoint and any advertised
`references.id` before inheriting support; a new provider does not gain this
capability merely by serving the same model. Background-removal postprocessing
does not count as native support.

Use `models.image.supportsTransparentBackground(card, provider)` to resolve the
declaration. It returns `true` only for a present binding whose effective value
is `true`; unsupported, unverified, and older snapshots without declarations
return `false`. The helper is pure and accepts cards from the bundled catalogue
or a parsed snapshot. Consumers must also support the provider's request mapping
and preserve alpha in their chosen output encoding.

GPT Image 2, GPT Image 2.5 Flare, and GPT Image 2.5 Sunburst declare native
transparency, inherited by their verified fal bindings and both 2.5 Vercel
bindings. Their OpenRouter bindings override this with `false` because the
published background choices exclude transparency. GPT Image 2's Vercel binding
uses `null` because its published model page does not establish support. Other
models remain unknown until their native capability and provider exposure are
verified.

Image pricing is a discriminated union:

- `per_image_tiered`: quality and size based image prices
- `per_image_flat`: one price per image
- `per_token`: token rates for input and output, with optional separate cached
  input, image input, cached image input, and `text_output` rates

Token rates are USD per million tokens. For GPT Image 2.5, `output` is the
image-output rate; `text_output`, when present, records a distinct text-output
rate. `avg_cost_usd` is a coarse invocation fallback, never a fixed per-image
price. The GPT Image 2.5 fallback of $0.055 allows for prompt input on top of
the [official high-quality 1024x1024 output estimate](https://developers.openai.com/api/docs/guides/image-generation)
of $0.05268.

`models.audio` is an organizational parent, not a callable model family.
`models.audio.music` describes Replicate Lyria with flat USD-per-run pricing;
`models.audio.sound_effects` describes ElevenLabs Sound Effects with the
provider's own credits meter (100 credits for automatic duration, or 11 credits
per second when duration is specified); and `models.audio.text_to_speech`
describes ElevenLabs v3 with its text limit, bracketed audio-tag support, MP3
output, and per-character API rate. Credits intentionally are not converted to
USD because their effective dollar value depends on the account plan. The three
catalogues deliberately share no model-card or pricing union.

Audio and 3D cards use `status: "listed" | "staged"`. `listed` means the model
has an integrated execution surface and can appear in normal user-facing
selection. `staged` means its provider id, modalities, output, and price are
grounded for a dedicated compatibility playground, but it is not yet part of
normal integrated model selection and the catalogue alone does not make the
model callable. Use `listed_models()` or `staged_models()` rather than
inferring runtime availability from presence in `models`.

Music execution accepts `models.audio.music.ModelId`; ElevenLabs SFX execution
accepts `models.audio.sound_effects.ModelId`; and ElevenLabs Text to Speech
accepts `models.audio.text_to_speech.ModelId`. There is intentionally no
broader audio model id.

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
user-facing set. Each listed card requires at least one verified, callable
binding with grounded pricing; it need not exist on every provider. Consumers
must display provider availability and resolve against the caller's configured
providers. `models.image.listed_models()` returns the curated set. Cards outside
that set retain `listed: false` and a `listed_reason`.

GPT Image 2.5 has two intrinsic cards, `openai/gpt-image-2.5-flare` and
`openai/gpt-image-2.5-sunburst`, each listed on Vercel, OpenRouter, and fal, with
Vercel as the primary provider. Vercel and OpenRouter use the canonical card id;
fal has separate generation and reference-editing ids:

| Card     | `providers.fal.id`                            | `providers.fal.references.id`        |
| -------- | --------------------------------------------- | ------------------------------------ |
| Flare    | `openai/gpt-image-2.5/flare/text-to-image`    | `openai/gpt-image-2.5/flare/edit`    |
| Sunburst | `openai/gpt-image-2.5/sunburst/text-to-image` | `openai/gpt-image-2.5/sunburst/edit` |

The fal and OpenRouter bindings set `references.max` to 16. OpenRouter accepts
references on its generation id; Vercel reference support is not declared.
Pricing stays specific to each provider: Vercel publishes text input, cached
text input, and image output rates; OpenRouter publishes text input, image
input, and image output rates; fal additionally publishes cached image input
and text output rates. No provider inherits another provider's unpublished
pricing fields.

The [fal generation schema](https://fal.ai/models/openai/gpt-image-2.5/flare/text-to-image/api)
and [editing schema](https://fal.ai/models/openai/gpt-image-2.5/sunburst/edit/api)
define the provider inputs. Desktop 0.0.22 or later exposes these models for
text-to-image generation in its playground; agent hosts can select
`image_model_id` to use their generation or advertised editing adapters, while
ordinary Desktop chat still defaults to GPT Image 2. Older clients are excluded
from selecting these cards. Vercel bindings enable Grida-hosted generation;
fal and OpenRouter also provide BYOK routes. GPT Image 2 retains its existing
multi-provider support.

Video is different: the provider ecosystem is fragmented, so a video card is
**canonical** (provider-agnostic `vendor/model` id + intrinsic specs) and holds a
`providers` record of bindings — one per serving provider (`vercel` / `fal` /
`openrouter`), each with its own call `id` and `per_second` pricing (nested
`resolution → audio-mode → USD/s`, plus any provider-published input-image
surcharge). A binding's `input` fact describes text-only generation (`text`),
required starting-image generation (`image`), or either (`text-or-image`). It
does not describe arbitrary references, ending frames, editing, or video/audio
inputs. Image modes can also accept or require a text prompt.
No default provider is encoded; resolve a route with
`models.video.binding(card, provider)` and its effective input fact with
`models.video.input(card, provider)`.

All bundled bindings carry a verified input fact. Older published snapshots
can omit it: only an exact canonical model id, provider, and binding id match
can borrow the bundled fact. A replacement binding without a fact is unknown;
removed bindings and models stay removed. Explicit `null` means unknown, and
the parser normalizes an invalid present fact to `null` while preserving the
rest of the video section. This avoids restoring bundled capabilities through
the section fallback. The helper returns `null` for unknown input support;
consumers must also apply availability, deprecation, and their own wire limits
(for example, GG currently accepts text-to-video only).

The following facts were checked against official provider documentation on
2026-09-07. Route identifiers and pricing are unchanged; a provider's generated
code snippet or input-image price alone is not evidence of input support.

| Provider   | Exact binding (source)                                                                                             | Input         |
| ---------- | ------------------------------------------------------------------------------------------------------------------ | ------------- |
| Vercel     | [google/veo-3.1-generate-001](https://vercel.com/ai-gateway/models/veo-3.1-generate-001/api)                       | text-or-image |
| Vercel     | [google/veo-3.1-fast-generate-001](https://vercel.com/ai-gateway/models/veo-3.1-fast-generate-001/api)             | text-or-image |
| Vercel     | [google/veo-3.1-lite-generate-001](https://vercel.com/ai-gateway/models/veo-3.1-lite-generate-001/faq)             | text-or-image |
| Vercel     | [alibaba/wan-v3.0-video](https://vercel.com/ai-gateway/models/wan-v3.0-video/api)                                  | text-or-image |
| Vercel     | [spacexai/grok-imagine-video-1.5](https://vercel.com/ai-gateway/models/grok-imagine-video-1.5/faq)                 | image         |
| fal        | [fal-ai/veo3.1/image-to-video](https://fal.ai/models/fal-ai/veo3.1/image-to-video/api)                             | image         |
| fal        | [fal-ai/veo3.1/fast/image-to-video](https://fal.ai/models/fal-ai/veo3.1/fast/image-to-video/api)                   | image         |
| fal        | [fal-ai/veo3.1/lite/image-to-video](https://fal.ai/models/fal-ai/veo3.1/lite/image-to-video/api)                   | image         |
| fal        | [alibaba/wan-3.0/image-to-video](https://fal.ai/models/alibaba/wan-3.0/image-to-video/api)                         | image         |
| fal        | [bytedance/seedance-2.0/image-to-video](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api)           | image         |
| fal        | [bytedance/seedance-2.5/image-to-video](https://fal.ai/models/bytedance/seedance-2.5/image-to-video/api)           | image         |
| fal        | [xai/grok-imagine-video/v1.5/image-to-video](https://fal.ai/models/xai/grok-imagine-video/v1.5/image-to-video/api) | image         |
| OpenRouter | [google/veo-3.1](https://openrouter.ai/google/veo-3.1)                                                             | text-or-image |
| OpenRouter | [bytedance/seedance-2.0](https://openrouter.ai/bytedance/seedance-2.0)                                             | text-or-image |

The video catalogue contains only models Grida can call: every card must have at
least one verified provider binding with grounded pricing and be enabled in
model selection. Announced, `listed: false`, or compatibility-only models stay
out of the catalogue until that support exists.

## Lookups

`models.text.modelSpecById(modelId)` accepts:

- Full ids, such as `openai/gpt-5.6-luna`
- Bare ids, such as `gpt-5.6-luna`
- Date-suffixed provider ids, such as `gpt-5.6-luna-2026-07-30`

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
- Ground `release` in a first-party vendor release note, changelog,
  announcement, or model card. Treat models.dev dates as discovery hints, not
  final provenance; use serving-provider history only for endpoint facts.
- Never substitute snapshot generation time, Grida insertion time, provider
  binding availability, or a later GA date for the model's first broad public
  release.
- Prefer adding explicit types before widening existing ones.

## Scripts

```sh
pnpm build
pnpm typecheck
```
