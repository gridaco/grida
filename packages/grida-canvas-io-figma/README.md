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
