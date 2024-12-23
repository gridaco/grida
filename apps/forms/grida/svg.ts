import { SVGCommand, encodeSVGPath, SVGPathData } from "svg-pathdata";
import type { grida } from "./index";
import { cmath } from "@/grida-canvas/cmath";

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
     * Converts a vector network to SVG path data.
     *
     * @param vn - Vector network to convert.
     * @returns The SVG path data string representing the vector network.
     */
    export function fromVectorNetwork(
      vn: grida.program.cg.vector_network.VectorNetwork
    ) {
      const { vertices, segments } = vn;

      // Prepare path commands
      const commands: SVGCommand[] = [];

      // Keep track of visited segments to avoid duplicates
      const visitedSegments = new Set();

      segments.forEach((segment) => {
        const { a, b, ta, tb } = segment;

        // Skip if the segment is already visited
        if (
          visitedSegments.has(`${a}-${b}`) ||
          visitedSegments.has(`${b}-${a}`)
        ) {
          return;
        }

        visitedSegments.add(`${a}-${b}`);

        const start = vertices[a].p;
        const end = vertices[b].p;
        const control1 = [start[0] + ta[0], start[1] + ta[1]];
        const control2 = [end[0] + tb[0], end[1] + tb[1]];

        commands.push(
          // Move to the starting point
          {
            type: SVGPathData.MOVE_TO,
            x: start[0],
            y: start[1],
            relative: false,
          },
          {
            type: SVGPathData.CURVE_TO,
            x1: control1[0],
            y1: control1[1],
            x2: control2[0],
            y2: control2[1],
            x: end[0],
            y: end[1],
            relative: false,
          } // Cubic Bezier curve
        );
      });

      // Encode the path commands to SVG path data
      return encodeSVGPath(commands);

      //
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
    export function defs(paint: grida.program.cg.Paint): {
      defs: string | undefined;
      ref: string;
    } {
      switch (paint.type) {
        case "linear_gradient": {
          const defs = `<defs>${gradient.stringifyLinearGradient(paint)}</defs>`;

          return {
            defs,
            ref: `url(#${paint.id})`,
          };
        }
        case "radial_gradient": {
          const defs = `<defs>${gradient.stringifyRadialGradient(paint)}</defs>`;

          return {
            defs,
            ref: `url(#${paint.id})`,
          };
        }
        case "solid": {
          const { color } = paint;
          return {
            defs: undefined,
            ref: `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`,
          };
        }
      }
    }
  }
}
