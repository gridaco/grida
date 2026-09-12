# @grida/ai-models

Canonical model facts and pure lookup helpers: identities, source-backed release
provenance, provider bindings, capabilities, IO limits, and published prices.

The root entry owns factual data. Grida service membership, preferences, tiers
and the schema-1 catalog live in the same package behind the explicit
`@grida/ai-models/grida` entry. The root never imports or re-exports that entry.

## Root-entry anti-goals

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
`three_d.models`, `three_d.model_generation.models`, and `image_tools.models`. Their declaration order has no
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
belong to `@grida/ai-models/grida`. Source consumers select that entry explicitly;
schema-1 wire compatibility remains owned by its service catalog. Both entries
share one private package lifecycle; independent publication is not required.

## Grida service entry

`@grida/ai-models/grida` joins stable model IDs to the package's canonical facts,
exposing ordered service views and the compatible schema-1 distribution protocol.

### Authoring homes

| Decision                                                                          | Authoring file                                |
| --------------------------------------------------------------------------------- | --------------------------------------------- |
| Identity, capability, provenance, bindings, published prices                      | `src/models.ts`                               |
| Membership, listed/staged status, legacy, primary image binding, request defaults | `src/grida/catalog.ts`, `catalog.definitions` |
| Independent optional default model and partial order per family                   | `src/grida/preferences.ts`                    |
| Text tier assignments                                                             | `src/grida/tiers.ts`                          |
| Schema-1 projection, parser, resolved snapshot views                              | `src/grida/catalog.ts`, `catalog.snapshot`    |

Adding a factual model does not add it to the service. Removing a service member
does not delete its factual record. Legacy is a product decision, not upstream
retirement. Resolved compatibility cards expose it as `deprecated`; definitions
and the general policy view use `legacy`. Binding-level `deprecated` remains
upstream metadata.

### Public surface

```ts
import { catalog, TIER_MODEL_IDS } from "@grida/ai-models/grida";

const candidates = catalog.image.listed_models();
const recommendation = catalog.image.default_id;
const completeReference = catalog.image.ordered_models();
const pro = catalog.text.byTier.pro;
const serialized = JSON.stringify(
  catalog.snapshot.seed({ version: "deploy-sha" })
);
```

Families are `text`, `image`, `video`, `audio.music`, `audio.sound_effects`,
`audio.text_to_speech`, `three_d`, `three_d.model_generation`, and `image_tools`. Their neutral public
types/helpers remain available for migration convenience. Factual consumers
should import the factual producer directly. Library embedding is not re-exported.

Every family has `ordered_models()` for all members. `listed_models()` selects
integrated members; `staged_models()` selects staged members on families that
have that surface. Filtering retains relative order. Declaration order has no
recommendation meaning.

The algorithm places an explicit default first, active members next, legacy
members last. Inside each group, optional partial order precedes stable label
then ID comparison. Unknown/repeated order IDs fail validation. A default must
be listed and nonlegacy; omission stays absent. No default is inferred from
ordering. Snapshot recommendations are resolved against the same effective
membership as that snapshot's view.

Image starts with GPT Image 2.5 Flare, then Sunburst. Video and music retain
Veo 3.1 and Lyria 3. Staged 3D playgrounds retain their initial choices through
explicit order without making staged models listed defaults. Text's service
recommendation is Terra; callers with an explicit tier choice, such as `pro`,
keep that choice. Recommendations and sorting never replace saved user choices
or grant permission to execute a model.

### Independent policy resolution

`catalog.policy.resolve(facts, definition)` validates membership and returns an
owned immutable `models` table, `listed()`, `staged()`, `all()`, and optional
`default_id`. It copies nested input values before freezing, so neither side
can mutate the other. Policy cannot overwrite factual identity, capability,
or price fields.

```ts
const view = catalog.policy.resolve(
  { a: { id: "a", label: "A" } },
  {
    members: { a: { status: "listed" } },
    default_id: "a",
  }
);
```

This is a service policy resolver, not a third generic catalog package. Tests
show independent services selecting/ordering/deprecating identical facts.

### Schema-1 compatibility

`catalog.snapshot.seed()`, `.parse(unknown)`, and `.view(snapshot?)` retain the
established text/image/video wire shape. Required media policy fields, request
defaults, image primary provider, and existing prices remain projected. Optional
additive `preferences` carries text/image/video default IDs and partial order;
old parsers ignore it. New parsers reject inconsistent recommendation references.

Membership comes from explicit service definitions, never the full factual
registry. Text/video publish listed members; image retains its existing broad
GG/BYOK member coverage, including unlisted legacy choices. Listing does not
prove adapter support; legacy does not withdraw execution. Withdrawing a broad
image gate member requires an explicit membership removal. Provider bindings
and prices are unchanged.

Text and tiers replace their section wholesale. Media remains independently
fallible for installed-client compatibility. Invalid media sections and their
associated recommendations are discarded together, preserving valid text and
the bundled media fallback. Older absent recommendations stay absent. A view
copies/freezes its effective snapshot so input mutation cannot change it.

### Anti-goals and staged follow-up

- No duplicated factual prices/capabilities, network fetches, credentials,
  clients, billing enforcement, or UI state.
- No reverse dependency or service exports through the factual root entry.
- No adapter support inferred from a binding or recommendation.
- No Library embedding-storage policy or new billing estimate owner.

A later effective-agent-snapshot UI transport can publish the active view.
A genuinely atomic, separately versioned service envelope remains its own wire
phase; schema-1's independent media fallback is not atomic. Billing estimates
and Library's persisted embedding contract each need their own extraction.
None of those follow-up phases is implemented by this package.

## Verification

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm test:package
```

### 3D model-generation features

`models.three_d.model_generation.models` contains one card per direct Tripo
model: `tripo/h3.1`, `tripo/p1`, and `tripo/p2` (Preview). These cards keep the
`model-generation` feature separate from the model identity and its accepted
`text`, `image`, and `multiview` input variants. `binding_id` records the exact
upstream snapshot. The existing `models.three_d.models` fal endpoint catalogue
remains available for its existing consumers.

Cards describe native generation facts: default uncompressed GLB output,
texture tiers, face-count bounds, and H3.1-only geometry quality. They do not
grant application support for quad output, remeshing, or rigging. Capabilities
come from current [H-series](https://developers.tripo3d.ai/en/docs/generation-text-to-model/standard)
and [P-series](https://developers.tripo3d.ai/en/docs/generation-text-to-model/p)
API contracts. `@grida/ai` owns native and JSON validation and execution.

Grida admission lives in `catalog.three_d.model_generation` from the `/grida`
entry. Its service definition lists these three models; its independent
preference chooses H3.1 as the default, followed by P1 and P2. Use
`listed_models()` and `default_id` for product selection. The factual entry
contains no listing status, recommendation, or display order. Schema-1 snapshots
still distribute text/image/video; model-generation service membership remains
bundled.

Pricing retains provider credits rather than inventing one flat price per model.
`base_credits` is the untextured cost by input variant. `texture_credits` is the
additive total for the selected texture tier; `detailed_geometry_credits` is
additive for H3.1 detailed geometry. One credit is $0.01. The
[current pricing page](https://developers.tripo3d.ai/en/pricing), including its
P Series tab, is the source. These are catalogue prices, not reservations,
affordability checks, or observed usage. Release provenance records the public
model announcements, including P2's public preview date, rather than interpreting
snapshot ID suffixes as release dates.

### Rig eligibility and rigging

`models.three_d.rig_check.operation` records the model-less eligibility endpoint,
its supported rig types, GLB input, and published free price. It is an operation
fact rather than a fabricated model card. `models.three_d.rigging.models` contains
`tripo/rig-v1.0` and `tripo/rig-v2.5`, bound to the exact upstream versions
`v1.0-20240301` and `v2.5-20260210`.

The [rigging compatibility table](https://developers.tripo3d.ai/en/docs/animations-rig)
limits v1.0 to humanoid bipeds and v2.5 to the six creature rig types. Both list
Tripo and Mixamo naming specs and GLB/FBX output. These are provider facts, not
proof of support for every file format in Grida. The SDK independently admits
bounded self-contained GLB bytes and returns GLB only. Rigging rates come from
the [pricing table](https://developers.tripo3d.ai/en/pricing): 25 credits at $0.01
per credit. The table takes precedence over the older 30-credit response sample.
Release days remain unknown with endpoint provenance; snapshot suffixes are not
assumed to be first-public-release dates.

`catalog.three_d.rigging` separately lists the implemented models, with explicit
order and no default model: the source mesh determines compatible rig choices.
`catalog.three_d.rig_check.operation` separately adds the check service status.
These families remain bundled and do not change the schema-1 distribution
protocol. Checks remain structured findings, distinct from generated media.
