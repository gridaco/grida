# Generated native adapter inventory

`operations.json` is the one generated runtime asset. It contains installed BYOK
adapter input/output contracts and explicit native Tripo GG file/rigging
adapters. It is checked in so Cargo builds are offline and require no Node.
GG image, video and music offerings and schemas are read at runtime from public
discovery; this bundle is not the GG model inventory.

The projection consumes:

- Canonical model facts: the pinned public `@grida/ai-models` release.
- Product membership, preferences and tiers: `data/ai/presets.json`.
- Implemented native input contracts: `data/ai/native-inputs.json`.
- Operation projection: `packages/grida-ai/src/media-operations.ts` and
  `rigging-operations.ts`.

From the repository root:

```sh
node scripts/ai-catalogue/generate.mjs
pnpm --filter @grida/ai build
node scripts/ai-catalogue/generate.mjs --bundle
node scripts/ai-catalogue/generate.mjs --bundle --check
```

The generator verifies that the compiled package contains the selected released
facts before producing the bundle. Native and TypeScript adapters satisfy the
same reviewed protocol fixtures. Do not edit the bundle or create a second native
facts/snapshot/service catalogue. See the [shared data guide](../../../data/ai/README.md).
