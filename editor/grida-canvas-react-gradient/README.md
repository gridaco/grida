# Gradient Editor with useGradient Hook

This package provides a professional gradient editor supporting linear, radial, and sweep gradients with 2D affine transforms. The editor is now fully controlled via the `useGradient` hook.

## Features

- **Multiple Gradient Types**: Linear, radial, and sweep gradients
- **2D Affine Transforms**: Full control over gradient positioning and scaling
- **Interactive Controls**: Drag control points and color stops
- **Fully Controlled API**: Use the `useGradient` hook for complete control
- **Color Management**: External control over stop colors
- **Accessibility**: Keyboard navigation and screen reader support

## Usage

### Using the GradientEditor Component (Fully Controlled)

The `GradientEditor` component is now fully controlled and requires the `editor` prop from `useGradient`:

```tsx
import GradientEditor, { useGradient } from "@/grida-canvas-react-gradient";

function MyComponent() {
  const editor = useGradient({
    gradientType: "linear",
    initialValue: {
      stops: [
        { offset: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
        { offset: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
      ],
      transform: [
        [1, 0, 0.5],
        [0, 1, 0.5],
      ],
    },
    width: 400,
    height: 300,
  });

  // External color management
  const updateStopColor = (index: number, color: cg.RGBA8888) => {
    editor.updateStopColor(index, color);
  };

  return (
    <GradientEditor
      width={400}
      height={300}
      gradientType="linear"
      editor={editor}
    />
  );
}
```

### Using the useGradient Hook Directly

For complete control, you can use the hook directly and build your own UI:

```tsx
import { useGradient } from "@/grida-canvas-react-gradient";

function CustomGradientEditor() {
  const editor = useGradient({
    gradientType: "linear",
    width: 400,
    height: 300,
    initialValue: {
      stops: [
        { offset: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
        { offset: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
      ],
      transform: [
        [1, 0, 0.5],
        [0, 1, 0.5],
      ],
    },
  });

  return (
    <div ref={editor.containerRef} className="relative">
      {/* Your custom UI using editor state and actions */}
      <div
        onPointerDown={editor.handlePointerDown}
        onPointerMove={editor.handlePointerMove}
        onPointerUp={editor.handlePointerUp}
        onPointerLeave={editor.handlePointerLeave}
      >
        {/* Render control points and stops */}
        {editor.stops.map((stop, index) => (
          <div key={index}>
            {/* Custom stop UI */}
            <input
              type="color"
              value={rgbaToHex(stop.color)}
              onChange={(e) =>
                editor.updateStopColor(index, hexToRgba(e.target.value))
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
```

## API Reference

### GradientEditor Component

```tsx
interface GradientEditorProps {
  width?: number;
  height?: number;
  gradientType: GradientType;
  editor: UseGradientReturn; // Required - from useGradient hook
}
```

### useGradient Hook

```tsx
const editor = useGradient({
  gradientType: "linear" | "radial" | "sweep",
  initialValue?: GradientValue,
  width?: number,
  height?: number,
  readonly?: boolean,
  preventDefault?: boolean,
  stopPropagation?: boolean,
});
```

#### Returned Object

```tsx
{
  // State
  state: GradientState,
  readonly: boolean,

  // Transform and positioning
  transform: GradientTransform,
  controlPoints: { A: Point, B: Point, C: Point },

  // Stops management
  stops: cg.GradientStop[],
  focusedStop: number | null,
  focusedControl: "A" | "B" | "C" | null,

  // Actions
  dispatch: React.Dispatch<any>,

  // Transform actions
  setTransform: (transform: GradientTransform) => void,
  updateControlPoint: (point: "A" | "B" | "C", deltaX: number, deltaY: number) => void,

  // Stop actions
  setStops: (stops: cg.GradientStop[]) => void,
  addStop: (stop: cg.GradientStop) => void,
  updateStop: (index: number, updates: Partial<cg.GradientStop>) => void,
  removeStop: (index: number) => void,
  updateStopColor: (index: number, color: cg.RGBA8888) => void,
  updateStopOffset: (index: number, offset: number) => void,

  // Focus actions
  setFocusedStop: (index: number | null) => void,
  setFocusedControl: (control: "A" | "B" | "C" | null) => void,
  resetFocus: () => void,

  // Pointer event handlers
  handlePointerDown: (e: React.PointerEvent) => void,
  handlePointerMove: (e: React.MouseEvent | PointerEvent) => void,
  handlePointerUp: (e?: React.MouseEvent | PointerEvent) => void,
  handlePointerLeave: (e?: React.MouseEvent) => void,

  // Utility functions
  getStopMarkerTransform: (position: number) => TransformResult,
  getValue: () => GradientValue,

  // Container ref
  containerRef: React.RefObject<HTMLDivElement | null>,
}
```

### Types

```tsx
interface GradientValue {
  stops: cg.GradientStop[];
  transform: cg.AffineTransform;
}

interface GradientTransform {
  a: number;
  b: number;
  tx: number;
  d: number;
  e: number;
  ty: number;
}

interface GradientState {
  transform: GradientTransform;
  stops: cg.GradientStop[];
  focusedStop: number | null;
  focusedControl: "A" | "B" | "C" | null;
  dragState: {
    type: "stop" | "A" | "B" | "C" | null;
    index?: number;
    offset?: { x: number; y: number };
  };
  hoverPreview: {
    position: number;
    screenX: number;
    screenY: number;
  } | null;
}
```

## Control Points

- **A Point**: Center/Start point of the gradient
- **B Point**: End/Radius point - controls rotation and main radius
- **C Point**: Scale point - controls perpendicular scaling

For linear gradients only **A** and **B** are visible. In radial and sweep
gradients the **C** control remains locked perpendicular to the A–B axis and
adjusts the minor radius of the ellipse.

## Migration from Previous Version

If you were using the previous uncontrolled version:

**Before:**

```tsx
<GradientEditor
  gradientType="linear"
  initialValue={gradientValue}
  onValueChange={setGradientValue}
/>
```

**After:**

```tsx
const editor = useGradient({
  gradientType: "linear",
  initialValue: gradientValue,
});

// Sync changes back to your state
React.useEffect(() => {
  const value = editor.getValue();
  setGradientValue(value);
}, [editor.stops, editor.transform]);

<GradientEditor gradientType="linear" editor={editor} />;
```

## Examples

See the demo page at `/app/(dev)/ui/gradient-editor/page.tsx` for a complete example showing the new controlled usage pattern.
