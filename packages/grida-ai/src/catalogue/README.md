# Client catalogue and product presets

`@grida/ai/catalogue` contains the lookup types and projections used by Grida's
installed adapters and product defaults. It is not the public GG model inventory.

- The exact published `@grida/ai-models` dependency supplies the bundled seed.
- `data/ai/presets.json` owns product membership, tiers, defaults and Library
  embedding storage choices.
- `scripts/ai-catalogue/generate.mjs` produces the checked-in, immutable client
  projection. Do not edit the marked generated literals.
- GG discovery and operation schemas describe current hosted offerings. A Models
  binding or a product recommendation never grants execution support.
- Native adapters keep explicit input/output handling. A new transport or result
  contract requires implementation; an ordinary GG model addition does not.

## Models V2 foreground chat

- **Catalogue SDK.** `@grida/ai/model-catalogue` parses a matched set of Models V2
  documents into read-only text model facts, provider bindings and agent
  selectors. Callers supply the documents and exact release version. The API
  preserves identifiers and agent tier names from the release and needs no
  network, filesystem, Grida configuration, or provider credentials.
- **Grida host service.** `@grida/ai-host/model-catalogue` owns release discovery,
  manifest verification, version ordering and the last verified disk snapshot.
  Desktop Main creates and starts one store for the app and supplies its
  application-data directory.
- **Grida chat.** `ChatModels.list` and `ChatModels.resolve` apply Grida’s installed
  adapter capabilities and product policy to a snapshot and a connection. A
  subscription also needs a matching account offer. Desktop Main supplies the
  resolved choices over IPC for Welcome and workspace chat. The Grida Gateway
  and configured endpoints supply their own inventory.

The host store restores the newest validated local V2 snapshot before serving foreground chat.
It checks jsDelivr's major-version resolver in the background at startup and
hourly. Each newer version supplies an exact-version manifest, model facts and
agent selectors. The store checks the asset lengths, SHA-256 hashes, schemas
and references before atomically replacing the on-disk cache and publishing
the snapshot. Failed or incomplete updates leave the previous snapshot usable.
A first launch without network access uses the bundled seed. Setting
`GRIDA_AGENT_DISABLE_MODELS_FETCH=1` disables public catalogue checks and
keeps the validated local snapshot available.

The `catalog.snapshot.legacy()` schema-1 entry is retained for older installed
clients. It omits bindings whose opaque SKU pricing or missing coarse estimate
cannot be represented by that protocol; the current client seed retains them.
Neither snapshot authorizes hosted pricing, availability, permissions or billing.
Missing historical cost estimates remain unknown; no absent price becomes zero.

See [the authoring guide](../../../../data/ai/README.md) for generation and checks.
