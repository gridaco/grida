# @grida/io-figma

Utilities for converting Figma data (clipboard and REST API) into the Grida Canvas schema.

> **⚠️ Stability Notice**
>
> Figma clipboard integration relies on Figma's internal "Kiwi" format, which is not a public API and may change without notice. If clipboard import stops working after a Figma update, please [report an issue](https://github.com/gridaco/grida/issues/new).

## Features

### Supported Formats

- **Figma Clipboard (Kiwi)** - Internal format used in `.fig` files and clipboard
- **Figma REST API** - Public API format

### Supported Node Types

- ✅ Containers (Frame, Component, Instance, Section, Group)
- ✅ Shapes (Rectangle, Ellipse, Line, Polygon, Star)
- ✅ Vectors (Vector paths, Boolean operations)
- ✅ Text with full style support
- ✅ Effects (shadows, blur, backdrop blur)
- ✅ All stroke and fill properties

### fig2grida — `.fig` to `.grida` conversion

Convert Figma `.fig` files into Grida `.grida` archives. Available as both a
browser-safe programmatic API and a CLI tool.

#### Programmatic API (`fig2grida-core.ts`)

```ts
import { fig2grida } from "@grida/io-figma/fig2grida-core";

const figBytes = new Uint8Array(/* .fig file */);
const { bytes, pageNames, nodeCount, imageCount } = fig2grida(figBytes);

// `bytes` is a .grida ZIP archive (Uint8Array)
```

Options:

- `pages?: number[]` — convert specific page indices only (default: all)

#### CLI (`fig2grida.ts`)

```sh
# via pnpm script
pnpm --filter @grida/io-figma fig2grida input.fig

# via tsx directly
npx tsx packages/grida-canvas-io-figma/fig2grida.ts input.fig output.grida

# options
fig2grida input.fig --out output.grida --pages 0,2 --verbose
fig2grida input.fig --info   # print file info without converting
```

#### Pipeline

```text
.fig bytes
  → parseFile        → FigFileDocument { pages[], zip_files }
  → extractImages    → Map<hash, Uint8Array>
  → convertPageToScene (per page) → IPackedSceneDocument
  → merge into multi-scene Document
  → prune orphan nodes
  → io.archive.pack  → .grida ZIP (Uint8Array)
```

Multi-page `.fig` files produce a multi-scene `Document` where each Figma page
maps to a `SceneNode` referenced by `document.scenes_ref`. Pages are sorted by
their Kiwi `parentIndex.position` to preserve Figma's page ordering.
Internal-only canvases (component libraries) are excluded.

Only images actually referenced by paint data are included in the output archive.

### Conversion Pipeline

```text
Kiwi Format → REST API Format → Grida Schema
```

The package uses trait-based conversion to ensure consistency and maintainability across all node types.

## Limitations

- Component sets not supported
- FigJam-specific nodes (STICKY, CONNECTOR, TABLE, etc.) not supported
- Advanced auto-layout properties partially supported
- Style and variable bindings not preserved
- Rich text: `characterStyleOverrides` / `styleOverrideTable` not fully mapped from Kiwi; per-run overrides may be incomplete
- Kiwi format instability: Figma's internal format is not a public API and may break without notice
