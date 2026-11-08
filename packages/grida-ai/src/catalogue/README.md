# Client catalogue and product presets

`@grida/ai/catalogue` contains the lookup types and projections used by Grida's
installed adapters and product defaults. It is not the public GG model inventory.

- Model facts come from the exact published `@grida/ai-models` dependency.
- `data/ai/presets.json` owns product membership, tiers, defaults and Library
  embedding storage choices.
- `scripts/ai-catalogue/generate.mjs` produces the checked-in, immutable client
  projection. Do not edit the marked generated literals.
- GG discovery and operation schemas describe current hosted offerings. A Models
  binding or a product recommendation never grants execution support.
- Native adapters keep explicit input/output handling. A new transport or result
  contract requires implementation; an ordinary GG model addition does not.

Current native/BYOK hosts use the immutable `catalog.snapshot.seed()` from the
pinned release. They do not refresh those facts from the legacy HTTP catalogue.

The `catalog.snapshot.legacy()` schema-1 entry is retained for older installed
clients. It omits bindings whose opaque SKU pricing or missing coarse estimate
cannot be represented by that protocol; the current client seed retains them.
Neither snapshot authorizes hosted pricing, availability, permissions or billing.
Missing historical cost estimates remain unknown; no absent price becomes zero.

See [the authoring guide](../../../../data/ai/README.md) for generation and checks.
