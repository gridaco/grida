import { color_layer_highlight } from "../theme";

export function OulineSide({
  wh,
  orientation,
  zoom,
  width = 1,
  box,
  color = color_layer_highlight,
}: {
  wh: [number, number];
  box: [number, number, number, number];
  zoom: number;
  orientation: "l" | "t" | "r" | "b";
  width?: number;
  color?: string;
}) {
  const d = 100;
  const [w, h] = wh;

  // is vertical line
  const isvert = orientation === "l" || orientation === "r";
  const l_scalex = isvert ? width / d : (w / d) * zoom;
  const l_scaley = isvert ? (h / d) * zoom : width / d;

  let trans = { x: 0, y: 0 };
  switch (orientation) {
    case "l": {
      trans = {
        x: box[0] - d / 2,
        y: box[1] + (d * l_scaley - d) / 2,
      };
      break;
    }
    case "r": {
      trans = {
        x: box[2] - d / 2,
        y: box[1] + (d * l_scaley - d) / 2,
      };
      break;
    }
    case "t": {
      trans = {
        x: box[0] + (d * l_scalex - d) / 2,
        y: box[1] - d / 2,
      };
      break;
    }
    case "b": {
      trans = {
        x: box[0] + (d * l_scalex - d) / 2,
        y: box[3] - d / 2,
      };
      break;
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        width: d,
        height: d,
        opacity: 1,
        willChange: "transform",
        transformOrigin: "0px, 0px",
        transform: `translateX(${trans.x}px) translateY(${trans.y}px) translateZ(0px) scaleX(${l_scalex}) scaleY(${l_scaley})`,
        backgroundColor: color,
      }}
    />
  );
}
