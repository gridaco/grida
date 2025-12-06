# frame.fig Fixture

Test fixture containing two pages with FRAME and GROUP nodes for comparison testing.

**Last Updated:** 2025-12-04

## Contents

This `.fig` file contains:

- **Page 1:** Contains a FRAME node with 3 colored rectangles (red, green, blue)
- **Page 2:** Contains a GROUP node with 3 colored rectangles (red, green, blue)

## Key Finding

**Important:** Even in `.fig` files, GROUP nodes are stored as FRAME nodes. The file contains:

- 2 FRAME nodes (one named "frame", one named "group")
- 0 GROUP nodes

This confirms that Figma's internal format converts GROUP to FRAME, not just in clipboard payloads.

## Detection Properties

To distinguish a GROUP-originated FRAME from a real FRAME:

| Property            | Real FRAME  | GROUP-originated FRAME |
| ------------------- | ----------- | ---------------------- |
| `frameMaskDisabled` | `true`      | `false`                |
| `resizeToFit`       | `undefined` | `true`                 |

See [`docs/wg/feat-fig/glossary/fig.kiwi.md`](https://grida.co/docs/wg/feat-fig/glossary/fig.kiwi.md) for detailed documentation.
