# Generated runtime assets

These files are generated copies, **not authoring sources**. They are checked in
inside the Cargo package so Rust builds are offline and do not require Node.

- Canonical model facts: `data/ai/facts.json`.
- Grida membership, preferences and tiers: `data/ai/service.json`.
- Neutral operation field/input contracts: `data/ai/inputs.json`.
- Schema-1 compatibility projection and ordering: the existing pure TypeScript
  helpers in `packages/grida-ai-models/src/grida/`.
- Operation discovery projection: `packages/grida-ai/src/media-operations.ts`
  and `rigging-operations.ts`, consuming those shared sources.

From the repository root:

```sh
node packages/grida-ai-models/scripts/generate.mjs
pnpm --filter @grida/ai-models build
pnpm --filter @grida/ai build
node packages/grida-ai-models/scripts/generate.mjs --bundle
node packages/grida-ai-models/scripts/generate.mjs --bundle --check
```

`facts.json` preserves the authored `lower_snake_case` domain keys. Snapshot and
service-view bundles retain the existing schema-1/public TypeScript spellings;
the generator explicitly projects the named text-card and cost fields. Model
and provider IDs and JSON Schema vocabulary are not renamed.

The generator verifies that the compiled model package actually contains the
projected authored JSON before producing bundles. Changes to neutral fields are checked
against both the current TypeScript parser and the pinned migration baseline.
All authoring lives in repository-root `data/ai/`; crate-local copies do not
establish ownership. See the [shared data guide](../../../data/ai/README.md).
