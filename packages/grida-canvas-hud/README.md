# @grida/hud

Canvas-based heads-up display (HUD) for the Grida editor viewport.

Replaces per-frame React DOM/SVG rendering with imperative Canvas 2D draw calls. A single `<canvas>` element replaces dozens of individually positioned and reconciled DOM nodes, eliminating React reconciliation, DOM mutation, and browser layout costs from the hot path.

## What is a HUD?

The HUD is the non-content visual chrome drawn on top of the viewport: snap guides, rulers, selection handles, measurement lines, spacing indicators, pixel grids. Everything the operator sees that isn't part of the document itself.

In industry terms: Blender calls this "Overlays", Unity calls it "Gizmos", game engines call it "HUD". We use HUD.

## Architecture

```
┌─────────────────────────────────────┐
│  Viewport (event target, gestures)  │
│  ┌───────────────────────────────┐  │
│  │  Content canvas (document)    │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  HUD canvas (this package)    │  │  ← pointer-events: none
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

The HUD is a transparent `<canvas>` layered above the content. It receives draw commands and renders them imperatively. It does not own state or handle events.

### Core / React split

- **Core** (`@grida/hud`) — imperative canvas renderer classes. No React dependency. Can be used with any framework or standalone.
- **React** (`@grida/hud/react`) — thin `useEffect`-based wrappers that bridge editor state to the core renderer.

## Current features

### Snap guide

Renders snap alignment feedback during drag gestures:

- **Lines** — axis-aligned segments connecting aligned agent/anchor points
- **Rules** — full-viewport lines for guide snapping
- **Crosshairs** — X markers at snap hit points
- **Labels** — gap measurement pills on spacing snap lines

## Primitives

At the lowest level, the HUD draws a small set of geometric primitives. Many higher-level features decompose into the same shapes:

| Primitive    | Description                              | Used by                                           |
| ------------ | ---------------------------------------- | ------------------------------------------------- |
| Line segment | `(x1,y1)→(x2,y2)`, optional label        | Snap lines, measurement lines, spacing indicators |
| Rule         | Axis-aligned line spanning full viewport | Guide snapping, ruler guides                      |
| Crosshair    | Small X marker at a point                | Snap hit points                                   |
| Label pill   | Text with background at a point          | Gap measurements, size labels                     |

Snap guides and ruler guides are the same primitive (a line) — one has a label, one does not. As more features move to the HUD, they will compose from these same primitives rather than introducing new rendering concepts.

## Growth path

Features currently rendered as React DOM in `surface.tsx` that can progressively move here:

| Feature                        | Current                                   | Primitives needed            |
| ------------------------------ | ----------------------------------------- | ---------------------------- |
| **Snap guides**                | **HUD canvas**                            | Line, Rule, Crosshair, Label |
| Measurement guides             | React SVG (`<Line>`, `<MeterLabel>`)      | Line, Label                  |
| Ruler guides (draggable lines) | React SVG (`<Rule>`)                      | Rule                         |
| Selection bounding box         | React div with border                     | Rect (stroke)                |
| Resize handles                 | React div                                 | Rect (fill), Circle          |
| Rotation handle                | React div                                 | Circle, Line                 |
| Corner radius handles          | React SVG                                 | Arc, Circle                  |
| Pixel grid                     | Separate `<canvas>` (`@grida/pixel-grid`) | Grid (could merge)           |
| Marquee / lasso                | React div / SVG                           | Rect (stroke), Path          |
| Spacing gap indicators         | React SVG                                 | Line, Label                  |
| Node padding/gap overlays      | React div                                 | Rect (fill, translucent)     |

The migration is incremental — each feature can move independently. The HUD canvas coexists with remaining DOM overlays during the transition.

## Usage

### Imperative (core)

```ts
import { SnapGuideCanvas } from "@grida/hud";

const canvas = document.createElement("canvas");
const hud = new SnapGuideCanvas(canvas, { color: "#e83829" });

hud.setSize(window.innerWidth, window.innerHeight);
hud.setTransform(viewportTransform);
hud.draw(snapGuideData); // or undefined to clear
```

### React

```tsx
import { SnapGuide } from "@grida/hud/react";

<SnapGuide
  width={viewport.clientWidth}
  height={viewport.clientHeight}
  transform={transform}
  snapping={surface_snapping}
  color="#e83829"
/>;
```
