import { v4 } from "uuid";
import type { grida } from "./index";

export namespace svg {
  export namespace d {
    /**
     * Generates an SVG path with rounded corners for a rectangle.
     *
     * since the `rx` and `ry` attributes of the `<rect>` element in SVG do not support individual corner radii, this function generates a path with individual corner radii.
     *
     * @param width - The width of the rectangle.
     * @param height - The height of the rectangle.
     * @param cornerRadius - The radius of each corner, either as a uniform number or an object specifying individual corner radii.
     * @returns The SVG path data string (`d` attribute) representing a rectangle with rounded corners.
     */
    export function generateRoundedRectPath(
      width: number,
      height: number,
      cornerRadius: grida.program.nodes.i.IRectangleCorner["cornerRadius"]
    ): string {
      const {
        topLeftRadius = 0,
        topRightRadius = 0,
        bottomLeftRadius = 0,
        bottomRightRadius = 0,
      } = typeof cornerRadius === "number"
        ? {
            topLeftRadius: cornerRadius,
            topRightRadius: cornerRadius,
            bottomLeftRadius: cornerRadius,
            bottomRightRadius: cornerRadius,
          }
        : cornerRadius;

      return `
      M${topLeftRadius},0 
      H${width - topRightRadius} 
      Q${width},0 ${width},${topRightRadius} 
      V${height - bottomRightRadius} 
      Q${width},${height} ${width - bottomRightRadius},${height} 
      H${bottomLeftRadius} 
      Q0,${height} 0,${height - bottomLeftRadius} 
      V${topLeftRadius} 
      Q0,0 ${topLeftRadius},0
    `;
    }
  }

  export namespace gradient {
    export function stringifyGradientStop(stop: grida.program.cg.GradientStop) {
      return `<stop offset="${stop.offset * 100}%" stop-color="rgba(${stop.color.r}, ${stop.color.g}, ${stop.color.b}, ${stop.color.a})" />`;
    }

    export function stringifyLinearGradient(
      paint: grida.program.cg.LinearGradientPaint
    ) {
      const { id, stops } = paint;

      // Creating gradient stops
      const gradientStops = stops.map(stringifyGradientStop).join("\n");

      return `<linearGradient id="${id}">${gradientStops}</linearGradient>`;
    }

    export function stringifyRadialGradient(
      paint: grida.program.cg.RadialGradientPaint
    ) {
      const { id, stops } = paint;

      // Creating gradient stops
      const gradientStops = stops.map(stringifyGradientStop).join("\n");

      return `<radialGradient id="${id}">${gradientStops}</radialGradient>`;
    }
  }

  export namespace fill {
    /**
     * A fill data transformation function for when element `fill` cannot be inlined directly.
     *
     * Usage:
     * ```tsx
     * const { defs, fill } = svg.fill.fill_with_defs(fill);
     *
     * return (
     *  <svg {...props} width={width} height={height}>
     *   {defs && <g dangerouslySetInnerHTML={{ __html: defs }} />}
     *    <rect width={width} height={height} fill={fill} />
     *  </svg>
     * );
     *
     */
    export function fill_with_defs(paint: grida.program.cg.Paint) {
      switch (paint.type) {
        case "linear_gradient": {
          const defs = `<defs>${gradient.stringifyLinearGradient(paint)}</defs>`;

          return {
            defs,
            fill: `url(#${paint.id})`,
          };
        }
        case "radial_gradient": {
          const defs = `<defs>${gradient.stringifyRadialGradient(paint)}</defs>`;

          return {
            defs,
            fill: `url(#${paint.id})`,
          };
        }
        case "solid": {
          const { color } = paint;
          return {
            defs: undefined,
            fill: `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`,
          };
        }
      }
    }
  }
}
