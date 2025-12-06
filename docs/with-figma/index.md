# Grida with Figma

Grida provides seamless integration with Figma, enabling designers to transfer work between tools without friction.

> **⚠️ Important Notice**
>
> Figma clipboard integration relies on Figma's internal format, which may change without notice. If pasting from Figma stops working, please [report an issue](https://github.com/gridaco/grida/issues/new).

## Features

### Import from Figma

Copy nodes from Figma and paste them directly into Grida. The editor automatically detects Figma clipboard format and converts nodes to native Grida format, preserving:

- Node hierarchy and structure
- Visual properties (fills, strokes, effects, transforms)
- Text styles and content
- Vector data and paths
- Component relationships

**Learn more**: [Copy & Paste from Figma](../editor/features/copy-paste-figma.md)

### Supported Node Types

Grida supports importing all common Figma node types:

- **Containers**: Frames, Components, Component Instances, Sections, Groups
- **Shapes**: Rectangles, Ellipses, Lines, Polygons, Stars
- **Vectors**: Vector paths, Boolean operations
- **Text**: Text nodes with full style preservation

### Property Compatibility

The conversion pipeline maps Figma properties to Grida equivalents:

- **Effects**: Drop shadows, inner shadows, layer blur, background blur
- **Strokes**: Weight, align, cap, join, dash patterns, miter limit
- **Fills**: Solid colors, gradients (linear, radial, angular, diamond), images
- **Corners**: Radius, smoothing, individual corner radii
- **Transforms**: Position, size, rotation (extracted from matrix)

## Guides

- [How to get Personal Access Token](./guides/how-to-get-personal-access-token.md)
- [How to get Sharable Design Link](./guides/how-to-get-sharable-design-link.md)

## Technical Details

For implementation details and conversion pipeline architecture, see:

- [Figma Import Technical Spec](../editor/features/copy-paste-figma.md)
- [Figma IO Package Documentation](https://grida.co/docs/reference/io-figma)
