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

| Property            | Regular FRAME | FRAME with clip checked | GROUP-originated FRAME |
| ------------------- | ------------- | ----------------------- | ---------------------- |
| `frameMaskDisabled` | `true`        | `false`                 | `false`                |
| `resizeToFit`       | `undefined`   | `undefined`             | `true`                 |

**Note:**

- `frameMaskDisabled: true` appears to be the default for regular FRAME nodes (clipping enabled by default)
- `frameMaskDisabled: false` is seen in both "FRAME with clip checked" and GROUP-originated FRAMEs
- The exact meaning and relationship of `frameMaskDisabled` needs further investigation

See [`docs/wg/feat-fig/glossary/fig.kiwi.md`](https://grida.co/docs/wg/feat-fig/glossary/fig.kiwi.md) for detailed documentation.
