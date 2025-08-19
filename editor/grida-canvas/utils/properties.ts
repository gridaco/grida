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
    if ("cornerRadius" in node && node.cornerRadius !== undefined) {
      values.push(node.cornerRadius);
    } else if ("cornerRadiusTopLeft" in node) {
      const cornerValues: number[] = [
        node.cornerRadiusTopLeft,
        node.cornerRadiusTopRight,
        node.cornerRadiusBottomLeft,
        node.cornerRadiusBottomRight,
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
function fill(...nodes: grida.program.nodes.Node[]): any {
  for (const node of nodes) {
    if ("fill" in node && node.fill !== undefined) {
      return node.fill;
    }
  }

  return undefined; // For fill, we'll use the first value instead of mode
}

/**
 * Gets the mode value for stroke from a collection of nodes.
 */
function stroke(...nodes: grida.program.nodes.Node[]): any {
  for (const node of nodes) {
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
    if ("strokeWidth" in node && node.strokeWidth !== undefined) {
      values.push(node.strokeWidth);
    }
  }

  return values.length > 0 ? cmath.mode(values) : undefined;
}

export { cornerRadius, fill, stroke, strokeWidth };
