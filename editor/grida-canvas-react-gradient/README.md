# Gradient Editor Components

This package provides professional gradient editor components supporting linear, radial, and sweep gradients with 2D affine transforms. The package includes both a controlled component (`GradientControlPointsEditor`) and utility functions for gradient manipulation.

## Features

- **Multiple Gradient Types**: Linear, radial, and sweep gradients
- **2D Affine Transforms**: Full control over gradient positioning and scaling
- **Interactive Controls**: Drag control points and color stops
- **Controlled Component API**: Simplified, externally-controlled interface
- **Color Management**: External control over stop colors
- **Accessibility**: Keyboard navigation and screen reader support
- **Utility Functions**: Transform conversion, position calculations, and more

## Components

### GradientControlPointsEditor

A redesigned gradient editor component with a simplified, externally-controlled API.

#### Overview

`GradientControlPointsEditor` follows a controlled component pattern. Instead of managing all state internally, this component exposes individual fields and events, allowing the parent component to manage the state.

#### Key Differences from Legacy Components

**Legacy GradientEditor:**

- Used the `useGradient` hook internally
- Managed all state (positions, colors, control points) internally
- Required complex initialization with `GradientValue`
- Automatically converted between transforms and control points
- Harder to integrate with external state management

**New GradientControlPointsEditor:**

- Exposes a simplified, controlled API
- State is managed externally by the parent component
- Direct control over stops, focused stop, and control points
- Parent manages transform conversion
- Easier to integrate with external state management systems

#### Responsibilities

**What it manages:**

- Control points interaction and dragging
- Stop position changes through dragging
- Visual feedback (hover, focus states)
- Keyboard interactions (Delete/Backspace to remove stops)
- Click-to-add new stops on the gradient track

**What it does NOT manage:**

- Color management of stops (parent's responsibility)
- Transform calculations (parent converts between points and transforms)
- Persistence of state
- Complex gradient logic

#### Usage Example

```tsx
import {
  GradientControlPointsEditor,
  getPointsFromTransform,
  getTransformFromPoints,
} from "@/grida-canvas-react-gradient";

function MyGradientEditor() {
  const [gradient, setGradient] = useState<cg.GradientPaint>({
    type: "linear_gradient",
    stops: [
      { offset: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
      { offset: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
    ],
    transform: [
      [1, 0, 0],
      [0, 1, 0],
    ],
  });

  const [focusedStop, setFocusedStop] = useState<number | null>(null);

  // Convert transform to control points
  const points = useMemo(() => {
    const controlPoints = getPointsFromTransform(gradient.transform, "linear");
    return [controlPoints.A, controlPoints.B, controlPoints.C] as const;
  }, [gradient.transform]);

  const handlePointsChange = useCallback((newPoints) => {
    const transform = getTransformFromPoints(
      { A: newPoints[0], B: newPoints[1], C: newPoints[2] },
      "linear"
    );

    setGradient((prev) => ({
      ...prev,
      transform,
    }));
  }, []);

  const handlePositionChange = useCallback((index, position) => {
    setGradient((prev) => ({
      ...prev,
      stops: prev.stops.map((stop, i) =>
        i === index ? { ...stop, offset: position } : stop
      ),
    }));
  }, []);

  const handleInsertStop = useCallback((at, position) => {
    const newStop = {
      offset: position,
      color: kolor.colorformats.RGB888A32F.GRAY,
    };
    setGradient((prev) => ({
      ...prev,
      stops: [...prev.stops.slice(0, at), newStop, ...prev.stops.slice(at)],
    }));
    setFocusedStop(at);
  }, []);

  const handleDeleteStop = useCallback(
    (index) => {
      if (gradient.stops.length <= 2) return;

      setGradient((prev) => ({
        ...prev,
        stops: prev.stops.filter((_, i) => i !== index),
      }));

      if (focusedStop === index) {
        setFocusedStop(null);
      }
    },
    [gradient.stops.length, focusedStop]
  );

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

## API Reference

### GradientControlPointsEditor Component

```tsx
interface GradientControlPointsEditorProps {
  stops: { offset: number; color: cg.RGBA8888 }[];
  focusedStop: number | null;
  points?: [Point, Point, Point];
  initialPoints?: [Point, Point, Point];
  width?: number;
  height?: number;
  gradientType: GradientType;
  readonly?: boolean;
  onPointsChange?: (points: [Point, Point, Point]) => void;
  onPositionChange?: (index: number, position: number) => void;
  onInsertStop?: (at: number, position: number) => void;
  onDeleteStop?: (index: number) => void;
  onFocusedStopChange?: (index: number | null) => void;
}
```

### Props

| Prop                  | Type                                       | Description                                            |
| --------------------- | ------------------------------------------ | ------------------------------------------------------ |
| `stops`               | `{ offset: number; color: cg.RGBA8888 }[]` | Array of gradient stops                                |
| `focusedStop`         | `number \| null`                           | Index of currently focused stop                        |
| `points`              | `[Point, Point, Point]?`                   | Control points for gradient transform (optional)       |
| `initialPoints`       | `[Point, Point, Point]?`                   | Initial control points (used if `points` not provided) |
| `width`               | `number?`                                  | Canvas width (default: 400)                            |
| `height`              | `number?`                                  | Canvas height (default: 300)                           |
| `gradientType`        | `GradientType`                             | Type of gradient (linear, radial, sweep)               |
| `readonly`            | `boolean?`                                 | Whether editor is read-only                            |
| `onPointsChange`      | `(points) => void`                         | Called when control points change                      |
| `onPositionChange`    | `(index, position) => void`                | Called when stop position changes                      |
| `onInsertStop`        | `(at, position) => void`                   | Called when new stop should be inserted                |
| `onDeleteStop`        | `(index) => void`                          | Called when stop should be deleted                     |
| `onFocusedStopChange` | `(index) => void`                          | Called when focused stop changes                       |

### Events

- **Control Point Dragging**: Updates `onPointsChange` with new control point positions
- **Stop Position Dragging**: Updates `onPositionChange` with new stop position
- **Click on Track**: Triggers `onInsertStop` with calculated position
- **Delete/Backspace Key**: Triggers `onDeleteStop` for focused stop
- **Focus Changes**: Updates `onFocusedStopChange` when user focuses different elements

### Types

```tsx
interface Point {
  x: number;
  y: number;
}

interface ControlPoints {
  A: Point;
  B: Point;
  C: Point;
}

type GradientType = "linear" | "radial" | "sweep";
```

## Utility Functions

The package also exports utility functions for gradient manipulation:

### Transform Conversion

```tsx
// Convert transform matrix to control points
getPointsFromTransform(transform: cg.AffineTransform, gradientType: GradientType): ControlPoints

// Convert control points to transform matrix
getTransformFromPoints(points: ControlPoints, gradientType: GradientType): cg.AffineTransform
```

### Position Calculations

```tsx
// Convert screen coordinates to gradient position
screenToGradientPosition(x: number, y: number, gradientType: GradientType, points: ControlPoints, width: number, height: number): number

// Convert gradient position to screen coordinates
gradientPositionToScreen(position: number, gradientType: GradientType, points: ControlPoints, width: number, height: number): Point
```

### Stop Management

```tsx
// Insert a stop at the correct sorted position
insertStopInSortedPosition(positions: number[], colors: cg.RGBA8888[], newPosition: number, newColor: cg.RGBA8888): { positions: number[]; colors: cg.RGBA8888[]; insertedIndex: number }

// Sort stops by offset after position change
sortStopsByOffset(positions: number[], colors: cg.RGBA8888[], originalIndex: number): { positions: number[]; colors: cg.RGBA8888[]; newIndex: number }
```

## Control Points

- **A Point**: Center/Start point of the gradient
- **B Point**: End/Radius point - controls rotation and main radius
- **C Point**: Scale point - controls perpendicular scaling

For linear gradients only **A** and **B** are visible. In radial and sweep
gradients the **C** control remains locked perpendicular to the A–B axis and
adjusts the minor radius of the ellipse.
Moving **A** or **B** translates or scales the ellipse while keeping **C**
perpendicular. Dragging **C** only changes the minor radius.

## Integration with Surface Editor

The component is already integrated into the `surface-gradient-editor.tsx` file, replacing the previous implementation. This allows for better state management in the context of the larger editor system.

## Benefits

1. **Simplified State Management**: Parent controls all state, making it easier to integrate with complex state systems
2. **Better Performance**: No internal state changes that might cause unnecessary re-renders
3. **More Flexible**: Parent can implement custom logic for stop management, color interpolation, etc.
4. **Easier Testing**: Component behavior is more predictable with external state
5. **Better Integration**: Works seamlessly with existing editor state management patterns

## Migration from Legacy Components

If you were using the previous `GradientEditor` with `useGradient`:

**Before:**

```tsx
import GradientEditor, { useGradient } from "@/grida-canvas-react-gradient";

function MyComponent() {
  const editor = useGradient({
    gradientType: "linear",
    initialValue: gradientValue,
  });

  return <GradientEditor gradientType="linear" editor={editor} />;
}
```

**After:**

```tsx
import {
  GradientControlPointsEditor,
  getPointsFromTransform,
  getTransformFromPoints,
} from "@/grida-canvas-react-gradient";

function MyComponent() {
  const [gradient, setGradient] = useState(gradientValue);
  const [focusedStop, setFocusedStop] = useState(null);

  const points = useMemo(() => {
    const controlPoints = getPointsFromTransform(gradient.transform, "linear");
    return [controlPoints.A, controlPoints.B, controlPoints.C];
  }, [gradient.transform]);

  const handlePointsChange = useCallback((newPoints) => {
    const transform = getTransformFromPoints(
      { A: newPoints[0], B: newPoints[1], C: newPoints[2] },
      "linear"
    );
    setGradient((prev) => ({ ...prev, transform }));
  }, []);

  return (
    <GradientControlPointsEditor
      stops={gradient.stops}
      focusedStop={focusedStop}
      points={points}
      gradientType="linear"
      onPointsChange={handlePointsChange}
      onPositionChange={(index, position) => {
        setGradient((prev) => ({
          ...prev,
          stops: prev.stops.map((stop, i) =>
            i === index ? { ...stop, offset: position } : stop
          ),
        }));
      }}
      onInsertStop={(at, position) => {
        const newStop = {
          offset: position,
          color: kolor.colorformats.RGB888A32F.GRAY,
        };
        setGradient((prev) => ({
          ...prev,
          stops: [...prev.stops.slice(0, at), newStop, ...prev.stops.slice(at)],
        }));
        setFocusedStop(at);
      }}
      onDeleteStop={(index) => {
        if (gradient.stops.length > 2) {
          setGradient((prev) => ({
            ...prev,
            stops: prev.stops.filter((_, i) => i !== index),
          }));
        }
      }}
      onFocusedStopChange={setFocusedStop}
    />
  );
}
```

## Examples

See the demo page at `/app/(dev)/ui/gradient-editor/page.tsx` for a complete example showing the new controlled usage pattern with local state management.
