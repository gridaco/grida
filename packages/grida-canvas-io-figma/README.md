# @grida/io-figma

Utilities for converting Figma REST API data into the Grida Canvas schema.

## Status

This package is **under development** and its API may change without notice.

## Limitations

- Supports only a subset of Figma node types.
- Boolean operations, component nodes and FigJam specific nodes are not handled.
- Gradient transforms, image fills and effects are not fully implemented.
- Group conversion does not preserve constraints of child layers.
