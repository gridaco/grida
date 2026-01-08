# frame.fig Fixture

Test fixture containing three pages with different FRAME configurations for comparison testing.

**Last Updated:** 2025-12-04

## Contents

This `.fig` file contains three pages:

1. **Page 1: "page-with-frame"**

   - Contains a regular FRAME node named "frame"
   - Contains 3 colored rectangles (red, green, blue)
   - Properties: `frameMaskDisabled: true`, `resizeToFit: undefined`

2. **Page 2: "page-with-group"**

   - Contains a GROUP node (stored as FRAME in Kiwi format) named "group"
   - Contains 3 colored rectangles (red, green, blue)
   - Properties: `frameMaskDisabled: false`, `resizeToFit: true`

3. **Page 3: "page-with-frame-with-clip"**
   - Contains a FRAME node with clipping enabled (clip content checked) named "frame"
   - Contains 3 colored rectangles (red, green, blue)
   - Properties: `frameMaskDisabled: false`, `resizeToFit: undefined`

## Key Findings

**Important:** Even in `.fig` files, GROUP nodes are stored as FRAME nodes. The file contains:

- 3 FRAME nodes (one regular frame, one group-originated frame, one frame with clipping)
- 0 GROUP nodes

This confirms that Figma's internal format converts GROUP to FRAME, not just in clipboard payloads.

## Detection Properties

### GROUP vs FRAME Detection

To distinguish a GROUP-originated FRAME from a real FRAME:

| Property            | Real FRAME  | GROUP-originated FRAME |
| ------------------- | ----------- | ---------------------- |
| `frameMaskDisabled` | `true`      | `false`                |
| `resizeToFit`       | `undefined` | `true`                 |
| `fillPaints`        | May exist   | `undefined` or `[]`    |
| `strokePaints`      | May exist   | `undefined` or `[]`    |
| `backgroundPaints`  | May exist   | `undefined` or `[]`    |

**Note:** The paint checks (`fillPaints`, `strokePaints`, `backgroundPaints`) are used as additional safety checks since we can't be 100% confident in relying solely on `resizeToFit`. GROUPs never have fills or strokes, so this provides extra confidence in the detection.

### Frame Clipping Properties

The `frameMaskDisabled` property in the Kiwi schema indicates frame clipping behavior:

| Property            | Regular FRAME (no clip) | FRAME with clip enabled | GROUP-originated FRAME |
| ------------------- | ----------------------- | ----------------------- | ---------------------- |
| `frameMaskDisabled` | `true`                  | `false`                 | `false`                |
| `resizeToFit`       | `undefined`             | `undefined`             | `true`                 |

**Semantics (verified):**

- `frameMaskDisabled: true` = clipping is **disabled** (no clip)
- `frameMaskDisabled: false` = clipping is **enabled** (with clip)
- `frameMaskDisabled: undefined` = default behavior (clipping **enabled**)

**Note:** Regular FRAME nodes in Figma typically have `frameMaskDisabled: true` explicitly set (clipping disabled), but when the property is `undefined`, the default behavior is clipping enabled.

**Mapping to Grida `clips_content`:**

- `frameMaskDisabled: true` → `clips_content: false` (no clipping)
- `frameMaskDisabled: false` → `clips_content: true` (with clipping)
- `frameMaskDisabled: undefined` → `clips_content: true` (default: with clipping)

**Note:** The property name is counterintuitive - `frameMaskDisabled: true` means the mask (clipping) is disabled, not that the frame is disabled.

See [`docs/wg/feat-fig/glossary/fig.kiwi.md`](https://grida.co/docs/wg/feat-fig/glossary/fig.kiwi.md) for detailed documentation.
