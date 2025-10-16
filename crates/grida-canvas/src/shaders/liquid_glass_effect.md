# Liquid Glass Effect Shader

## Overview

A physically-based glass shader featuring real-time refraction with chromatic aberration, Fresnel reflections, SDF-based shape morphing, and supersampled anti-aliasing.

Based on React Native Skia glass shader examples.

## Implementation

### `liquid_glass_backdrop.sksl`

**Usage:** All rendering through `Painter::draw_glass_effect()` and standalone examples

**Approach:** SaveLayer backdrop with pre-blur via ImageFilter chain

- Uses Skia's SaveLayer backdrop mechanism
- Skia automatically captures background
- Pre-blur using Skia's native Gaussian blur ImageFilter (~100x faster than inline)
- Works seamlessly with GPU and CPU backends
- **Child Shader:** `uniform shader backdrop` (Skia provides pre-blurred backdrop automatically)

**Benefits:**

- ✅ No manual surface snapshots
- ✅ No unsafe blocks
- ✅ GPU-compatible without special handling
- ✅ Cleaner, more maintainable code
- ✅ Exceptional performance (~400x faster than inline shader blur)
- ✅ Higher quality Gaussian blur (vs previous box blur)
- ✅ Partial region capture (Skia optimizes capture area)
- ✅ Zero CPU↔GPU data transfers for GPU backends

**When to use:**

- Default choice for all code (only implementation available)
- Editor integration
- GPU-backed rendering
- CPU rendering
- ContainerNode effects pipeline
- Standalone examples

## Features

- **Real-time Refraction**: Light bending through glass using configurable index of refraction
- **Chromatic Aberration**: Color separation at edges (dispersion) for realistic glass distortion
- **Fresnel Reflections**: Surface becomes more reflective at grazing angles
- **SDF-based Shape**: Uses signed distance fields for rounded rectangle shapes
- **Supersampled Anti-aliasing**: 4x4 SSAA for smooth edges

## Parameters

### Geometry

- `box` (vec4): Bounding box (x, y, width, height)
- `corner_radii` (vec4): Corner radii [top-left, top-right, bottom-right, bottom-left]
- `transform` (mat3): Transformation matrix for shape positioning (supports rotation)
- `resolution` (vec2): Canvas resolution in pixels

### Textures

- `backdrop` (shader): Pre-blurred backdrop automatically provided by Skia's ImageFilter chain

### Effect Parameters

- `light_intensity` (float [0.0-1.0]): Controls transmission/transparency
- `light_angle` (float): Light angle in degrees (reserved for future use)
- `refraction` (float [1.0-2.0]): Index of refraction (1.0=air, 1.5=glass)
- `depth` (float [1.0+]): Glass thickness for 3D surface effect
- `dispersion` (float [0.0-1.0]): Chromatic aberration strength
- `blur_radius` (float [0.0+]): Blur radius for frosted glass effect (applied via Skia's native blur before shader)

## Limitations

### Shape Constraints

**This shader is fundamentally designed for rectangular shapes only.**

- **Supported**: Rectangles with rounded corners (like HTML `div` with `border-radius`)
- **NOT Supported**: Arbitrary paths, polygons, circles, ellipses, or custom shapes
- **Why**: The shader relies on a Signed Distance Field (SDF) for rounded rectangles to:
  - Generate the 3D curved glass surface
  - Calculate smooth surface normals for realistic refraction
  - Create the lens-like depth effect

**Technical Reason**: The liquid glass effect requires continuous distance information to compute the curved 3D surface. Arbitrary Skia paths only provide boundary information (inside/outside), not the distance field needed for the 3D lens curvature.

**Alternative Approaches for Other Shapes**:

- For circles/ellipses: Would require different SDF primitives
- For arbitrary paths: Would need SDF texture preprocessing (expensive) or lose the 3D effect quality
- For flat refraction: A simpler shader without the 3D surface could work with any shape, but would lose the characteristic "liquid glass" appearance

### Other Limitations

- **Reflection**: Reflection color is simplified (always black/transparent)
- **Performance**: Supersampling (4x4) may be expensive for large shapes or real-time applications
- **Fixed Parameters**: `roughness` and `distortionScale` are hardcoded to `0.1` and `1.0`
- **Single Shape**: Each shader instance renders one rectangular glass shape

## Intended Usage

### Primary Use Case: ContainerNode Effects

This shader is specifically designed for rectangular container elements (similar to HTML `div` elements):

- **Width & Height**: Any dimensions
- **Corner Radius**: Per-corner radii support (like CSS `border-radius`)
- **Rotation**: Fully supported via transformation matrix
- **Translation**: Position anywhere on canvas

### Ideal Scenarios

- **UI Glass Panels**: Frosted glass cards, modals, overlays
- **Decorative Elements**: Glass-like buttons, headers, sections
- **Background Effects**: Translucent panels over images or complex backgrounds
- **Container Effects**: Apply to any `ContainerNode` in the rendering pipeline

### Best Practices

- **Moderate sizes**: Works best with UI-sized elements (not full-screen glass)
- **High-quality backgrounds**: The refraction effect shines with detailed, colorful content behind the glass
- **Static or animated**: Supports both static glass and animated parameters (e.g., animating `dispersion` or `depth`)
- **Blur radius**: Keep blur_radius moderate (2-10px) for best performance and visual quality

### NOT Recommended For

- Non-rectangular shapes (circles, polygons, custom paths)
- Very large glass surfaces (performance impact from supersampling)
- Extremely high blur radii (>20px may cause performance issues)

## Usage

### Through Painter Pipeline

```rust
// Add glass effect to LayerEffects
let effects = LayerEffects {
    glass: Some(FeLiquidGlass {
        light_intensity: 0.9,
        refraction: 1.5,
        depth: 20.0,
        dispersion: 0.02,
        blur_radius: 2.0,
        ..Default::default()
    }),
    ..Default::default()
};

// Render with effects (automatic glass application)
painter.draw_shape_with_effects(&effects, &shape, || {
    // Draw fills, strokes, etc.
});
```

### Direct API

```rust
use cg::painter::effects::create_liquid_glass_image_filter;

let glass_filter = create_liquid_glass_image_filter(
    width, height, corner_radii, rotation, canvas_size, &effect
);

canvas.save();
canvas.translate((x, y));
canvas.clip_rrect(rrect, None, true);
let layer_rec = SaveLayerRec::default().backdrop(&glass_filter);
canvas.save_layer(&layer_rec);
canvas.restore();
canvas.restore();
```

## Examples

- **Single Glass Panel:** `examples/golden_liquid_glass.rs`
- **Transform & Radii Grid:** `examples/golden_liquid_glass_transform.rs`
