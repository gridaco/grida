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

| File                                                                            | Description                                                            | Source                                   | Usage          |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------- | -------------- |
| `ellipse-circle-100x100-black.clipboard.html`                                   | Circle/ellipse, 100×100, black fill                                    |                                          | basic          |
| `frame-with-r-g-b-rect.clipboard.html`                                          | Frame node containing red, green, blue rectangles                      |                                          | basic          |
| `group-with-r-g-b-rect.clipboard.html`                                          | Group node containing red, green, blue rectangles                      |                                          | group-is-frame |
| `rect-square-100x100-black.clipboard.html`                                      | Rectangle/square, 100×100, black fill                                  |                                          | basic          |
| `star-5-40-100x100-black.clipboard.html`                                        | 5-pointed star, 40pt, 100×100, black fill                              |                                          | basic          |
| `component-component-blue.clipboard.html`                                       | Blue component definition (SYMBOL)                                     | [`components.fig`](../L0/components.fig) | component      |
| `component-component-red.clipboard.html`                                        | Red component definition (SYMBOL)                                      | [`components.fig`](../L0/components.fig) | component      |
| `component-component-instance-blue.clipboard.html`                              | Blue component instance (INSTANCE)                                     | [`components.fig`](../L0/components.fig) | component      |
| `component-component-instance-blue-with-overrides.clipboard.html`               | Blue component instance with overrides (INSTANCE)                      | [`components.fig`](../L0/components.fig) | component      |
| `component-component-instance-red.clipboard.html`                               | Red component instance (INSTANCE)                                      | [`components.fig`](../L0/components.fig) | component      |
| `component-component-instance-red-with-overrides.clipboard.html`                | Red component instance with overrides (INSTANCE)                       | [`components.fig`](../L0/components.fig) | component      |
| `component-component-set.clipboard.html`                                        | Component set definition (FRAME `isStateGroup`)                        | [`components.fig`](../L0/components.fig) | component      |
| `component-component-set-component-blue.clipboard.html`                         | Blue component definition within a component set (SYMBOL)              | [`components.fig`](../L0/components.fig) | component      |
| `component-component-set-component-red.clipboard.html`                          | Red component definition within a component set (SYMBOL)               | [`components.fig`](../L0/components.fig) | component      |
| `component-component-set-component-instance-blue.clipboard.html`                | Blue component instance from a component set (INSTANCE)                | [`components.fig`](../L0/components.fig) | component      |
| `component-component-set-component-instance-blue-with-overrides.clipboard.html` | Blue component instance from a component set with overrides (INSTANCE) | [`components.fig`](../L0/components.fig) | component      |
| `component-component-set-component-instance-red.clipboard.html`                 | Red component instance from a component set (INSTANCE)                 | [`components.fig`](../L0/components.fig) | component      |
| `component-component-set-component-instance-red-with-overrides.clipboard.html`  | Red component instance from a component set with overrides (INSTANCE)  | [`components.fig`](../L0/components.fig) | component      |

## Component / Instance payload structure (observed)

These fixtures show a **repeatable clipboard structure** when components or instances are copied.

### Common shape

- The payload contains a `DOCUMENT` node and **two `CANVAS` nodes**:
  - A user-facing page canvas (e.g. `"Page 1"`)
  - An `"Internal Only Canvas"` canvas where `internalOnly === true`

### Copying the component definition (`component-component-*.clipboard.html`)

- The copied item appears as a single `SYMBOL` under the user-facing page canvas.
- The `"Internal Only Canvas"` is present (and `internalOnly === true`) but contains **no `SYMBOL` children** in these fixtures.

### Copying a component instance (`component-component-instance-*.clipboard.html`)

- The user-facing page canvas contains an `INSTANCE`.
- The `"Internal Only Canvas"` contains a `SYMBOL` with the component definition.
- The reference is carried by `INSTANCE.symbolData.symbolID`, which matches the referenced `SYMBOL.guid`.

**Verified in fixtures:**

- `component-component-blue.clipboard.html`
- `component-component-red.clipboard.html`
- `component-component-instance-blue.clipboard.html`
- `component-component-instance-red.clipboard.html`

## Component set payload structure (observed)

These fixtures show how a **component set** (variants) appears in Kiwi clipboard payloads.

### Component set representation

- A component set is represented as a **`FRAME`** with:
  - `isStateGroup === true`
  - `componentPropDefs` present (variant property definitions)
- Variants are represented as **child `SYMBOL` nodes** with `variantPropSpecs` present.

### Copying the component set container (`component-component-set.clipboard.html`)

- The user-facing page canvas contains the **component-set `FRAME`** with **variant `SYMBOL` children**.
- An `"Internal Only Canvas"` may still be present (and `internalOnly === true`), even when the component-set `FRAME` is on the user-facing canvas.

### Copying a variant component itself (`component-component-set-component-*.clipboard.html`)

- The user-facing page canvas contains a `SYMBOL` for the copied variant.
- The `"Internal Only Canvas"` contains the **component-set `FRAME`** and its **variant `SYMBOL` children**.

### Copying a variant instance (`component-component-set-component-instance-*.clipboard.html`)

- The user-facing page canvas contains an `INSTANCE`.
- The `"Internal Only Canvas"` contains the **component-set `FRAME`** and its **variant `SYMBOL` children**.
- The reference uses `INSTANCE.symbolData.symbolID` → `SYMBOL.guid` (where the referenced `SYMBOL` is a variant under the component-set `FRAME`).

**Verified in fixtures:**

- `component-component-set.clipboard.html`
- `component-component-set-component-blue.clipboard.html`
- `component-component-set-component-red.clipboard.html`
- `component-component-set-component-instance-blue.clipboard.html`
- `component-component-set-component-instance-red.clipboard.html`

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
  - No paints: `fillPaints`, `strokePaints`, and `backgroundPaints` are all empty/undefined
    (GROUPs don't have fills or strokes, so this is an additional safety check)

This behavior is consistent in both clipboard payloads and `.fig` files. See [`docs/wg/feat-fig/glossary/fig.kiwi.md`](../../../docs/wg/feat-fig/glossary/fig.kiwi.md) for detailed detection logic and implementation.

## Usage

These fixtures are used by clipboard parsing tests in `packages/grida-canvas-io-figma/fig-kiwi/__tests__/fightml.test.ts`.
