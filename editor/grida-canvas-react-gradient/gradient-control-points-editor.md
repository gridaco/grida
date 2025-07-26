# GradientControlPointsEditor

A redesigned gradient editor component with a simplified, externally-controlled API.

## Overview

`GradientControlPointsEditor` is a new version of the gradient editor that follows a more controlled component pattern. Instead of managing all state internally like the original `GradientEditor`, this component exposes individual fields and events, allowing the parent component to manage the state.

## Key Differences from Original GradientEditor

### Original GradientEditor
- Used the `useGradient` hook internally
- Managed all state (positions, colors, control points) internally
- Required complex initialization with `GradientValue`
- Automatically converted between transforms and control points
- Harder to integrate with external state management

### New GradientControlPointsEditor
- Exposes a simplified, controlled API
- State is managed externally by the parent component
- Direct control over stops, focused stop, and control points
- Parent manages transform conversion
- Easier to integrate with external state management systems

## Responsibilities

### What it manages:
- Control points interaction and dragging
- Stop position changes through dragging
- Visual feedback (hover, focus states)
- Keyboard interactions (Delete/Backspace to remove stops)
- Click-to-add new stops on the gradient track

### What it does NOT manage:
- Color management of stops (parent's responsibility)
- Transform calculations (parent converts between points and transforms)
- Persistence of state
- Complex gradient logic

## Usage Example

```tsx
import { GradientControlPointsEditor } from "@/grida-canvas-react-gradient";

function MyGradientEditor() {
  const [gradient, setGradient] = useState<cg.GradientPaint>({
    type: "linear_gradient",
    stops: [
      { offset: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
      { offset: 1, color: { r: 0, g: 0, b: 255, a: 1 } }
    ],
    transform: [[1, 0, 0], [0, 1, 0]]
  });

  const [focusedStop, setFocusedStop] = useState<number | null>(null);

  // Convert transform to control points
  const points = useMemo(() => {
    const transform = {
      a: gradient.transform[0][0],
      b: gradient.transform[0][1], 
      tx: gradient.transform[0][2],
      d: gradient.transform[1][0],
      e: gradient.transform[1][1],
      ty: gradient.transform[1][2],
    };
    const controlPoints = getPointsFromTransform(transform, "linear");
    return [controlPoints.A, controlPoints.B, controlPoints.C] as const;
  }, [gradient.transform]);

  const handlePointsChange = useCallback((newPoints) => {
    const transform = getTransformFromPoints(
      { A: newPoints[0], B: newPoints[1], C: newPoints[2] },
      "linear"
    );
    
    setGradient(prev => ({
      ...prev,
      transform: [
        [transform.a, transform.b, transform.tx],
        [transform.d, transform.e, transform.ty],
      ],
    }));
  }, []);

  const handlePositionChange = useCallback((index, position) => {
    setGradient(prev => ({
      ...prev,
      stops: prev.stops.map((stop, i) => 
        i === index ? { ...stop, offset: position } : stop
      )
    }));
  }, []);

  const handleInsertStop = useCallback((at, position) => {
    const newStop = { offset: position, color: { r: 128, g: 128, b: 128, a: 1 } };
    setGradient(prev => ({
      ...prev,
      stops: [
        ...prev.stops.slice(0, at),
        newStop,
        ...prev.stops.slice(at)
      ]
    }));
    setFocusedStop(at);
  }, []);

  const handleDeleteStop = useCallback((index) => {
    if (gradient.stops.length <= 2) return;
    
    setGradient(prev => ({
      ...prev,
      stops: prev.stops.filter((_, i) => i !== index)
    }));
    
    if (focusedStop === index) {
      setFocusedStop(null);
    }
  }, [gradient.stops.length, focusedStop]);

  return (
    <GradientControlPointsEditor
      stops={gradient.stops}
      focusedStop={focusedStop}
      points={points}
      gradientType="linear"
      onPointsChange={handlePointsChange}
      onPositionChange={handlePositionChange}
      onInsertStop={handleInsertStop}
      onDeleteStop={handleDeleteStop}
      onFocusedStopChange={setFocusedStop}
    />
  );
}
```

## Integration with Surface Editor

The component is already integrated into the `surface-gradient-editor.tsx` file, replacing the previous implementation. This allows for better state management in the context of the larger editor system.

## API Reference

### Props

| Prop | Type | Description |
|------|------|-------------|
| `stops` | `{ offset: number; color: cg.RGBA8888 }[]` | Array of gradient stops |
| `focusedStop` | `number \| null` | Index of currently focused stop |
| `points` | `[Point, Point, Point]` | Control points for gradient transform |
| `width` | `number?` | Canvas width (default: 400) |
| `height` | `number?` | Canvas height (default: 300) |
| `gradientType` | `GradientType` | Type of gradient (linear, radial, sweep) |
| `readonly` | `boolean?` | Whether editor is read-only |
| `onPointsChange` | `(points) => void` | Called when control points change |
| `onPositionChange` | `(index, position) => void` | Called when stop position changes |
| `onInsertStop` | `(at, position) => void` | Called when new stop should be inserted |
| `onDeleteStop` | `(index) => void` | Called when stop should be deleted |
| `onFocusedStopChange` | `(index) => void` | Called when focused stop changes |

### Events

- **Control Point Dragging**: Updates `onPointsChange` with new control point positions
- **Stop Position Dragging**: Updates `onPositionChange` with new stop position
- **Click on Track**: Triggers `onInsertStop` with calculated position
- **Delete/Backspace Key**: Triggers `onDeleteStop` for focused stop
- **Focus Changes**: Updates `onFocusedStopChange` when user focuses different elements

## Benefits

1. **Simplified State Management**: Parent controls all state, making it easier to integrate with complex state systems
2. **Better Performance**: No internal state changes that might cause unnecessary re-renders
3. **More Flexible**: Parent can implement custom logic for stop management, color interpolation, etc.
4. **Easier Testing**: Component behavior is more predictable with external state
5. **Better Integration**: Works seamlessly with existing editor state management patterns