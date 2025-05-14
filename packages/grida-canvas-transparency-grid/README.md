# `@grida/transparency-grid`

Transparency Grid component for Infinite Canvas. A lightweight, performant transparency grid component that supports zooming, panning, and custom transformations.

## Installation

```bash
npm install @grida/transparency-grid
# or
yarn add @grida/transparency-grid
# or
pnpm add @grida/transparency-grid
```

## Usage

### React Component

```tsx
import { TransparencyGrid } from "@grida/transparency-grid/react";

function MyCanvas() {
  const [zoom, setZoom] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });

  return (
    <div className="relative w-full h-full">
      {/* Controls */}
      <div className="absolute top-4 left-4 z-10 bg-background rounded-sm border p-1 text-xs font-mono">
        <div className="flex gap-2">
          <button
            onClick={() => {
              setOffset({ x: 0, y: 0 });
              setZoom(1);
            }}
          >
            Reset
          </button>
          <span>Zoom: {zoom.toFixed(2)}</span>
          <span>
            Offset: ({offset.x.toFixed(2)}, {offset.y.toFixed(2)})
          </span>
        </div>
      </div>

      {/* Transparency Grid */}
      <TransparencyGrid
        width={window.innerWidth}
        height={window.innerHeight}
        transform={[
          [zoom, 0, offset.x],
          [0, zoom, offset.y],
        ]}
      />
    </div>
  );
}
```

### Core API (Non-React)

```typescript
import { TransparencyGrid2D } from "@grida/transparency-grid";

const canvas = document.querySelector("canvas");
const grid = new TransparencyGrid2D(canvas, {
  width: 800,
  height: 600,
  transform: [
    [1, 0, 0],
    [0, 1, 0],
  ],
});

// Update grid
grid.update({
  transform: [
    [2, 0, 100],
    [0, 2, 100],
  ],
});

// Draw
grid.draw();
```

## API Reference

### React Component Props

```typescript
type TransparencyGridProps = {
  width: number; // Width of the grid
  height: number; // Height of the grid
  transform: [
    // 2x3 transformation matrix
    [number, number, number], // [scaleX, skewY, translateX]
    [number, number, number], // [skewX, scaleY, translateY]
  ];
};
```

### Core API Types

```typescript
type TransparencyGridOptions = {
  width: number;
  height: number;
  transform: [[number, number, number], [number, number, number]];
};
```

## Features

- 🎯 Zero dependencies (except for color parsing)
- ⚡️ High performance canvas-based rendering
- 🔍 Support for zooming and panning
- 🎨 Customizable appearance
- 📱 Responsive design
- 🔄 Both React and vanilla JS support
- 🎮 WebGPU support (experimental)

## License

MIT © [Grida](https://grida.co)
