# AI client configuration

Model facts are maintained in the public [`gridaco/models`](https://github.com/gridaco/models)
catalogue and consumed through the exact `@grida/ai-models` release pinned in
`packages/grida-ai/package.json`. Effective GG offerings, prices and operation
contracts come from [GG discovery](https://gateway.grida.ai/v1/models).

This directory contains only Grida-owned choices and executable native contracts:

| Source | Responsibility |
| --- | --- |
| `presets.json` | Product membership, listed/staged and legacy choices, defaults, tiers and Library embedding storage pins. |
| `chatgpt-subscription.json` | Subscription model membership, order, default and retired saved identities. No credentials or entitlement data. |
| `native-inputs.json` | Input schemas implemented by the native/BYOK client adapters. GG operation schemas remain GG-owned. |
| `schemas/presets.schema.json` | Structural envelope for product definitions. |
| `schemas/chatgpt-subscription.schema.json` | Structural envelope for subscription compatibility. |

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

`chatgpt-subscription.json` owns the closed subscription model membership,
order and default. These are product compatibility choices, separate from
account entitlement and the general OpenAI API catalogue. The standard generator
projects its TypeScript constants in `packages/grida-ai-host/src/protocol/chatgpt.ts`
and the native `crates/grida-agent/data/chatgpt-subscription-models.json` asset.
Exact wire IDs come from the pinned public Models OpenAI bindings; labels and
other model facts stay there too. Do not edit either generated projection.

`retired_model_ids` permits reading older saved selections without invalidating
the rest of their settings. It grants no inference or picker availability.
Retiring a subscription model requires current subscription-specific evidence;
API retirement and subscription retirement can differ. The current subscription
choices follow [OpenAI's model guidance](https://learn.chatgpt.com/docs/models),
including the separate GPT-5.5 and GPT-5.4 subscription retirements. Existing
GPT-5.6 selections stay compatible; GPT-6.1 Sol is the default for new untouched
selections. Account and plan availability is still checked by the service.

The generator lists the OpenRouter models that take PNG input: listed product
models whose exact public OpenRouter binding declares tool calls and PNG input.
Native image input also requires the canonical OpenRouter route and stored
OpenRouter key.

The hosted renderer feature-detects the discovery bridge. Released Desktop binaries
without that method retain their existing finite native choices and server-validated
execution; they are not represented as a live discovery snapshot. A new bridge with
empty, failed or expired discovery never takes that compatibility branch.
