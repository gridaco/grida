# Clipboard Fixtures

Real clipboard payloads captured from Figma for testing clipboard import functionality.

**Last Updated:** 2025-12-04

> **Note:** These fixtures should be updated on a monthly or yearly basis. Figma's internal format may change over time, and outdated fixtures could cause tests to fail or miss compatibility issues with newer clipboard data.

## Payload Structure

Figma clipboard data is encoded as HTML with the following structure:

```html
<meta charset="utf-8" />
<span data-metadata="<!--(figmeta)BASE64_METADATA(/figmeta)-->"></span>
<span data-buffer="<!--(figma)BASE64_KIWI_DATA(/figma)-->"></span>
```

### Metadata (`data-metadata`)

Base64-encoded JSON containing:

```json
{
  "fileKey": "string",      // Source Figma file key
  "pasteID": number,         // Unique paste identifier
  "dataType": "scene"        // Type of clipboard data
}
```

### Buffer (`data-buffer`)

Base64-encoded Kiwi binary data containing:

1. **Header** - `"fig-kiwi"` prelude + version number
2. **Chunk 1** - Compressed Kiwi schema (deflated)
3. **Chunk 2** - Compressed scene data (deflated, encoded with schema from chunk 1)

**Important:** Unlike `.fig` files, clipboard payloads **include the schema** in chunk 1, making them self-describing.

## Contents

| File                                          | Description                                       | Usage          |
| --------------------------------------------- | ------------------------------------------------- | -------------- |
| `ellipse-circle-100x100-black.clipboard.html` | Circle/ellipse, 100×100, black fill               | basic          |
| `frame-with-r-g-b-rect.clipboard.html`        | Frame node containing red, green, blue rectangles | basic          |
| `group-with-r-g-b-rect.clipboard.html`        | Group node containing red, green, blue rectangles | group-is-frame |
| `rect-square-100x100-black.clipboard.html`    | Rectangle/square, 100×100, black fill             | basic          |
| `star-5-40-100x100-black.clipboard.html`      | 5-pointed star, 40pt, 100×100, black fill         | basic          |

## Capturing Clipboard Data

1. Copy element from Figma
2. Run (project root) `swift .tools/pbdump.swift > dump.txt`
3. Extract HTML content (UTI: `public.html`)
4. Save as `*.clipboard.html` in this directory

## group-is-frame ?

**Important Finding:** Figma converts GROUP nodes to FRAME nodes when copying to clipboard. This means:

- Clipboard payloads **do not contain** `GROUP` node types
- Groups are stored as `FRAME` nodes with the original group name preserved
- To detect a GROUP-originated FRAME, check:
  - `frameMaskDisabled === false` (real FRAMEs have `true`)
  - `resizeToFit === true` (real FRAMEs don't have this property)

This behavior is consistent in both clipboard payloads and `.fig` files. See [`docs/wg/feat-fig/glossary/fig.kiwi.md`](wg/feat-fig/glossary/fig.kiwi.md) for more details.

## Usage

These fixtures are used by clipboard parsing tests in `packages/grida-canvas-io-figma/fig-kiwi/__tests__/fightml.test.ts`.
