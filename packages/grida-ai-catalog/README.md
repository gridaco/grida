# @app/ai-catalog

Grida's private, pure service model catalog. It joins stable model IDs to
canonical facts from [`@grida/ai-models`](../grida-ai-models/README.md), exposing
ordered service views and the compatible schema-1 distribution protocol.

## Authoring homes

| Decision                                                                          | Authoring file                          |
| --------------------------------------------------------------------------------- | --------------------------------------- |
| Identity, capability, provenance, bindings, published prices                      | `@grida/ai-models/src/models.ts`        |
| Membership, listed/staged status, legacy, primary image binding, request defaults | `src/catalog.ts`, `catalog.definitions` |
| Independent optional default model and partial order per family                   | `src/preferences.ts`                    |
| Text tier assignments                                                             | `src/tiers.ts`                          |
| Schema-1 projection, parser, resolved snapshot views                              | `src/catalog.ts`, `catalog.snapshot`    |

Adding a factual model does not add it to the service. Removing a service member
does not delete its factual record. Legacy is a product decision, not upstream
retirement. Resolved compatibility cards expose it as `deprecated`; definitions
and the general policy view use `legacy`. Binding-level `deprecated` remains
upstream metadata.

## Public surface

```ts
import { catalog, TIER_MODEL_IDS } from "@app/ai-catalog";

const candidates = catalog.image.listed_models();
const recommendation = catalog.image.default_id;
const completeReference = catalog.image.ordered_models();
const pro = catalog.text.byTier.pro;
const serialized = JSON.stringify(
  catalog.snapshot.seed({ version: "deploy-sha" })
);
```

Families are `text`, `image`, `video`, `audio.music`, `audio.sound_effects`,
`audio.text_to_speech`, `three_d`, and `image_tools`. Their neutral public
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

## Independent policy resolution

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

## Schema-1 compatibility

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

## Anti-goals and staged follow-up

- No duplicated factual prices/capabilities, network fetches, credentials,
  clients, billing enforcement, or UI state.
- No reverse dependency or service exports through `@grida/ai-models`.
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
```
