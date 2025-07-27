import { SVGCommand, encodeSVGPath, SVGPathData } from "svg-pathdata";
import type cg from "@grida/cg";
import cmath from "@grida/cmath";
import { v4 } from "uuid";

export namespace svg {
  export namespace d {
    export function encode(commands: SVGCommand[]) {
      return encodeSVGPath(commands);
    }

    /**
     * @param a M [x y] - starting point
     * @param ta C [x1 y1] - control point 1 (relative to `a`)
     * @param tb C [x2 y2] - control point 2 (relative to `b`)
     * @param b C [x y] - ending point
     */
    export function curve(
      a: cmath.Vector2,
      ta: cmath.Vector2,
      tb: cmath.Vector2,
      b: cmath.Vector2
    ): SVGCommand[] {
      return [
        // Move to the starting point
        {
          type: SVGPathData.MOVE_TO,
          x: a[0],
          y: a[1],
          relative: false,
        },
        // Cubic Bezier curve command
        {
          type: SVGPathData.CURVE_TO,
          x1: a[0] + ta[0],
          y1: a[1] + ta[1],
          x2: b[0] + tb[0],
          y2: b[1] + tb[1],
          x: b[0],
          y: b[1],
          relative: false,
        },
      ];
    }

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
      cornerRadius: cg.CornerRadius
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
        : {
            topLeftRadius: cornerRadius[0],
            topRightRadius: cornerRadius[1],
            bottomRightRadius: cornerRadius[2],
            bottomLeftRadius: cornerRadius[3],
          };

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
    export function stringifyGradientStop(stop: cg.GradientStop) {
      return `<stop offset="${stop.offset * 100}%" stop-color="rgba(${stop.color.r}, ${stop.color.g}, ${stop.color.b}, ${stop.color.a})" />`;
    }

    export function stringifyLinearGradient(
      id: string,
      paint: cg.LinearGradientPaint
    ) {
      const { stops, transform } = paint;

      // De-structure the 2x3 transform matrix:
      // [
      //   [a, b, tx],
      //   [c, d, ty]
      // ]
      // SVG expects "matrix(a c b d tx ty)" which means:
      // x' = a*x + c*y + tx
      // y' = b*x + d*y + ty
      const [[a, b, tx], [c, d, ty]] = transform ?? cmath.transform.identity;
      const gradientTransform = `matrix(${a} ${c} ${b} ${d} ${tx} ${ty})`;

      // Creating gradient stops
      const gradientStops = stops.map(stringifyGradientStop).join("\n");

      return `<linearGradient id="${id}" gradientTransform="${gradientTransform}">
${gradientStops}
  </linearGradient>`;
    }

    export function stringifyRadialGradient(
      id: string,
      paint: cg.RadialGradientPaint
    ) {
      const { stops } = paint;

      // Creating gradient stops
      const gradientStops = stops.map(stringifyGradientStop).join("\n");

      return `<radialGradient id="${id}">${gradientStops}</radialGradient>`;
    }
  }

  export namespace paint {
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
    export function defs(paint: cg.Paint): {
      defs: string | undefined;
      ref: string;
    } {
      const id = v4();
      switch (paint.type) {
        case "linear_gradient": {
          const defs = `<defs>${gradient.stringifyLinearGradient(id, paint)}</defs>`;

          return {
            defs,
            ref: `url(#${id})`,
          };
        }
        case "radial_gradient": {
          const defs = `<defs>${gradient.stringifyRadialGradient(id, paint)}</defs>`;

          return {
            defs,
            ref: `url(#${id})`,
          };
        }
        case "solid": {
          const { color } = paint;
          return {
            defs: undefined,
            ref: `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`,
          };
        }
        case "sweep_gradient":
        case "diamond_gradient":
        default: {
          // not supported
          return {
            defs: undefined,
            ref: "",
          };
        }
      }
    }
  }
}
