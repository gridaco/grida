# `@grida/ruler`

Zero-Dependency Canvas Ruler Component for Infinite Canvas. A lightweight, performant ruler component that supports zooming, panning, and custom markers.

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
      />

      {/* Vertical Ruler */}
      <AxisRuler
        axis="y"
        width={24}
        height={window.innerHeight}
        zoom={zoom}
        offset={offset.y}
        ranges={ranges}
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

### React Component Props

```typescript
type RulerProps = {
  axis: "x" | "y"; // Ruler orientation
  width: number; // Width of the ruler
  height: number; // Height of the ruler
  zoom: number; // Current zoom level
  offset: number; // Current offset/scroll position
  marks?: Tick[]; // Optional custom marks
  ranges?: Range[]; // Optional ranges to highlight
  font?: string; // Optional font specification
  textSideOffset?: number; // Optional text offset
  overlapThreshold?: number; // Optional threshold for overlapping marks
  steps?: number; // Optional step size for marks
};

type Tick = {
  pos: number; // Position on the ruler
  color?: string; // Optional color
  text?: string; // Optional label
};

type Range = [number, number]; // [start, end]
```

### Core API Types

```typescript
type RulerOptions = {
  axis: "x" | "y";
  zoom: number;
  offset: number;
  marks?: Tick[];
  ranges?: Range[];
  font?: string;
  textSideOffset?: number;
  overlapThreshold?: number;
  steps?: number;
};
```

## Features

- 🎯 Zero dependencies
- ⚡️ High performance canvas-based rendering
- 🔍 Support for zooming and panning
- 📏 Custom markers and ranges
- 🎨 Customizable appearance
- 📱 Responsive design
- 🔄 Both React and vanilla JS support

## License

MIT © [Grida](https://grida.co)
