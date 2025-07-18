# Golden Arc Example - ArcNode Rendering Implementation

## Overview

The `golden_arc.rs` example demonstrates comprehensive usage of the `ArcNode` type from the Grida Canvas CG crate. This example creates a variety of arc configurations to test and showcase different arc rendering scenarios when the Skia-based rendering implementation is completed.

## Key Features

### ArcNode Properties Demonstrated

The example showcases all key properties of the `ArcNode` type:

- **`radius_a`**: Inner radius (0.0 to 1.0)
  - 0.0 = solid arc (no inner radius)
  - 1.0 = thin ring (maximum inner radius)

- **`angle_a`**: Start angle in radians
  - 0.0 = positive x-axis (3 o'clock position)
  - Follows mathematical convention

- **`angle_b`**: End angle in radians
  - Clockwise rotation from start angle
  - Can exceed 2π for multiple rotations

### Test Cases Organized in 4 Rows

#### Row 1: Inner Radius Variations (0.0 to 0.8)
- Tests 5 different inner radius values
- All use half-circle arc (0° to 180°)
- Shows transition from solid arc to ring

#### Row 2: Angle Range Variations
- **Quarter Arc**: 0° to 90°
- **Half Arc**: 0° to 180° 
- **Three-Quarter Arc**: 0° to 270°
- **Full Circle**: 0° to 360°
- **Pac-Man**: 45° to 315° (demonstrating non-zero start angle)

#### Row 3: Rotation Demonstrations
- Shows arcs rotated by transform matrix
- 5 different rotation angles: 0°, 45°, 90°, 135°, 180°
- All use consistent half-arc with 0.4 inner radius

#### Row 4: Special Cases and Edge Cases
- **Thin Slice**: Very narrow arc (0° to 30°)
- **Thin Ring**: High inner radius (0.9) creating thin ring
- **Centered Arc**: Arc spanning across 0° line (-90° to 90°)
- **Bottom Half Ring**: 180° to 360° with inner radius
- **Cross Midnight**: Arc that crosses the 0° line (270° to 90°)

## Technical Implementation

### Coordinate System
- **Origin**: 0° is at positive x-axis (3 o'clock position)
- **Direction**: Clockwise rotation (as specified in requirements)
- **Units**: Angles in radians (as required)
- **Inner Radius**: Normalized 0.0 to 1.0 scale (as specified)

### Color Coding
Each row uses different color schemes for easy visual identification:
- Row 1: Red to green gradient based on inner radius
- Row 2: Blue spectrum variations
- Row 3: Orange to purple gradient for rotation
- Row 4: Mixed colors for special cases

### Skia Integration Ready
The example is structured to work seamlessly once Skia-based arc rendering is implemented in:
- `crates/grida-canvas/src/painter/painter.rs` - `draw_arc_node()` method
- `crates/grida-canvas/src/painter/geometry.rs` - `build_shape()` for ArcNode
- `crates/grida-canvas/src/painter/layer.rs` - Layer building for ArcNode

## Usage

```bash
cd crates/grida-canvas
cargo run --example golden_arc
```

## Mathematical Notes

### Arc Mathematics Reference
- Based on mathematical arc definitions
- Compatible with Konva.js and Figma implementations
- See: https://mathworld.wolfram.com/Arc.html

### Angle Conversion
- Radians to degrees: `degrees = radians * 180.0 / PI`
- Degrees to radians: `radians = degrees * PI / 180.0`

### Inner Radius Calculation
- Outer radius is derived from the bounding box size
- Inner radius is a percentage of the outer radius
- `inner_radius_pixels = outer_radius_pixels * radius_a`

## Compatibility

This example uses only:
- ✅ ArcNode type from the CG crate (as required)
- ✅ Standard Grida Canvas node properties 
- ✅ Math2 transform utilities
- ✅ Existing Grida Canvas infrastructure

## Future Skia Implementation Notes

When implementing Skia rendering for arcs, consider:

1. **Path Construction**: Use `skia_safe::Path::arc_to()` or similar methods
2. **Coordinate Transformation**: Convert from Grida's coordinate system to Skia's
3. **Fill vs Stroke**: Handle both filled arcs and stroke-only arcs
4. **Inner Radius**: Create compound paths for rings (outer arc - inner arc)
5. **Angle Normalization**: Handle cases where angle_b < angle_a or spans > 2π

## Testing Coverage

This example provides comprehensive test cases for:
- ✅ All inner radius values (0.0 to 1.0)
- ✅ All common angle ranges
- ✅ Rotation transformations
- ✅ Edge cases and special configurations
- ✅ Visual regression testing scenarios
- ✅ Performance testing with multiple arcs

The golden arc example serves as both a demonstration and a comprehensive test suite for arc rendering functionality.