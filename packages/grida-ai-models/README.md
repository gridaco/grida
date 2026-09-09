# @grida/ai-models

Canonical model facts and pure lookup helpers: identities, source-backed release
provenance, provider bindings, capabilities, IO limits, and published prices.

Grida service membership and preferences belong to the private sibling
[`@app/ai-catalog`](../grida-ai-catalog/README.md). This package has no reverse
dependency or service re-export.

## Anti-goals

- No product membership, staging, legacy decisions, tier assignments, display
  order, recommended model, primary provider, or generation request defaults.
- No provider clients, network requests, credentials, authorization, adapter
  support inference, or billing enforcement.
- No publication of the full factual registry through a product execution gate.
- No application encoder formats inferred from broad model capabilities.

## Public surface

```ts
import { models } from "@grida/ai-models";

const spec = models.text.modelSpecById("gpt-5.6-luna");
const image = models.image.models["openai/gpt-image-2.5-flare"];
const fal = image && models.image.binding(image, "fal");
```

Records live under `text.catalog`, `image.models`, `video.models`,
`audio.music.models`, `audio.sound_effects.models`, `audio.text_to_speech.models`,
`three_d.models`, and `image_tools.models`. Their declaration order has no
preference meaning. Bundled tables, cards, and nested values are frozen at
runtime. Lookup does not imply an application has an adapter for a binding.

Text lookup accepts exact namespaced, bare, and date-suffixed provider IDs.
Its optional second argument supplies an explicit spec array for a narrower
registry. `text.registry.resolve(id, custom, specs?)` likewise accepts a
caller-owned subset; built-ins win collisions, custom IDs match exactly.
`registry.normalize` supplies conservative missing context/output assumptions
for custom models; their costs remain optional. `text.displayLabel` uses the
compact label when present.

Image lookup accepts exact or bare names and the older `{provider, modelId}`
wrapper. `image.binding` and `video.binding` retrieve one named provider's
record without choosing a provider.

## Authoring facts

Edit `src/models.ts` for model facts. Do not edit facts to change which models
Grida lists.

Each built-in includes `release: {date, basis, source_url}`. Dates mean the exact
model's first broad public availability; public preview counts, closed preview
does not. A new serving provider does not change an intrinsic release.
`basis: "provider_endpoint"` describes endpoint history; `date: null` is allowed
only there when the exact day is unknown. An authoritative HTTPS source is
required. Snapshot time and Grida insertion time are not release dates. Base
types keep release optional for older/custom records.

Text rates use USD per million tokens. `imageInputMimes` records exact published
input MIME types independently of the broad `multimodal` capability.

Image constraints form the size-validation envelope; `sizes` supplies presets
and pricing anchors. `quality` records provider-documented values and a native
default, not a product model choice or request dimensions. Native transparency
is resolved by `supportsTransparentBackground(card, provider)`: a binding's
boolean overrides the model, `null` masks inheritance as unverified, and an
omitted declaration inherits the model. Missing bindings never grant support.

Image pricing may be tiered, flat, or per-token. Published model-level prices
remain distinct from provider-binding prices. GPT Image 2's model-level table,
for example, includes rectangular image tiers and token components absent from
its Vercel binding. No primary-provider preference is stored on factual cards.

Video cards identify canonical models and exact image-to-video provider routes.
Each binding has its own resolution/audio price matrix and any input-image
surcharge. Music, sound effects, and speech retain separate IDs, IO, and meters;
provider credits are not converted to USD without an account plan. 3D uses exact
endpoint IDs, distinct text/image inputs, guaranteed outputs, surcharges, and
resolution price tiers. Provider-native output/default-resolution declarations
remain factual API metadata.

## Isolated compatibility surfaces

These existing fields remain for bounded follow-up, not as precedent for adding
product policy:

- `provider-options.ts` retains `GridaCallProviderOptions` and
  `gridaProviderOptions`, Grida billing-organization attribution helpers. They
  are a billing compatibility surface, not provider-native model vocabulary;
  their extraction belongs to a separate billing-contract change.
- `avg_cost_usd` values are historical coarse invocation estimates used by
  billing consumers, not published price facts. This extraction leaves their
  numbers unchanged. Move/replace them through a dedicated billing-contract
  change with served-request metering tests.
- `models.embedding` retains Library's persisted dimensions, normalization,
  `LIBRARY_EMBEDDING_MODEL_ID`, and `LIBRARY_EMBEDDING_DIMENSIONS` consistency
  pins. Its estimated price remains explicitly provisional. Extracting that
  storage contract requires coordinating query/document embedders and existing
  vectors; it is not service model-selection work.

`models.snapshot`, tiers, product lifecycle fields, and listed/staged helpers
have moved to `@app/ai-catalog`. Source consumers migrate explicitly; schema-1
wire compatibility is maintained by the service owner.

## Verification

```sh
pnpm test
pnpm typecheck
pnpm build
```
