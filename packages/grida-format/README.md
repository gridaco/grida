# @grida/format

Generated TypeScript bindings for the Grida FlatBuffers schema.

## Overview

This package contains **generated-only** TypeScript code produced from [`format/grida.fbs`](../../format/grida.fbs) using the FlatBuffers compiler (`flatc`).

## Generating Code

The TypeScript bindings are generated at build-time via the `prebuild` hook. To regenerate manually:

```bash
pnpm --filter @grida/format flatc:generate
```

Or from this directory:

```bash
pnpm flatc:generate
```

This will regenerate `src/grida.ts` and `src/grida/**` from the source schema.

## Building

The package builds to both CommonJS and ESM formats using `tsup`:

```bash
pnpm --filter @grida/format build
```

This generates:

- `dist/index.js` (CommonJS)
- `dist/index.mjs` (ESM)
- `dist/index.d.ts` (TypeScript declarations)

## Usage

```typescript
import { grida } from "@grida/format";

// Use generated types and builders
const builder = new flatbuffers.Builder();
// ... build your document
```

## Notes

- The `src/` directory is treated as **generated-only** and should not be manually edited.
- Generated files are git-ignored and regenerated during build/CI.
- The package is private and not published to npm (for now).
