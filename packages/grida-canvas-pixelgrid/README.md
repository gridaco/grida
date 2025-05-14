# @grida/pixel-grid

A React component for rendering pixel-perfect grids in infinite canvas applications. This package provides a flexible and performant way to display grid patterns with zoom and pan capabilities.

## Installation

```bash
npm install @grida/pixel-grid
# or
yarn add @grida/pixel-grid
# or
pnpm add @grida/pixel-grid
```

## Features

- 🎯 Pixel-perfect grid rendering
- 🔍 Zoom and pan support
- 🎨 Customizable grid appearance
- 🚀 High performance with React
- 📱 Responsive design support

## Usage

```tsx
import { PixelGrid } from "@grida/pixel-grid/react";

function MyComponent() {
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);

  return (
    <PixelGrid
      width={window.innerWidth}
      height={window.innerHeight}
      transform={[
        [zoom, 0, offset.x],
        [0, zoom, offset.y],
      ]}
    />
  );
}
```

### Props

| Prop        | Type                                                   | Description                               |
| ----------- | ------------------------------------------------------ | ----------------------------------------- |
| `width`     | `number`                                               | Width of the grid container               |
| `height`    | `number`                                               | Height of the grid container              |
| `transform` | `[[number, number, number], [number, number, number]]` | Transformation matrix for zoom and offset |

## Advanced Usage

The component works well with gesture libraries like `@use-gesture/react` for handling zoom and pan interactions:

```tsx
import { useGesture } from "@use-gesture/react";

function AdvancedExample() {
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);

  useGesture(
    {
      onWheel: ({ delta, ctrlKey, event }) => {
        event.preventDefault();
        if (ctrlKey) {
          setZoom((prev) => prev - delta[1] * 0.01);
        } else {
          setOffset((prev) => ({
            x: prev.x - delta[0],
            y: prev.y - delta[1],
          }));
        }
      },
    },
    {
      wheel: {
        eventOptions: {
          passive: false,
        },
      },
      target: ref,
    }
  );

  return (
    <PixelGrid
      width={window.innerWidth}
      height={window.innerHeight}
      transform={[
        [zoom, 0, offset.x],
        [0, zoom, offset.y],
      ]}
    />
  );
}
```

## License

MIT © [Grida](https://grida.co)
