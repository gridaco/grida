import cmath from "@grida/cmath";
import grida from "@grida/schema";

/**
 * Gets the mode value for corner radius from a collection of nodes.
 */
function cornerRadius(
  ...nodes: grida.program.nodes.Node[]
): number | undefined {
  const values: number[] = [];

  for (const node of nodes) {
    if ("corner_radius" in node && node.corner_radius !== undefined) {
      values.push(node.corner_radius);
    } else if ("corner_radius_top_left" in node) {
      const cornerValues: number[] = [
        node.corner_radius_top_left,
        node.corner_radius_top_right,
        node.corner_radius_bottom_left,
        node.corner_radius_bottom_right,
      ].filter((it) => it !== undefined);

      if (cornerValues.length > 0) {
        const modeValue = cmath.mode(cornerValues);
        if (modeValue !== undefined) {
          values.push(modeValue);
        }
      }
    }
  }

  return values.length > 0 ? cmath.mode(values) : undefined;
}

/**
 * Gets the mode value for fill from a collection of nodes.
 */
// TODO: LEGACY_PAINT_MODEL
function fill(...nodes: grida.program.nodes.Node[]): any {
  for (const node of nodes) {
    if (Array.isArray((node as any).fills) && (node as any).fills.length > 0) {
      return (node as any).fills[0];
    }
    if ("fill" in node && node.fill !== undefined) {
      return node.fill;
    }
  }

  return undefined; // For fill, we'll use the first value instead of mode
}

/**
 * Gets the mode value for stroke from a collection of nodes.
 */
// TODO: LEGACY_PAINT_MODEL
function stroke(...nodes: grida.program.nodes.Node[]): any {
  for (const node of nodes) {
    if (
      Array.isArray((node as any).strokes) &&
      (node as any).strokes.length > 0
    ) {
      return (node as any).strokes[0];
    }
    if ("stroke" in node && node.stroke !== undefined) {
      return node.stroke;
    }
  }

  return undefined; // For stroke, we'll use the first value instead of mode
}

/**
 * Gets the mode value for stroke width from a collection of nodes.
 */
function strokeWidth(...nodes: grida.program.nodes.Node[]): number | undefined {
  const values: number[] = [];

  for (const node of nodes) {
    if ("stroke_width" in node && node.stroke_width !== undefined) {
      values.push(node.stroke_width);
    }
  }

  return values.length > 0 ? cmath.mode(values) : undefined;
}

export { cornerRadius, fill, stroke, strokeWidth };
