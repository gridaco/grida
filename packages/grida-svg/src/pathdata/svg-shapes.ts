import { SVGPathData } from "./svg-path-data.js";
import type { SVGCommand } from "./types.js";

function moveTo(x: number, y: number): SVGCommand {
  return { type: SVGPathData.MOVE_TO, relative: false, x, y };
}

function lineTo(x: number, y: number): SVGCommand {
  return { type: SVGPathData.LINE_TO, relative: false, x, y };
}

function arcTo(
  rx: number,
  ry: number,
  xRot: number,
  largeArc: 0 | 1,
  sweep: 0 | 1,
  x: number,
  y: number
): SVGCommand {
  return {
    type: SVGPathData.ARC,
    relative: false,
    rX: rx,
    rY: ry,
    xRot,
    lArcFlag: largeArc,
    sweepFlag: sweep,
    x,
    y,
  };
}

/**
 * Creates an ellipse path centered at (cx,cy) with radii rx and ry
 */
function createEllipse(
  rx: number,
  ry: number,
  cx: number,
  cy: number
): SVGPathData {
  return new SVGPathData([
    moveTo(cx + rx, cy),
    arcTo(rx, ry, 0, 1, 1, cx - rx, cy),
    arcTo(rx, ry, 0, 1, 1, cx + rx, cy),
    { type: SVGPathData.CLOSE_PATH },
  ]);
}

/**
 * Creates a rectangle path with optional rounded corners
 */
function createRect(
  x: number,
  y: number,
  width: number,
  height: number,
  rX = 0,
  rY = 0
): SVGPathData {
  if (rX === 0 || rY === 0) {
    return new SVGPathData([
      moveTo(x, y),
      lineTo(x + width, y),
      lineTo(x + width, y + height),
      lineTo(x, y + height),
      { type: SVGPathData.CLOSE_PATH },
    ]);
  }

  const rx = Math.min(rX, width / 2);
  const ry = Math.min(rY, height / 2);

  return new SVGPathData([
    moveTo(x + rx, y),
    lineTo(x + width - rx, y),
    arcTo(rx, ry, 0, 0, 1, x + width, y + ry),
    lineTo(x + width, y + height - ry),
    arcTo(rx, ry, 0, 0, 1, x + width - rx, y + height),
    lineTo(x + rx, y + height),
    arcTo(rx, ry, 0, 0, 1, x, y + height - ry),
    lineTo(x, y + ry),
    arcTo(rx, ry, 0, 0, 1, x + rx, y),
    { type: SVGPathData.CLOSE_PATH },
  ]);
}

/**
 * Creates a polyline from an array of coordinates [x1,y1,x2,y2,...]
 */
function createPolyline(coords: number[]): SVGPathData {
  if (coords.length < 2) return new SVGPathData([]);

  // Odd-length input has a dangling coordinate with no pair; drop it
  // rather than emitting a lineTo with an undefined y.
  const evenLen = coords.length - (coords.length % 2);
  const commands: SVGCommand[] = [moveTo(coords[0], coords[1])];

  for (let i = 2; i < evenLen; i += 2) {
    commands.push(lineTo(coords[i], coords[i + 1]));
  }

  return new SVGPathData(commands);
}

/**
 * Creates a closed polygon from an array of coordinates
 */
function createPolygon(coords: number[]): SVGPathData {
  if (coords.length < 2) return new SVGPathData([]);

  const commands = createPolyline(coords).commands;
  commands.push({ type: SVGPathData.CLOSE_PATH });
  return new SVGPathData(commands);
}

export const SVGShapes = {
  createEllipse,
  createRect,
  createPolyline,
  createPolygon,
};
