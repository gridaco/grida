import { SVGPathData } from "../index.js";
import { SVGPathDataTransformer } from "../svg-path-data-transformer.js";
import type { SVGCommand } from "../types.js";

type SVGCommandXY = SVGCommand & { x: number; y: number; relative: boolean };

/**
 * Reverses the order of path commands to go from end to start
 * IMPORTANT: This function expects absolute commands as input.
 * It doesn't convert relative to absolute - use SVGPathDataTransformer.TO_ABS() first if needed.
 * @param commands SVG path commands in absolute form to reverse
 * @param preserveSubpathOrder If true, keeps subpaths in their original order
 * @returns New SVG commands in reverse order with absolute coordinates
 */
export function REVERSE_PATH(
  commands: SVGCommand[],
  preserveSubpathOrder = true
): SVGCommand[] {
  if (commands.length < 2) return commands;

  // Extract absolute points using the transformer to track current position
  const normalized = SVGPathDataTransformer.INFO((command, px, py) => ({
    ...command,
    x: command.x ?? px,
    y: command.y ?? py,
    relative: command.relative ?? false,
  }));

  const result: SVGCommand[] = [];
  let processing: SVGCommandXY[] = [];

  for (const original of commands) {
    const cmd: SVGCommandXY = normalized(original);
    // Start a new subpath if needed
    if (cmd.type === SVGPathData.MOVE_TO && processing.length > 0) {
      if (preserveSubpathOrder) {
        result.push(...reverseSubpath(processing));
      } else {
        result.unshift(...reverseSubpath(processing));
      }
      processing = []; // Clear the current subpath
    }
    processing.push(cmd);
  }

  if (processing.length > 0) {
    if (preserveSubpathOrder) {
      result.push(...reverseSubpath(processing));
    } else {
      result.unshift(...reverseSubpath(processing));
    }
  }

  // Join the reversed subpaths in original order
  return result;
}

function reverseSubpath(commands: SVGCommandXY[]): SVGCommand[] {
  // Check if path is explicitly closed (ends with CLOSE_PATH)
  const isExplicitlyClosed =
    commands[commands.length - 1]?.type === SVGPathData.CLOSE_PATH;

  // Start with a move to the last explicit point
  // (if path ends with Z, use the point before Z)
  const startPointIndex = isExplicitlyClosed
    ? commands.length - 2
    : commands.length - 1;

  const reversed: SVGCommand[] = [
    {
      type: SVGPathData.MOVE_TO,
      relative: false,
      x: commands[startPointIndex].x,
      y: commands[startPointIndex].y,
    },
  ];

  // Process each segment in reverse order
  for (let i = startPointIndex; i > 0; i--) {
    const curCmd = commands[i];
    const prevPoint = commands[i - 1];

    if (curCmd.relative) {
      throw new Error(
        "Relative commands are not supported; convert first with SVGPathDataTransformer.TO_ABS()."
      );
    }

    // Handle the current command type
    switch (curCmd.type) {
      case SVGPathData.HORIZ_LINE_TO:
        reversed.push({
          type: SVGPathData.HORIZ_LINE_TO,
          relative: false,
          x: prevPoint.x,
        });
        break;
      case SVGPathData.VERT_LINE_TO:
        reversed.push({
          type: SVGPathData.VERT_LINE_TO,
          relative: false,
          y: prevPoint.y,
        });
        break;

      case SVGPathData.LINE_TO:
      case SVGPathData.MOVE_TO:
        reversed.push({
          type: SVGPathData.LINE_TO,
          relative: false,
          x: prevPoint.x,
          y: prevPoint.y,
        });
        break;

      case SVGPathData.CURVE_TO:
        reversed.push({
          type: SVGPathData.CURVE_TO,
          relative: false,
          x: prevPoint.x,
          y: prevPoint.y,
          x1: curCmd.x2,
          y1: curCmd.y2,
          x2: curCmd.x1,
          y2: curCmd.y1,
        });
        break;

      case SVGPathData.SMOOTH_CURVE_TO:
        throw new Error(`Unsupported command: S (smooth cubic bezier)`);
      case SVGPathData.SMOOTH_QUAD_TO:
        throw new Error(`Unsupported command: T (smooth quadratic bezier)`);
      case SVGPathData.ARC:
        throw new Error(`Unsupported command: A (arc)`);
      case SVGPathData.QUAD_TO:
        throw new Error(`Unsupported command: Q (quadratic bezier)`);
    }
  }

  // If the original path was explicitly closed, preserve the Z command
  if (isExplicitlyClosed) {
    reversed.push({ type: SVGPathData.CLOSE_PATH });
  }

  return reversed;
}
