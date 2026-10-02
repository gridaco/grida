# Shared AI data

This directory owns the language-neutral authoring sources consumed by Grida's
TypeScript packages, web API, and Rust CLI.

| Source | Responsibility |
| --- | --- |
| `facts.json` | Model identities, release provenance, provider bindings, capabilities, limits, and published prices. |
| `service.json` | Grida membership, listed/staged status, legacy policy, preferences, and tiers. |
| `inputs.json` | Named operation input schemas, including the documented `x-grida-*` validation rules. |
| `schemas/` | JSON Schema envelopes for authored facts and service data. |
| `PROVENANCE.md` | Source-specific qualifications retained from the researched catalogue. |

Authored domain keys use `lower_snake_case`. Model/provider IDs and standard
JSON Schema keywords keep their exact spelling. The generator explicitly maps
the existing text-card and cost fields to the published camelCase TypeScript
API; schema-1 web payloads and existing package APIs retain their spelling.

From the repository root:

```sh
node packages/grida-ai-models/scripts/generate.mjs
pnpm --filter @grida/ai-models build
pnpm --filter @grida/ai build
node packages/grida-ai-models/scripts/generate.mjs --bundle
node packages/grida-ai-models/scripts/generate.mjs --bundle --check
```

Generation updates the marked TypeScript literals in `@grida/ai-models` and the
package-local `@grida/ai` input-schema copy. After building both packages,
`--bundle` derives discovery/service projections and the checked-in Rust assets.
The schema envelopes cover structure; TypeScript checks modality-specific types
and tests cover service references, validation, and provider behavior.

Package builds and typechecks reject stale generated source. Turbo includes this
directory in the affected packages' task inputs. Commit source and generated
changes together; generated files are not additional authoring homes. Runtime
packages never import this directory. Rust's crate-local assets require neither
Node nor network access during Cargo builds.

See the [model package](../../packages/grida-ai-models/README.md) for factual and
service APIs and the [AI package](../../packages/grida-ai/README.md) for operation
input semantics. Adding a catalogue binding or service member does not implement
a provider adapter or grant permission to execute it.
