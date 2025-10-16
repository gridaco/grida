# Halftone Generator Tool

## Overview

The Halftone Generator is an online design tool that converts images into halftone patterns using various shapes. Halftone is a reprographic technique that simulates continuous-tone imagery through the use of dots, varying either in size or in spacing. This tool is commonly used for artistic effects, screen printing, and retro-style design work.

## Features

### Image Upload & Processing

- Accepts any image format (PNG, JPG, SVG, etc.)
- Automatically scales down large images to a maximum of 1024px for performance
- Real-time preview on canvas
- Extracts pixel luminance data to determine halftone dot sizes

### Shape Options

The tool provides 8 different shape types for halftone dots:

- **Circle**: Classic halftone dot (default)
- **Square**: Rectangular grid pattern
- **Triangle**: Triangular dots
- **Star**: 5-pointed star shapes
- **Spark**: 4-pointed diamond/spark pattern
- **X-cross**: Rotated plus sign (45°)
- **Plus-cross**: Standard plus sign
- **Custom Image**: Upload your own PNG/SVG shape for maximum creativity

### Adjustable Parameters

#### Grid (4-64px)

Controls the spacing between halftone dots. Smaller values create denser patterns with more detail.

#### Max Radius (1-64px)

Sets the maximum size of halftone dots in darker areas of the image.

#### Gamma (0.1-3.0)

Adjusts the brightness curve mapping. Values > 1 darken the output, values < 1 brighten it.

#### Opacity (0-1)

Controls the transparency of the halftone pattern.

#### Jitter (0-32px)

Adds random positional variation to dots for a more organic, hand-printed appearance.

#### Color

Choose any color for the halftone pattern (applies to all shapes except custom images in as-is mode).

### Export Options

- **PNG Export**: Rasterized output at the working resolution
- **SVG Export**: Vector output (not available when using custom images)
  - Generates clean SVG paths for each halftone shape
  - Fully scalable and editable in vector software
  - Maintains all shape types except custom images

## Technical Implementation

### Core Algorithm

1. **Image Loading**: The source image is loaded and optionally downscaled to MAX_SIZE (1024px)
2. **Pixel Sampling**: For each grid cell, sample the pixel at that position
3. **Luminance Calculation**: Convert RGB to grayscale using ITU-R BT.601 formula:
   ```
   luminance = (0.299 * R + 0.587 * G + 0.114 * B) / 255
   ```
4. **Gamma Adjustment**: Apply gamma curve: `mapped = luminance ^ gamma`
5. **Radius Mapping**: Darker areas get larger dots: `radius = (1 - mapped) * maxRadius`
6. **Jitter**: Add random offset to dot positions for organic feel
7. **Shape Rendering**: Draw the selected shape at calculated position and size

### Custom Image Shapes

When using custom images as shapes:

- Images are loaded as `HTMLImageElement` for efficient canvas rendering
- Each halftone cell renders a scaled version of the custom image
- Image size scales with brightness (consistent with built-in shapes)
- Original image colors are preserved (as-is rendering)
- Works with both PNG and SVG formats

### Shape Drawing Logic

Each shape is drawn using Canvas 2D API:

- **Geometric shapes** (circle, square, triangle, etc.): Use path commands
- **Star/Spark**: Calculated using polar coordinates with alternating inner/outer radii
- **Cross patterns**: Use rect() with rotation transforms
- **Custom images**: Use drawImage() with calculated dimensions

### SVG Export

SVG export converts the canvas halftone pattern to vector format:

- Each halftone dot becomes an SVG shape element
- Circles → `<circle>` elements
- Rectangles → `<rect>` elements
- Polygons → `<polygon>` elements with calculated points
- Grouped elements use `<g>` with transforms
- Not supported for custom images due to complexity

## File Structure

```
app/(tools)/tools/halftone/
├── page.tsx           # Route wrapper with metadata
├── _page.tsx          # Main tool implementation
└── AGENTS.md          # This documentation
```

### Key Components in `_page.tsx`

- **drawShape()**: Renders individual shape types on canvas
- **renderHalftone()**: Main rendering loop for halftone pattern
- **luminance()**: Converts RGB to perceived brightness
- **shapeToSVG()**: Converts canvas shapes to SVG elements
- **HalftoneTool**: Main React component with UI and state management

## State Management

The tool uses React hooks for state:

- `imageSrc`: Data URL of uploaded image
- `shape`: Currently selected shape type
- `grid`: Dot spacing parameter
- `maxRadius`: Maximum dot size
- `gamma`: Brightness curve adjustment
- `jitter`: Random position offset
- `opacity`: Pattern transparency
- `color`: RGBA color object for shapes
- `customShapeImage`: HTMLImageElement for custom shapes
- `imageDataRef`: Cached ImageData for exports
- `sizeRef`: Cached dimensions for exports

## Adding New Features

### Adding a New Shape

1. Update the `Shape` type union
2. Add a new case in `drawShape()` function
3. Add a new case in `shapeToSVG()` function (for SVG export)
4. Add a `<SelectItem>` in the Shape selector UI

Example:

```typescript
case "hexagon": {
  const angle = Math.PI / 3; // 60 degrees
  ctx.moveTo(cx + radius, cy);
  for (let i = 1; i < 6; i++) {
    const x = cx + radius * Math.cos(angle * i);
    const y = cy + radius * Math.sin(angle * i);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  break;
}
```

### Adding New Parameters

1. Add state: `const [newParam, setNewParam] = useState<number>(defaultValue)`
2. Add to useEffect dependency array
3. Pass to `renderHalftone()` function
4. Use in rendering logic
5. Add UI control (Slider, Input, etc.)

### Performance Considerations

- Images are capped at MAX_SIZE (1024px) to prevent performance issues
- Canvas operations are efficient but can be slow on large images with small grid sizes
- SVG export can generate very large files with small grid values
- Custom images add minimal overhead compared to shape rendering

## Common Use Cases

- **Screen Printing**: Export SVG for cut files
- **Retro Posters**: Use large grid with star/circle shapes
- **Texture Design**: Small grid with jitter for organic patterns
- **Pop Art**: High contrast images with square or circle shapes
- **Custom Branding**: Use logo/icon as custom shape for unique effects
