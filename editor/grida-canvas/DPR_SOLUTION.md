# DPR (Device Pixel Ratio) Solution for WASM Canvas Backend

## Problem Summary

The WASM canvas backend previously only handled logical coordinates, causing misalignment on high-DPI displays where `window.devicePixelRatio > 1`. This led to:

1. Blurry rendering on high-DPI displays
2. Incorrect hit testing and geometry queries
3. Misaligned mouse interactions
4. Inconsistent coordinate systems between DOM and WASM backends

## Solution Overview

The cleanest solution handles DPR at the **coordinate conversion layer** rather than modifying the WASM backend itself. This approach:

1. Keeps the WASM backend simple and focused
2. Maintains API consistency
3. Centralizes coordinate transformations
4. Follows the same pattern as the DOM backend

## Implementation

### 1. WASM React Component (`grida-canvas-wasm-react/index.tsx`)

The React component now:
- Detects DPR using `window.devicePixelRatio`
- Sets canvas backing store to `width * dpr, height * dpr`
- Sets CSS size to `width px, height px`
- Passes DPR to the WASM surface resize method

```typescript
// Key changes:
const dpr = useDPR();
rendererRef.current.resize(width * dpr, height * dpr);

<canvas
  width={width * dpr}
  height={height * dpr}
  style={{
    width: `${width}px`,
    height: `${height}px`,
  }}
/>
```

### 2. WASM Backend (`grida-canvas/backends/wasm.ts`)

The backend now:
- Accepts DPR as a constructor parameter
- Scales coordinates to physical pixels before WASM calls
- Scales results back to logical coordinates

```typescript
// Key changes:
constructor(editor: Editor, surface: Grida2D, dpr: number = 1)

getNodeIdsFromPoint(point: cmath.Vector2): string[] {
  const scaledPoint: cmath.Vector2 = [point[0] * this.dpr, point[1] * this.dpr];
  return this.surface.getNodeIdsFromPoint(scaledPoint[0], scaledPoint[1]);
}

getNodeAbsoluteBoundingRect(node_id: string): cmath.Rectangle | null {
  const rect = this.surface.getNodeAbsoluteBoundingBox(node_id);
  if (!rect) return null;
  
  return {
    x: rect.x / this.dpr,
    y: rect.y / this.dpr,
    width: rect.width / this.dpr,
    height: rect.height / this.dpr,
  };
}
```

### 3. Integration Pattern

When creating the editor with WASM backend:

```typescript
const dpr = window.devicePixelRatio || 1;
const geometry = new CanvasWasmGeometryQueryInterfaceProvider(editor, surface, dpr);

// Update DPR when it changes (e.g., window moves between displays)
window.addEventListener('resize', () => {
  const newDpr = window.devicePixelRatio || 1;
  geometry.updateDPR(newDpr);
});
```

## Coordinate System Flow

1. **Client coordinates** (`clientX`, `clientY`) → Browser event coordinates
2. **Viewport coordinates** → Canvas element relative coordinates (`client - viewport offset`)
3. **Canvas coordinates** → Logical scene coordinates (`viewport * inverse transform`)
4. **Physical coordinates** → Device pixel coordinates (`canvas * DPR`)

The WASM surface operates in **physical coordinates**, but the API exposes **canvas coordinates**.

## Benefits

1. **Mathematically accurate**: Coordinates are properly scaled at each transformation step
2. **Consistent API**: All geometry methods work with logical coordinates
3. **Clean separation**: DPR handling is isolated from core rendering logic
4. **Backward compatible**: Existing code continues to work without changes
5. **Performance**: Minimal overhead for coordinate scaling

## Comparison with Alternatives

### ❌ Make WASM DPR-aware
- **Problem**: Requires changing all WASM APIs and Rust code
- **Problem**: Breaks API consistency
- **Problem**: Complex to implement and maintain

### ❌ Scale at client level
- **Problem**: Every API call needs DPR scaling
- **Problem**: Easy to forget scaling in new code
- **Problem**: Inconsistent handling across codebase

### ❌ HUD-only scaling
- **Problem**: Rendering and interaction coordinates misaligned
- **Problem**: Hit testing still broken
- **Problem**: Only partial solution

### ✅ Coordinate conversion layer (chosen solution)
- **Benefit**: Centralized DPR handling
- **Benefit**: Clean API boundaries
- **Benefit**: Follows existing patterns
- **Benefit**: Easy to maintain and extend

## Testing

To verify the solution works correctly:

1. **Visual test**: Canvas should be crisp on high-DPI displays
2. **Interaction test**: Mouse clicks should hit the correct elements
3. **Geometry test**: Bounding boxes should align with visual elements
4. **Cross-DPR test**: Should work correctly when moving between displays with different DPRs

## Future Considerations

1. **DPR changes**: Handle `window.devicePixelRatio` changes when moving between displays
2. **Performance**: Monitor coordinate scaling performance on large scenes
3. **Consistency**: Ensure all canvas-related utilities (rulers, grids, etc.) use the same DPR handling pattern