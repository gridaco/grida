---
name: ai-models
description: >
  Update Grida product model presets, native adapter compatibility and the pinned
  public Models dependency; distinguish canonical facts from live GG offerings.
  Use for model selection, client catalogue updates and model-discovery drift.
---

# AI model ownership and client updates

## Choose the owner first

| Subject                                                                                   | Canonical owner                                                                                                                                                             |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model identities, labels, releases, labs, provider bindings, capabilities, regular prices | Public [`gridaco/models`](https://github.com/gridaco/models), consumed as the pinned `@grida/ai-models` release.                                                            |
| Currently served GG models, effective capabilities, prices and operation schemas          | [GG models](https://gateway.grida.ai/v1/models), [endpoints](https://gateway.grida.ai/v1/endpoints), [operation schemas](https://gateway.grida.ai/schemas/operations.json). |
| Product membership, defaults, tier choices and feature subsets                            | `data/ai/presets.json`.                                                                                                                                                     |
| Executable native/BYOK inputs and adapters                                                | `data/ai/native-inputs.json`, `packages/grida-ai/src/`, `crates/grida-ai/src/`.                                                                                             |
| Library model/dimensions/normalization storage invariant                                  | `presets.json` → `library_embedding`; coordinate existing vectors before changing it.                                                                                       |

Do not recreate an authored factual catalogue or GG allowlist in Grida. A public
Models binding is a fact, not installed adapter support or GG availability.
Normal GG additions using an implemented interface need no model-ID code change.
A new transport, input contract or result format needs an actual client adapter.

`@grida/ai/catalogue` is the client compatibility projection plus product presets.
Its `models` values come from the external release; its `catalog` adds product
choices and the retained schema-1 installed-client protocol. It is not a second
facts authoring home. Unknown prices/estimates remain unknown, never zero.
Historical client estimates cannot authorize or settle hosted spending.

## Updating the public dependency or product presets

Read [`data/ai/README.md`](../../../data/ai/README.md) and inspect the full old/new
released Models diff before repinning. Review lower/removed/zero prices, billing
units, provider IDs, capabilities and retirements against regular-price evidence.
Do not copy promotional rates or infer price equivalence across providers.
Source corrections belong in the public Models project, not local overrides.

Product recommendations never replace an explicit saved selection. Defaults must
remain active listed members; partial order must be deliberate and duplicate-free.
BYOK, custom endpoints, Ollama and ChatGPT subscription identities retain their
own selection and credential rules. Special background-removal/upscale tools
remain separate feature contracts; no need to advertise them as general GG models.

Run from the repository root:

```sh
node scripts/ai-catalogue/generate.mjs
pnpm --filter @grida/ai build
node scripts/ai-catalogue/generate.mjs --bundle
node scripts/ai-catalogue/generate.mjs --bundle --check
pnpm --filter @grida/ai test
pnpm --filter @grida/ai typecheck
cargo test -p grida-ai --locked
```

Commit the pin, presets/native-contract changes and generated projections together.
Never hand-edit marked `generated:*` literals or package/crate JSON projections.
Use the CLI contract gate for native protocol changes; review intentional fixture
changes rather than regenerating a baseline to hide drift. Run editor typecheck
when touching its consumers.

## Discovery, execution and recovery

GG discovery is anonymous, bounded and shared per client host; it carries no
execution credential. Respect cache expiry and unavailable state rather than
restoring retired GG models from a bundled list. The hosted renderer preserves
released binaries lacking the discovery bridge through their existing finite
native choices; never enter that compatibility path after a capable host's
empty, failed or expired read. BYOK/offline metadata remains
available independently from the immutable release pin. New hosts do not fetch
the legacy native catalogue. Keep `/api/v1/models/catalog` readable for older
clients using `catalog.snapshot.legacy()`; omit only shapes its schema cannot
represent, retaining exact facts in the current seed. Never treat that endpoint
as current GG inventory.

Signed-in product usage keeps organization-scoped authorization and the existing
native response contracts. It does not require a standalone GG customer API key.
Preserve accepted task identity and recovery after discovery changes; failed
result retrieval never justifies a second paid submission. Hosted billing,
reservations and settlement remain service-owned. Read
[`hosted-ai.md`](../../../docs/wg/platform/hosted-ai.md) and the `GRIDA-SEC-006`
trust boundary for the native consumer contract.

Paid probes, production changes and deployments require their own authorization;
a catalogue update alone does not authorize them.
