# New Gradient Control Points Editor API

This document describes the new clean API for gradient editing that solves the controlled/uncontrolled value issues and infinite update loops.

## Problem with the Old API

The previous `useGradient` hook and `GradientEditor` combination had issues when used with multiple sources of state updates:

- Controlled/uncontrolled value conflicts
- Infinite update loops when external state changes
- Complex state management mixing UI state with data state
- Difficult to integrate with external fill management

## New Clean API

### Core Components

1. **`GradientControlPointsEditor`** - Clean UI component with explicit props
2. **`useGradientEditorIntegration`** - Integration hook for editor connectivity
3. **`useGradientControlPoints`** - Deprecated wrapper for backward compatibility

### GradientControlPointsEditor Props

```typescript
interface GradientControlPointsEditorProps {
  width?: number;
  height?: number;
  gradientType: "linear" | "radial" | "sweep";
  
  // Clean data props
  stops: { offset: number; color: cg.RGBA8888 }[];
  focusedStop: number | null;
  points: [Point, Point, Point]; // [A, B, C]
  
  // Event handlers
  onPointsChange?: (points: [Point, Point, Point]) => void;
  onPositionChange?: (index: number, position: number) => void;
  onInsertStop?: (at: number, position: number) => void;
  onDeleteStop?: (index: number) => void;
  onFocusedStopChange?: (index: number | null) => void;
  
  // Optional props
  readonly?: boolean;
  className?: string;
}
```

### Key Benefits

- **Clean separation**: UI component only handles UI, no complex state management
- **Predictable data flow**: Explicit event handlers, no controlled/uncontrolled issues
- **Easy integration**: Transform computation happens in event handlers
- **External updates**: Can receive updates from anywhere without conflicts
- **No infinite loops**: Pure component approach prevents update cycles

## Usage Examples

### Example 1: Direct Usage

```typescript
function DirectUsage() {
  const [stops, setStops] = useState([
    { offset: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
    { offset: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
  ]);
  
  const [focusedStop, setFocusedStop] = useState<number | null>(null);
  const [points, setPoints] = useState<[Point, Point, Point]>([
    { x: 0, y: 0.5 }, { x: 1, y: 0.5 }, { x: 0, y: 1 }
  ]);

  return (
    <GradientControlPointsEditor
      gradientType="linear"
      stops={stops}
      focusedStop={focusedStop}
      points={points}
      onPointsChange={setPoints}
      onPositionChange={(index, position) => {
        const newStops = [...stops];
        newStops[index] = { ...newStops[index], offset: position };
        setStops(newStops.sort((a, b) => a.offset - b.offset));
      }}
      onFocusedStopChange={setFocusedStop}
    />
  );
}
```

### Example 2: Editor Integration (Recommended)

```typescript
function EditorIntegration({ gradient, onGradientChange }) {
  const integration = useGradientEditorIntegration({
    gradient,
    width: 400,
    height: 300,
    onGradientChange,
  });

  return (
    <GradientControlPointsEditor
      width={400}
      height={300}
      gradientType={integration.gradientType}
      stops={integration.stops}
      focusedStop={integration.focusedStop}
      points={integration.points}
      onPointsChange={integration.onPointsChange}
      onPositionChange={integration.onPositionChange}
      onInsertStop={integration.onInsertStop}
      onDeleteStop={integration.onDeleteStop}
      onFocusedStopChange={integration.onFocusedStopChange}
    />
  );
}
```

## Integration with Main Editor

The `useGradientEditorIntegration` hook automatically:

1. Converts `cg.GradientPaint` to component props
2. Handles points ↔ transform conversion
3. Manages stop insertion/deletion with color interpolation
4. Provides proper focus management
5. Calls `editor.changeNodeFill` with computed transforms

### Transform Computation

When `onPointsChange` is called:

```typescript
const transform = getTransformFromPoints(controlPoints, gradientType);
const newTransform: cg.AffineTransform = [
  [transform.a, transform.b, transform.tx],
  [transform.d, transform.e, transform.ty],
];

// This gets fed to editor.changeNodeFill automatically
onGradientChange({
  ...gradient,
  transform: newTransform,
});
```

## Migration Path

### Current surface-gradient-editor.tsx

**Before:**
```typescript
const g = useGradient({
  gradientType,
  width,
  height,
  initialValue: {
    colors: gradient.stops.map((stop) => stop.color),
    positions: gradient.stops.map((stop) => stop.offset),
    transform: gradient.transform,
  },
  onValueChange: (g) => {
    onValueChange?.({
      type: `${gradientType}_gradient`,
      stops: g.positions.map((position, index) => ({
        offset: position,
        color: g.colors[index],
      })),
      transform: g.transform,
    });
  },
});

return <GradientEditor gradientType={gradientType} editor={g} />;
```

**After:**
```typescript
const integration = useGradientEditorIntegration({
  gradient,
  width,
  height,
  onGradientChange: onValueChange,
});

return (
  <GradientControlPointsEditor
    width={width}
    height={height}
    gradientType={integration.gradientType}
    stops={integration.stops}
    focusedStop={integration.focusedStop}
    points={integration.points}
    onPointsChange={integration.onPointsChange}
    onPositionChange={integration.onPositionChange}
    onInsertStop={integration.onInsertStop}
    onDeleteStop={integration.onDeleteStop}
    onFocusedStopChange={integration.onFocusedStopChange}
  />
);
```

## Files Changed

- ✅ `gradient-control-points-editor.tsx` - New clean component
- ✅ `use-gradient-control-points.ts` - Deprecated hook wrapper
- ✅ `use-gradient-editor-integration.ts` - Integration hook
- ✅ `surface-gradient-editor.tsx` - Updated to use new API
- ✅ `index.ts` - Updated exports
- ✅ `gradient-editor/page.tsx` - Demo uses deprecated hook

## Backward Compatibility

- Old `useGradient` and `GradientEditor` still work
- Demo page uses deprecated `useGradientControlPoints`
- New API is opt-in for new code
- Migration can be done incrementally