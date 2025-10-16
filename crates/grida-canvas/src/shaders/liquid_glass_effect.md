# Liquid Glass Effect Shader

## Overview

A physically-accurate glass shader featuring real-time refraction with chromatic aberration, Fresnel reflections, SDF-based shape rendering, and supersampled anti-aliasing.

Implements top-view orthographic refraction where the backdrop is displaced based on the curved glass surface angle. Uses Schlick's Fresnel approximation and wavelength-dependent refraction for realistic chromatic aberration.

Based on React Native Skia glass shader examples and improved for physical accuracy.

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

- **Physically-Accurate Refraction**: Top-view orthographic refraction with backdrop displacement based on curved glass surface
- **Wavelength-Dependent Chromatic Aberration**: Per-channel IOR calculations for realistic color separation (Cauchy's equation approximation)
- **Schlick's Fresnel**: Physically-based reflections at grazing angles with proper F0 calculation
- **Total Internal Reflection (TIR)**: Handles edge cases where refraction is impossible
- **SDF-based Curved Surface**: Uses signed distance fields to generate 3D lens-like curvature from 2D rounded rectangles
- **Supersampled Anti-aliasing**: 4x4 SSAA for smooth edges and reduced artifacts

## Physical Model

### Top-View Refraction

The shader simulates viewing a curved glass surface from directly above (orthographic projection). The glass acts like a lens, displacing the backdrop based on:

1. **Surface Curvature**: The `depth` parameter controls the height of the curved surface

   - Higher depth = more curved = steeper surface angles at edges
   - The surface shape is derived from the SDF, creating a smooth lens-like profile

2. **Material Refraction**: The `refraction` parameter (0.0-1.0) maps to physical IOR (1.0-2.0)

   - IOR determines how much light bends when entering the glass
   - Higher IOR = more bending = more visible displacement

3. **Displacement Calculation**:
   ```glsl
   displacement = refract_vec(IOR, surface_normal).xy × depth × scale_factor
   ```
   - The refraction vector's XY components determine the offset direction
   - Multiplied by depth for magnitude
   - Result: backdrop appears displaced/magnified at edges

### Why Depth Affects Refraction Strength

Even with the same IOR (material property), thicker glass creates more visible refraction because:

- **Steeper surface angles**: Thicker glass has more pronounced curvature
- **Larger tilt**: Surface normals point more outward at edges
- **Greater displacement**: Both the refraction angle AND the depth multiplier increase

Think of it like magnifying glasses: a thicker lens magnifies more, even if made from the same glass material.

### Chromatic Aberration

Different wavelengths refract at different angles (dispersion):

- **Red light** (λ ≈ 650nm): Lower IOR, bends less
- **Green light** (λ ≈ 550nm): Reference IOR
- **Blue light** (λ ≈ 450nm): Higher IOR, bends more

The shader samples each RGB channel with its own IOR offset, creating the characteristic rainbow fringing at edges.

### Fresnel Reflections

Uses Schlick's approximation for physically-based reflections:

```glsl
F0 = ((1 - IOR) / (1 + IOR))²  // Base reflectance (~4% for glass)
Fresnel = F0 + (1 - F0) × (1 - cos(θ))⁵
```

At normal incidence (looking straight down): minimal reflection
At grazing angles (near edges): strong white highlights

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
  - 0.0 = opaque with full reflection, 1.0 = fully transparent
- `light_angle` (float): Light angle in degrees (reserved for future use)
- `refraction` (float [0.0-1.0]): Refraction strength, internally mapped to IOR [1.0-2.0]
  - 0.0 = no refraction (IOR 1.0, air), 0.5 = typical glass (IOR 1.5), 1.0 = strong refraction (IOR 2.0)
- `depth` (float [1.0+]): Glass thickness in absolute pixels for 3D surface curvature
  - Controls the height of the curved lens surface. Higher values = more pronounced curvature
  - Typical values: 20-100 pixels
  - Minimum enforced: 1.0 pixel
- `dispersion` (float [0.0-1.0]): Chromatic aberration strength (wavelength separation)
  - 0.0 = no color separation, 1.0 = maximum rainbow effect at edges
- `blur_radius` (float [0.0+]): Blur radius for frosted glass effect in pixels (applied via Skia's native blur before shader)

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

- **Reflection**: Reflection color is simplified (white highlights for rim lighting effect)
- **Performance**: Supersampling (4x4) may be expensive for large shapes or real-time applications
- **Fixed Parameters**: `distortionScale` is hardcoded to `1.0` in the shader
- **Top-View Only**: Optimized for orthographic top-view rendering, not perspective 3D
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
        light_intensity: 0.7,  // 0.0-1.0: transmission/transparency
        light_angle: 45.0,     // Reserved for future use
        refraction: 0.5,       // 0.0-1.0: maps to IOR 1.0-2.0 (0.5 = typical glass)
        depth: 50.0,           // Absolute pixels: glass thickness/curvature
        dispersion: 0.5,       // 0.0-1.0: chromatic aberration strength
        blur_radius: 2.0,      // Pixels: background blur for frosted effect
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
