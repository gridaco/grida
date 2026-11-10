# AI client configuration

Model facts are maintained in the public [`gridaco/models`](https://github.com/gridaco/models)
catalogue and consumed through the exact `@grida/ai-models` release pinned in
`packages/grida-ai/package.json`. Effective GG offerings, prices and operation
contracts come from [GG discovery](https://gateway.grida.ai/v1/models).

This directory contains only Grida-owned choices and executable native contracts:

| Source | Responsibility |
| --- | --- |
| `presets.json` | Product membership, listed/staged and legacy choices, defaults, tiers and Library embedding storage pins. |
| `native-inputs.json` | Input schemas implemented by the native/BYOK client adapters. GG operation schemas remain GG-owned. |
| `schemas/presets.schema.json` | Structural envelope for product definitions. |

A provider binding in Models does not implement an adapter. The generator selects
product members and projects only the fields and binding shapes implemented by
this client. Unqualified route inputs are omitted. Exact provider SKU rate tables remain
opaque provider facts; they are never converted into guessed per-second prices.
Missing coarse estimates stay
unknown. Text costs are display estimates; where a model has no model-level
regular rate, the supported Vercel provider quote is projected explicitly. None
of these client estimates authorizes or settles hosted spending.

Library's model ID, configured dimensions and normalization remain product
storage contracts. Updating a public model record cannot silently change them.

From the repository root:

```sh
node scripts/ai-catalogue/generate.mjs
pnpm --filter @grida/ai build
node scripts/ai-catalogue/generate.mjs --bundle
node scripts/ai-catalogue/generate.mjs --bundle --check
```

Generated TypeScript retains literal IDs and installed-client interfaces. Current
hosts pin native/BYOK metadata to this immutable release; they do not refresh it
from the older HTTP catalogue. The Rust `operations.json` asset contains only
implemented native operation descriptors. GG runtime discovery is separate. These outputs are checked, not independent
facts authoring homes. Updating the public dependency requires reviewing the
model facts diff, regenerating and testing its consumers. Ordinary GG catalogue
updates do not require changing product defaults or native adapters.

The generator also projects context windows for exact OpenAI model bindings used
by the native Responses profile. The host uses them only for the canonical
OpenAI route.

The generator verifies the reviewed OpenRouter PNG model against the listed
product model and its exact public binding. Native image input also requires the
canonical OpenRouter route and stored OpenRouter key.

The hosted renderer feature-detects the discovery bridge. Released Desktop binaries
without that method retain their existing finite native choices and server-validated
execution; they are not represented as a live discovery snapshot. A new bridge with
empty, failed or expired discovery never takes that compatibility branch.
