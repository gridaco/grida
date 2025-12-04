# Figma Copy & Paste

This document describes how the Grida canvas handles Figma clipboard content, enabling seamless cross-tool workflows between Figma and Grida.

> **⚠️ Important Notice**
>
> This feature relies on Figma's internal clipboard format, which is not a public API and may change without notice. If you experience issues with pasting from Figma, please [file an issue](https://github.com/gridaco/grida/issues/new) or contact us. We'll do our best to update the integration, but some breakage is expected as Figma evolves.

## Goals

- Enable designers to transfer work between Figma and Grida without export/import friction.
- Preserve node structure, properties, and hierarchy during conversion.
- Support all common Figma node types including frames, shapes, text, vectors, and effects.
- Provide clear feedback during conversion.

## Feature Summary

| Interaction          | Entry points                                  | Result                                                                                       | status  |
| -------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- | ------- |
| Paste Figma nodes    | `Cmd/Ctrl + V` after copying nodes from Figma | Converts Figma clipboard data to native Grida nodes, preserving structure and properties.    | ready   |
| Paste Figma effects  | Copy nodes with shadows, blurs from Figma     | Maps Figma effects (DROP_SHADOW, INNER_SHADOW, LAYER_BLUR, BACKGROUND_BLUR) to Grida.        | ready   |
| Paste Figma strokes  | Copy nodes with strokes from Figma            | Preserves stroke properties including weight, cap, join, dash array, and miter limit.        | ready   |
| Paste Figma fills    | Copy nodes with fills/paints from Figma       | Converts solid, gradient, and image fills to Grida paints (includes invisible paints).       | ready   |
| Paste nested content | Copy frames/groups with children from Figma   | Reconstructs full hierarchy with proper parent-child relationships and relative positioning. | ready   |
| Paste components     | Copy component instances from Figma           | Converts to Grida container nodes (component structure preserved for future enhancement).    | partial |

---

## How It Works

### Clipboard Detection

When you paste (`Cmd/Ctrl + V`), Grida inspects the clipboard in priority order:

1. **Grida native clipboard** - Internal copy/paste for nodes and properties
2. **Figma clipboard** - Automatically detected via HTML markers
3. **SVG text** - Raw SVG markup
4. **Files** - Image and SVG files
5. **Plain text** - Creates text nodes

**Figma Clipboard Format**

Figma's clipboard uses HTML with embedded metadata:

```html
<meta charset="utf-8" />
<span data-metadata="<!--(figmeta)...(/figmeta)-->"></span>
<span data-buffer="<!--(figma)...(/figma)-->"></span>
```

Grida detects this format automatically without manual intervention.

### Supported Content

**Node Types**

- Containers: Frames, Components, Component Instances, Sections, Groups
- Shapes: Rectangles, Ellipses, Lines, Polygons, Stars
- Vectors: Vector paths, Boolean operations
- Text: Text nodes with styling

**Properties**

- Visual properties: Fills, strokes, effects (shadows, blur)
- Layout: Position, size, rotation, corner radius
- Typography: Font, size, weight, alignment, line height, letter spacing
- Hierarchy: Parent-child relationships, nesting

### User Experience

**Workflow**

1. Copy nodes from Figma (Cmd/Ctrl + C)
2. Switch to Grida and paste (Cmd/Ctrl + V)
3. Toast shows "Pasting from Figma..."
4. Nodes appear at viewport center
5. Toast confirms "Pasted N root node(s) from Figma"
6. Nodes are automatically selected and ready for editing

**Error Handling**

- Invalid clipboard data shows clear error message
- Unsupported nodes are skipped with warning
- Conversion errors surface toast notifications
- Original clipboard remains untouched on failure

---

## Limitations

**Currently Unsupported**

- Component sets (COMPONENT_SET)
- FigJam-specific nodes (STICKY, CONNECTOR, TABLE, etc.)
- Component variants and property definitions
- Auto-layout advanced properties
- Style and variable bindings

---

## Future Enhancements

- Full component system with variants and overrides
- Component set support
- Advanced auto-layout properties
- Style and variable bindings
- Export to Figma (round-trip support)

---

## Related Features

- [Copy & Paste Images](./copy-paste-image.md)
- [Copy & Paste SVG](./copy-paste-svg.md)
- [Viewport-Aware Insertion](./viewport-aware-insertion.md)
