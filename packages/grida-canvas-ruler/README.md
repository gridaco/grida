# `@grida/ruler`

Zero-Dependency Canvas Ruler Component for Infinite Canvas. A lightweight, performant ruler component that supports zooming, panning, custom markers, and subticks.

## Installation

```bash
npm install @grida/ruler
# or
yarn add @grida/ruler
# or
pnpm add @grida/ruler
```

## Usage

### React Component

```tsx
import { AxisRuler, type Tick } from "@grida/ruler/react";

// Define your ranges (e.g., for elements on canvas)
const ranges = [
  [100, 200], // [start, end]
  [400, 500],
  [700, 800],
];

// Optional: Define custom marks
const marks: Tick[] = [{ pos: 50, color: "red", text: "50" }];

function MyCanvas() {
  const [zoom, setZoom] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });

  return (
    <div>
      {/* Horizontal Ruler */}
      <AxisRuler
        axis="x"
        width={window.innerWidth}
        height={24}
        zoom={zoom}
        offset={offset.x}
        ranges={ranges}
        marks={marks}
        subticks="auto"
      />

      {/* Vertical Ruler */}
      <AxisRuler
        axis="y"
        width={24}
        height={window.innerHeight}
        zoom={zoom}
        offset={offset.y}
        ranges={ranges}
        subticks="auto"
      />
    </div>
  );
}
```

### Core API (Non-React)

```typescript
import { RulerCanvas, type RulerOptions } from "@grida/ruler";

const canvas = document.querySelector("canvas");
const ruler = new RulerCanvas(canvas, {
  axis: "x",
  zoom: 1,
  offset: 0,
  ranges: [[100, 200]],
  marks: [{ pos: 50, color: "red", text: "50" }],
  subticks: "auto",
});

// Update ruler
ruler.update({
  zoom: 2,
  offset: 100,
});

// Set size
ruler.setSize(800, 24);

// Draw
ruler.draw();
```

## API Reference

### `RulerOptions`

Used by `RulerCanvas` (core API). The React `<AxisRuler>` component exposes a subset of these — see [React Component Props](#react-component-props) below.

| Property                | Type                                | Default                                                  | Description                                        |
| ----------------------- | ----------------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| `axis`                  | `"x" \| "y"`                        | —                                                        | **Required.** Ruler orientation                    |
| `zoom`                  | `number`                            | `1`                                                      | **Required.** Current zoom level                   |
| `offset`                | `number`                            | `0`                                                      | **Required.** Current offset / scroll position     |
| `steps`                 | `number[]`                          | `[1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]` | Candidate step sizes (1-2-5 series)                |
| `ranges`                | `Range[]`                           | `[]`                                                     | Highlighted ranges                                 |
| `marks`                 | `Tick[]`                            | `[]`                                                     | Custom tick marks                                  |
| `overlapThreshold`      | `number`                            | `80`                                                     | Pixel distance for alpha-fade near priority points |
| `textSideOffset`        | `number`                            | `12`                                                     | Text offset from ruler edge                        |
| `tickHeight`            | `number`                            | `6`                                                      | Height of major tick lines                         |
| `font`                  | `string`                            | `"10px sans-serif"`                                      | CSS font for tick labels                           |
| `backgroundColor`       | `string`                            | `"transparent"`                                          | Ruler background color                             |
| `color`                 | `string`                            | `"rgba(128, 128, 128, 0.5)"`                             | Default tick and label color                       |
| `accentBackgroundColor` | `string`                            | `"rgba(80, 200, 255, 0.25)"`                             | Range highlight fill color                         |
| `accentColor`           | `string`                            | `"rgba(80, 200, 255, 1)"`                                | Range tick and label color                         |
| `subticks`              | `false \| true \| "auto" \| number` | `false`                                                  | Subdivision mode (see [Subticks](#subticks))       |
| `subtickHeight`         | `number`                            | `Math.round(tickHeight * 0.4)`                           | Height of subtick lines                            |
| `subtickColor`          | `string`                            | same as `color`                                          | Color of subtick lines                             |

### Subticks

Subticks are minor tick marks rendered between major ticks. They are unlabeled and shorter than major ticks.

| Value               | Behavior                                                                            |
| ------------------- | ----------------------------------------------------------------------------------- |
| `false` or `0`      | Disabled (default)                                                                  |
| `true` or `"auto"`  | Automatically infer subdivisions from the current step using a 1-2-5 heuristic      |
| `number` (e.g. `5`) | Fixed subdivision count — renders `(n-1)` subticks between each pair of major ticks |

**Auto heuristic** — when the major step is derived from the 1-2-5 series, auto mode picks a natural subdivision:

| Step pattern | Example steps    | Subdivisions |
| ------------ | ---------------- | ------------ |
| 1 × 10^n     | 1, 10, 100, 1000 | 10           |
| 2 × 10^n     | 2, 20, 200, 2000 | 4            |
| 2.5 × 10^n   | 25, 250, 2500    | 5            |
| 5 × 10^n     | 5, 50, 500, 5000 | 5            |

### `Tick`

```typescript
type Tick = {
  pos: number; // Position on the ruler (document-space)
  color: string; // Base color
  font?: string; // CSS font string
  text?: string; // Label text
  textColor?: string; // Label color (defaults to color)
  textAlign?: CanvasTextAlign;
  textAlignOffset?: number;
  strokeColor?: string; // Tick line color (defaults to color)
  strokeWidth?: number; // Tick line width (defaults to 1)
  strokeHeight?: number; // Tick line height (defaults to tickHeight)
};
```

### `Range`

```typescript
type Range = [a: number, b: number];
```

### React Component Props

The React `<AxisRuler>` component accepts:

| Prop               | Type                                | Required | Description                      |
| ------------------ | ----------------------------------- | -------- | -------------------------------- |
| `axis`             | `"x" \| "y"`                        | Yes      | Ruler orientation                |
| `width`            | `number`                            | Yes      | Canvas width in pixels           |
| `height`           | `number`                            | Yes      | Canvas height in pixels          |
| `zoom`             | `number`                            | Yes      | Current zoom level               |
| `offset`           | `number`                            | Yes      | Current offset / scroll position |
| `marks`            | `Tick[]`                            | No       | Custom tick marks                |
| `ranges`           | `Range[]`                           | No       | Highlighted ranges               |
| `steps`            | `number[]`                          | No       | Candidate step sizes             |
| `font`             | `string`                            | No       | CSS font for labels              |
| `textSideOffset`   | `number`                            | No       | Text offset from ruler edge      |
| `overlapThreshold` | `number`                            | No       | Pixel distance for alpha-fade    |
| `subticks`         | `false \| true \| "auto" \| number` | No       | Subdivision mode                 |
| `subtickHeight`    | `number`                            | No       | Height of subtick lines          |
| `subtickColor`     | `string`                            | No       | Color of subtick lines           |

## Features

- Zero dependencies
- High performance canvas-based rendering
- Support for zooming and panning
- Custom markers and ranges
- Subticks (minor ticks) with auto or manual subdivision
- Customizable appearance
- Both React and vanilla JS support

## License

MIT © [Grida](https://grida.co)
