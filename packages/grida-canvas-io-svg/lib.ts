import type grida from "@grida/schema";
import type cg from "@grida/cg";
import cmath from "@grida/cmath";
import vn from "@grida/vn";
import type { svgtypes } from "@grida/canvas-wasm";

// re-export svgtypes
export type { svgtypes };

interface SVGFactoryUserContext {
  name: string;
  currentColor?: cmath.colorformats.RGBA8888;
}

export namespace iosvg {
  export namespace map {
    /**
     * Extract translation (left, top) from Transform2D matrix
     * Transform2D format: [[m00, m01, m02], [m10, m11, m12]]
     * Translation is in m02 (x) and m12 (y)
     */
    export function extractTranslation(transform: svgtypes.Transform2D): {
      left: number;
      top: number;
    } {
      return {
        left: transform[0][2] ?? 0,
        top: transform[1][2] ?? 0,
      };
    }

    /**
     * Convert SVG Paint to Grida Paint with optional opacity
     */
    export function paint(
      paint: svgtypes.SVGPaint | null | undefined,
      opacity: number = 1.0
    ): cg.Paint | undefined {
      if (!paint) {
        return undefined;
      }

      switch (paint.kind) {
        case "solid": {
          // paint.color is RGBA8888 chunk [r, g, b, a] (all 0-255) from WASM
          const [r, g, b, a] = paint.color;
          // Convert to RGBA8888 object format, apply opacity to alpha, then convert to RGB888A32F
          const rgba8888: cmath.colorformats.RGBA8888 = {
            r,
            g,
            b,
            a: a * opacity, // Apply opacity to alpha (still 0-255 range)
          };
          const rgb888a32f =
            cmath.colorformats.RGBA8888.intoRGB888F32A(rgba8888);
          return {
            type: "solid",
            color: rgb888a32f,
            active: true,
          };
        }

        case "linear-gradient": {
          return {
            type: "linear_gradient",
            transform: paint.transform,
            stops: paint.stops.map((stop) => {
              // stop.color is RGBA8888 chunk [r, g, b, a] (all 0-255) from WASM
              const [r, g, b, a] = stop.color;
              // Convert to RGBA8888 object format, then convert to RGB888A32F
              const rgba8888: cmath.colorformats.RGBA8888 = { r, g, b, a };
              const rgb888a32f =
                cmath.colorformats.RGBA8888.intoRGB888F32A(rgba8888);
              return {
                offset: stop.offset,
                color: rgb888a32f,
              };
            }),
            blendMode: "normal",
            opacity: opacity,
            active: true,
          };
        }

        case "radial-gradient": {
          return {
            type: "radial_gradient",
            transform: paint.transform,
            stops: paint.stops.map((stop) => {
              // stop.color is RGBA8888 chunk [r, g, b, a] (all 0-255) from WASM
              const [r, g, b, a] = stop.color;
              // Convert to RGBA8888 object format, then convert to RGB888A32F
              const rgba8888: cmath.colorformats.RGBA8888 = { r, g, b, a };
              const rgb888a32f =
                cmath.colorformats.RGBA8888.intoRGB888F32A(rgba8888);
              return {
                offset: stop.offset,
                color: rgb888a32f,
              };
            }),
            blendMode: "normal",
            opacity: opacity,
            active: true,
          };
        }

        default:
          return undefined;
      }
    }

    /**
     * Convert SVG Fill Attributes to Grida Paint
     */
    export function fill(fill: svgtypes.SVGFillAttributes | null | undefined): {
      paint: cg.Paint | undefined;
      fillRule: cg.FillRule;
      opacity: number;
    } {
      if (!fill) {
        return { paint: undefined, fillRule: "nonzero", opacity: 1.0 };
      }

      return {
        paint: map.paint(fill.paint, fill.fill_opacity),
        fillRule: fill.fill_rule,
        opacity: fill.fill_opacity,
      };
    }

    /**
     * Convert SVG Stroke Attributes to Grida Paint
     */
    export function stroke(
      stroke: svgtypes.SVGStrokeAttributes | null | undefined
    ): {
      paint: cg.Paint | undefined;
      opacity: number;
      strokeWidth: number;
      strokeCap: cg.StrokeCap;
      strokeJoin: cg.StrokeJoin;
      strokeMiterLimit: number;
      strokeDashArray?: number[];
    } {
      if (!stroke) {
        return {
          paint: undefined,
          opacity: 1.0,
          strokeWidth: 0,
          strokeCap: "butt",
          strokeJoin: "miter",
          strokeMiterLimit: 4,
        };
      }

      return {
        paint: map.paint(stroke.paint, stroke.stroke_opacity),
        opacity: stroke.stroke_opacity,
        strokeWidth: stroke.stroke_width ?? 0,
        strokeCap: stroke.stroke_linecap,
        strokeJoin: stroke.stroke_linejoin,
        strokeMiterLimit: stroke.stroke_miterlimit,
        strokeDashArray: stroke.stroke_dasharray ?? undefined,
      };
    }
  }

  type SVGIOCompatibleNodePrototype =
    | grida.program.nodes.ContainerNodePrototype
    | grida.program.nodes.GroupNodePrototype
    | grida.program.nodes.PathNodePrototype
    | grida.program.nodes.RectangleNodePrototype
    | grida.program.nodes.EllipseNodePrototype;

  /**
   * Convert IRSVGChildNode to Grida Node Prototype
   */
  function convertChildNode(
    node: svgtypes.ir.IRSVGChildNode,
    name: string
  ): SVGIOCompatibleNodePrototype | null {
    switch (node.kind) {
      case "group": {
        const { transform, opacity, children } = node;
        const position = map.extractTranslation(transform);

        const convertedChildren = children
          .map((child, index) =>
            convertChildNode(child, `${name}_child_${index}`)
          )
          .filter(Boolean) as grida.program.nodes.NodePrototype[];

        return {
          type: "group",
          name: name,
          position: "absolute",
          left: position.left,
          top: position.top,
          opacity: opacity,
          children: convertedChildren,
        } satisfies grida.program.nodes.GroupNodePrototype;
      }

      case "path": {
        const { transform, fill: fillAttr, stroke: strokeAttr, d } = node;
        const position = map.extractTranslation(transform);

        const vectorNetwork = vn.fromSVGPathData(d);
        const bbox = vn.getBBox(vectorNetwork);
        const {
          paint: fill,
          fillRule,
          opacity: fillOpacity,
        } = map.fill(fillAttr);
        const {
          paint: stroke,
          opacity: _strokeOpacity,
          strokeWidth,
          strokeCap,
          strokeJoin,
          strokeMiterLimit,
          strokeDashArray,
        } = map.stroke(strokeAttr);

        // Use fill opacity as the primary node opacity (stroke opacity is applied to stroke paint)
        return {
          type: "vector",
          name: name,
          vectorNetwork: vectorNetwork,
          fill: fill,
          stroke: stroke,
          strokeWidth: strokeWidth,
          strokeCap: strokeCap,
          strokeJoin: strokeJoin,
          strokeMiterLimit: strokeMiterLimit,
          strokeDashArray: strokeDashArray,
          width: bbox.width,
          height: bbox.height,
          left: position.left,
          top: position.top,
          fillRule: fillRule,
          opacity: fillOpacity,
        } satisfies grida.program.nodes.PathNodePrototype;
      }

      case "text": {
        // Text nodes are not yet fully supported, so we'll skip for now
        // TODO: Implement text node conversion when text support is added
        return null;
      }

      case "image": {
        // Image nodes are not yet fully supported, so we'll skip for now
        // TODO: Implement image node conversion when image support is added
        return null;
      }

      default:
        return null;
    }
  }

  /**
   * Convert WASM-resolved SVG tree (IRSVGInitialContainerNode) to Grida Node Prototype
   *
   * @param svg - The WASM-resolved SVG tree structure
   * @param context - Optional context for naming and currentColor
   * @returns The root container node prototype, or null if conversion fails
   */
  export function convert(
    svg: svgtypes.ir.IRSVGInitialContainerNode,
    context?: Partial<SVGFactoryUserContext>
  ): SVGIOCompatibleNodePrototype | null {
    const { width, height, children } = svg;
    const name = context?.name ?? "svg";

    const convertedChildren = children
      .map((child, index) => convertChildNode(child, `${name}_child_${index}`))
      .filter(Boolean) as grida.program.nodes.NodePrototype[];

    return {
      type: "container",
      name: name,
      position: "absolute",
      left: 0,
      top: 0,
      width: width,
      height: height,
      children: convertedChildren,
    } satisfies grida.program.nodes.ContainerNodePrototype;
  }
}
