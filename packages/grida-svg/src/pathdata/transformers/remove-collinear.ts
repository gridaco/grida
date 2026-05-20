import { SVGPathData } from "../svg-path-data.js";
import { SVGPathDataTransformer } from "../index.js";
import { arePointsCollinear, type Point } from "../math-utils.js";
import type { SVGCommand } from "../types.js";

/**
 * Process a path and remove collinear points
 * @param commands Array of SVG path commands to process (must be absolute)
 * @returns New array with collinear points removed
 */
export function REMOVE_COLLINEAR(commands: SVGCommand[]): SVGCommand[] {
  if (commands.length <= 2) return commands; // exit early if there are less than 3 points

  const results: SVGCommand[] = [];

  const points: Point[] = commands.map(
    SVGPathDataTransformer.INFO((cmd, pXAbs, pYAbs) => {
      // Calculate absolute coordinates and normalize HV
      const isRelative = "relative" in cmd && cmd.relative;
      return [
        "x" in cmd ? cmd.x + (isRelative ? pXAbs : 0) : pXAbs,
        "y" in cmd ? cmd.y + (isRelative ? pYAbs : 0) : pYAbs,
      ];
    })
  );

  let prevPoint = points[0];
  results.push(commands[0]); // always keep the first point

  for (let i = 1; i < commands.length; i++) {
    const cmd = commands[i];
    const nextCmd = commands[i + 1];

    if (
      i < commands.length - 1 &&
      nextCmd &&
      cmd.type & SVGPathData.LINE_COMMANDS &&
      nextCmd.type & SVGPathData.LINE_COMMANDS
    ) {
      const nextPoint = points[i + 1];
      // Check triplets of points for collinearity
      if (arePointsCollinear(prevPoint, points[i], nextPoint)) {
        // update next point if its relative
        if ("relative" in nextCmd && nextCmd.relative) {
          if ("x" in nextCmd) nextCmd.x = nextPoint[0] - prevPoint[0];
          if ("y" in nextCmd) nextCmd.y = nextPoint[1] - prevPoint[1];
        }
        continue;
      }
    }
    results.push(cmd);
    prevPoint = points[i];
  }
  return results;
}
