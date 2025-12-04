import type cg from "@grida/cg";
import type grida from "@grida/schema";
import type { vn } from "@grida/schema";
import type * as figrest from "@figma/rest-api-spec";
import type * as figkiwi from "./fig-kiwi/schema";
import cmath from "@grida/cmath";
import kolor from "@grida/color";
import { getBlobBytes, parseVectorNetworkBlob } from "./fig-kiwi";

export namespace iofigma {
  /**
   * custom structs for bridging difference between rest api spec, kiwi spec and plugin sdk spec.
   */
  export namespace __ir {
    /**
     * Vector network structure (vertices, segments, regions)
     * Matches the output of parseVectorNetworkBlob from blob-parser
     */
    export type VectorNetwork = {
      vertices: Array<{ styleID: number; x: number; y: number }>;
      segments: Array<{
        styleID: number;
        start: { vertex: number; dx: number; dy: number };
        end: { vertex: number; dx: number; dy: number };
      }>;
      regions: Array<{
        styleID: number;
        windingRule: "NONZERO" | "ODD";
        loops: Array<{ segments: number[] }>;
      }>;
    };

    /**
     * - rest-api-spec - Not supported
     * - kiwi-spec - Supported
     * - plugin-sdk-spec - Supported
     */
    export type VectorNodeWithVectorNetworkDataPresent =
      figrest.CornerRadiusShapeTraits &
        figrest.AnnotationsTrait & {
          type: "X_VECTOR";
          vectorNetwork: VectorNetwork;
        };

    /**
     * - rest-api-spec - Not supported
     * - kiwi-spec - Supported
     * - plugin-sdk-spec - Supported
     */
    export type RegularPolygonNodeWithPointsDataPresent =
      figrest.CornerRadiusShapeTraits &
        figrest.AnnotationsTrait & {
          type: "X_REGULAR_POLYGON";
          pointCount: number;
        };

    /**
     * - rest-api-spec - Not supported
     * - kiwi-spec - Supported
     * - plugin-sdk-spec - Supported
     */
    export type StarNodeWithPointsDataPresent =
      figrest.CornerRadiusShapeTraits &
        figrest.AnnotationsTrait & {
          type: "X_STAR";
          pointCount: number;
          innerRadius: number;
        };
  }

  export namespace restful {
    export namespace map {
      export const strokeCapMap: Record<
        NonNullable<figrest.LineNode["strokeCap"]>,
        cg.StrokeCap | undefined
      > = {
        NONE: "butt",
        ROUND: "round",
        SQUARE: "square",
        //
        LINE_ARROW: undefined,
        TRIANGLE_ARROW: undefined,
        DIAMOND_FILLED: undefined,
        CIRCLE_FILLED: undefined,
        TRIANGLE_FILLED: undefined,
        WASHI_TAPE_1: undefined,
        WASHI_TAPE_2: undefined,
        WASHI_TAPE_3: undefined,
        WASHI_TAPE_4: undefined,
        WASHI_TAPE_5: undefined,
        WASHI_TAPE_6: undefined,
      };

      export const strokeJoinMap: Record<
        NonNullable<figrest.LineNode["strokeJoin"]>,
        cg.StrokeJoin
      > = {
        MITER: "miter",
        ROUND: "round",
        BEVEL: "bevel",
      };

      export const strokeAlignMap: Record<
        NonNullable<figrest.LineNode["strokeAlign"]>,
        cg.StrokeAlign | undefined
      > = {
        CENTER: "center",
        INSIDE: "inside",
        OUTSIDE: "outside",
      };

      export const textAlignMap: Record<
        NonNullable<figrest.TypeStyle["textAlignHorizontal"]>,
        cg.TextAlign | undefined
      > = {
        CENTER: "center",
        RIGHT: "right",
        LEFT: "left",
        JUSTIFIED: undefined,
      };

      export const textAlignVerticalMap: Record<
        NonNullable<figrest.TypeStyle["textAlignVertical"]>,
        cg.TextAlignVertical
      > = {
        CENTER: "center",
        TOP: "top",
        BOTTOM: "bottom",
      };

      export const textDecorationMap: Record<
        NonNullable<figrest.TypeStyle["textDecoration"]>,
        cg.TextDecorationLine | undefined
      > = {
        NONE: "none",
        STRIKETHROUGH: undefined,
        UNDERLINE: "underline",
      };

      export const windingRuleMap: Record<
        figrest.Path["windingRule"],
        cg.FillRule
      > = {
        EVENODD: "evenodd",
        NONZERO: "nonzero",
      };

      export const blendModeMap: Record<figrest.BlendMode, cg.BlendMode> = {
        PASS_THROUGH: "normal", // no-op here
        NORMAL: "normal", // Matches the default blend mode.
        DARKEN: "darken",
        MULTIPLY: "multiply",
        LINEAR_BURN: "darken", // No direct equivalent, closest is "darken".
        COLOR_BURN: "color-burn",
        LIGHTEN: "lighten",
        SCREEN: "screen",
        LINEAR_DODGE: "lighten", // No direct equivalent, closest is "lighten".
        COLOR_DODGE: "color-dodge",
        OVERLAY: "overlay",
        SOFT_LIGHT: "soft-light",
        HARD_LIGHT: "hard-light",
        DIFFERENCE: "difference",
        EXCLUSION: "exclusion",
        HUE: "hue",
        SATURATION: "saturation",
        COLOR: "color",
        LUMINOSITY: "luminosity",
      };

      export const layerBlendModeMap: Record<
        figrest.BlendMode,
        cg.LayerBlendMode
      > = {
        ...blendModeMap,
        PASS_THROUGH: "pass-through",
      };
    }

    export namespace factory {
      function toGradientPaint(paint: figrest.GradientPaint) {
        const type_map = {
          GRADIENT_LINEAR: "linear_gradient",
          GRADIENT_RADIAL: "radial_gradient",
          GRADIENT_ANGULAR: "sweep_gradient",
          GRADIENT_DIAMOND: "diamond_gradient",
        } as const;

        const type = type_map[paint.type as keyof typeof type_map];
        const handles = paint.gradientHandlePositions;
        const points: cmath.ui.gradient.ControlPoints = handles
          ? {
              A: [handles[0].x, handles[0].y],
              B: [handles[1].x, handles[1].y],
              C: [handles[2].x, handles[2].y],
            }
          : cmath.ui.gradient.baseControlPoints(type);

        return {
          type: type,
          transform: cmath.ui.gradient.transformFromControlPoints(points, type),
          stops: paint.gradientStops.map((stop) => ({
            offset: stop.position,
            color: kolor.colorformats.newRGBA32F(
              stop.color.r,
              stop.color.g,
              stop.color.b,
              stop.color.a
            ),
          })),
          blend_mode: map.blendModeMap[paint.blendMode],
          active: paint.visible ?? true,
          opacity: paint.opacity ?? 1,
        } as cg.GradientPaint;
      }

      function toSolidPaint(paint: figrest.SolidPaint): cg.SolidPaint {
        return {
          type: "solid",
          color: kolor.colorformats.RGBA32F.multiplyA32(
            kolor.colorformats.newRGBA32F(
              paint.color.r,
              paint.color.g,
              paint.color.b,
              paint.color.a
            ),
            paint.opacity
          ),
          active: paint.visible ?? true,
        };
      }

      function paint(paint: figrest.Paint): cg.Paint | undefined {
        switch (paint.type) {
          case "SOLID": {
            return toSolidPaint(paint);
          }
          case "GRADIENT_LINEAR":
          case "GRADIENT_RADIAL":
          case "GRADIENT_ANGULAR":
          case "GRADIENT_DIAMOND": {
            return toGradientPaint(paint);
          }
          case "IMAGE":
            // TODO: image support
            // FALLBACK:
            return {
              type: "linear_gradient",
              transform: cmath.transform.identity,
              active: paint.visible ?? true,
              stops: [
                { offset: 0, color: kolor.colorformats.RGBA32F.BLACK },
                { offset: 1, color: kolor.colorformats.RGBA32F.WHITE },
              ],
              blend_mode: map.blendModeMap[paint.blendMode],
              opacity: 1,
            };
        }
      }

      /**
       * the default visible value is true, when undefined, it shall be interpreted as true
       * @returns
       */
      function first_visible<T extends { visible?: boolean }>(
        arr: T[]
      ): T | undefined {
        return arr.filter((f) => f.visible !== false)[0];
      }

      /**
       * Get all visible paints from a Figma paint array
       * @returns array of visible paints
       */
      function visible_paints<T extends { visible?: boolean }>(arr: T[]): T[] {
        return arr.filter((f) => f.visible !== false);
      }

      /**
       * Convert Figma Effect to Grida effect properties
       */
      function layer_effects_trait(effects: figrest.Effect[]): {
        fe_blur?: cg.FeLayerBlur;
        fe_backdrop_blur?: cg.FeBackdropBlur;
        fe_shadows?: cg.FeShadow[];
      } {
        const shadows: cg.FeShadow[] = [];
        let layerBlur: cg.FeLayerBlur | undefined;
        let backdropBlur: cg.FeBackdropBlur | undefined;

        effects.forEach((effect) => {
          if (!effect.visible) return; // Skip inactive effects

          switch (effect.type) {
            case "DROP_SHADOW":
              shadows.push({
                type: "shadow",
                dx: effect.offset.x,
                dy: effect.offset.y,
                blur: effect.radius,
                spread: effect.spread ?? 0,
                color: kolor.colorformats.newRGBA32F(
                  effect.color.r,
                  effect.color.g,
                  effect.color.b,
                  effect.color.a
                ),
                inset: false,
              });
              break;

            case "INNER_SHADOW":
              shadows.push({
                type: "shadow",
                dx: effect.offset.x,
                dy: effect.offset.y,
                blur: effect.radius,
                spread: effect.spread ?? 0,
                color: kolor.colorformats.newRGBA32F(
                  effect.color.r,
                  effect.color.g,
                  effect.color.b,
                  effect.color.a
                ),
                inset: true,
              });
              break;

            case "LAYER_BLUR":
              layerBlur = {
                type: "filter-blur",
                blur: { type: "blur", radius: effect.radius },
                active: true,
              };
              break;

            case "BACKGROUND_BLUR":
              backdropBlur = {
                type: "backdrop-filter-blur",
                blur: { type: "blur", radius: effect.radius },
                active: true,
              };
              break;
          }
        });

        return {
          fe_shadows: shadows.length > 0 ? shadows : undefined,
          fe_blur: layerBlur,
          fe_backdrop_blur: backdropBlur,
        };
      }

      function rectangleCornerRadius(
        rectangleCornerRadii?: number[] | [number, number, number, number],
        baseRadius: number = 0
      ): grida.program.nodes.i.IRectangularCornerRadius {
        // order: top-left, top-right, bottom-right, bottom-left (clockwise)
        return {
          corner_radius_top_left: rectangleCornerRadii?.[0] ?? baseRadius,
          corner_radius_top_right: rectangleCornerRadii?.[1] ?? baseRadius,
          corner_radius_bottom_right: rectangleCornerRadii?.[2] ?? baseRadius,
          corner_radius_bottom_left: rectangleCornerRadii?.[3] ?? baseRadius,
        };
      }

      type FigmaParentNode =
        | figrest.BooleanOperationNode
        | figrest.InstanceNode
        | figrest.FrameNode
        | figrest.GroupNode;

      export type FactoryContext = {
        // node_id_generator: () => string;
        gradient_id_generator: () => string;
      };

      type InputNode =
        | figrest.SubcanvasNode
        | __ir.VectorNodeWithVectorNetworkDataPresent
        | __ir.StarNodeWithPointsDataPresent
        | __ir.RegularPolygonNodeWithPointsDataPresent;

      export function document(
        node: InputNode,
        images: { [key: string]: string },
        context: FactoryContext
      ): grida.program.document.IPackedSceneDocument {
        const nodes: Record<string, grida.program.nodes.Node> = {};
        const graph: Record<string, string[]> = {};

        function processNode(
          currentNode: InputNode,
          parent?: FigmaParentNode
        ): grida.program.nodes.Node | undefined {
          const processedNode = node_without_children(
            currentNode,
            images,
            parent,
            context
          );

          if (!processedNode) {
            return undefined;
          }

          // Add the node to the flat structure
          nodes[processedNode.id] = processedNode;

          // If the node has children, process them recursively
          if ("children" in currentNode && currentNode.children?.length) {
            graph[processedNode.id] = currentNode.children
              .map((c) => {
                return processNode(c, currentNode as FigmaParentNode);
              }) // Process each child
              .filter((child) => child !== undefined) // Remove undefined nodes
              .map((child) => child!.id); // Map to IDs
          }

          return processedNode;
        }

        const rootNode = processNode(node) as grida.program.nodes.ContainerNode;
        // Keep absolute positioning from Figma (all Figma nodes are absolute by default)
        // rootNode.position = "relative";
        // rootNode.left = 0;
        // rootNode.top = 0;

        if (!rootNode) {
          throw new Error("Failed to process root node");
        }

        return {
          nodes,
          links: graph,
          scene: {
            type: "scene",
            id: "scene-" + rootNode.id,
            name: rootNode.name,
            children_refs: [rootNode.id],
            guides: [],
            edges: [],
            constraints: {
              children: "multiple",
            },
          },
          // TODO:
          bitmaps: {},
          images: {},
          properties: {},
        };
      }

      /**
       * Creates a Node data from figma input, while ignoring the figma's children.
       *
       * It still follows the node structure and returns with empty array `{ children: [] }` if the node requires children property.
       *
       * @param node
       * @param images
       * @param parent
       * @returns
       */
      function node_without_children(
        node: InputNode,
        images: { [key: string]: string },
        parent: FigmaParentNode | undefined,
        context: FactoryContext
      ): grida.program.nodes.Node | undefined {
        switch (node.type) {
          case "SECTION": {
            const { fills, strokes, strokeWeight, strokeAlign } = node;

            const visible_fills = visible_paints(fills);
            const visible_strokes = strokes ? visible_paints(strokes) : [];
            const first_visible_fill = first_visible(fills);
            const first_visible_stroke = strokes
              ? first_visible(strokes)
              : undefined;

            const fills_paints = visible_fills
              .map(paint)
              .filter((p): p is cg.Paint => p !== undefined);
            const strokes_paints = visible_strokes
              .map(paint)
              .filter((p): p is cg.Paint => p !== undefined);

            return {
              id: node.id,
              name: node.name,
              active: node.visible ?? true,
              locked: node.locked ?? false,
              rotation: node.rotation ?? 0,
              opacity: 1,
              blend_mode: "pass-through",
              z_index: 0,
              type: "container",
              expanded: false,
              //
              position: "absolute",
              left: node.relativeTransform![0][2],
              top: node.relativeTransform![1][2],
              width: node.size!.x,
              height: node.size!.y,

              fills: fills_paints.length > 0 ? fills_paints : undefined,
              //
              border:
                first_visible_stroke?.type === "SOLID"
                  ? {
                      border_width: strokeWeight ?? 0,
                      border_color: toSolidPaint(first_visible_stroke).color,
                      border_style: "none",
                    }
                  : undefined,

              //
              style: {},
              corner_radius: 0,
              corner_radius_top_left: 0,
              corner_radius_top_right: 0,
              corner_radius_bottom_left: 0,
              corner_radius_bottom_right: 0,
              padding: 0,
              // TODO:
              layout: "flow",
              direction: "horizontal",
              main_axis_alignment: "start",
              cross_axis_alignment: "start",
              main_axis_gap: 0,
              cross_axis_gap: 0,
            } satisfies grida.program.nodes.ContainerNode;
          }
          //
          case "COMPONENT":
          case "INSTANCE":
          case "FRAME": {
            const {
              clipsContent,
              itemSpacing,
              counterAxisSpacing,
              paddingLeft,
              paddingRight,
              paddingTop,
              paddingBottom,
              layoutWrap,
              fills,
              strokes,
              // strokeAlign, // ignored
              strokeWeight,
              strokeCap,
              strokeDashes, // only checks if dashed or not
              // strokeGeometry,
              // strokeJoin, // ignored
              // strokeMiterAngle,  // ignored
              // strokesIncludedInLayout // ignored
            } = node;

            const visible_fills = visible_paints(fills);
            const visible_strokes = strokes ? visible_paints(strokes) : [];
            const first_visible_fill = first_visible(fills);
            const first_visible_stroke = strokes
              ? first_visible(strokes)
              : undefined;

            const fills_paints = visible_fills
              .map(paint)
              .filter((p): p is cg.Paint => p !== undefined);
            const strokes_paints = visible_strokes
              .map(paint)
              .filter((p): p is cg.Paint => p !== undefined);

            return {
              id: node.id,
              name: node.name,
              active: node.visible ?? true,
              locked: node.locked ?? false,
              rotation: node.rotation ?? 0,
              opacity: node.opacity ?? 1,
              blend_mode: map.layerBlendModeMap[node.blendMode],
              z_index: 0,
              type: "container",
              expanded: false,
              //
              position: "absolute",
              left: node.relativeTransform![0][2],
              top: node.relativeTransform![1][2],
              width: node.size!.x,
              height: node.size!.y,

              fills: fills_paints.length > 0 ? fills_paints : undefined,
              //
              border:
                first_visible_stroke?.type === "SOLID"
                  ? {
                      border_width: strokeWeight ?? 0,
                      border_color: toSolidPaint(first_visible_stroke).color,
                      border_style: strokeDashes ? "dashed" : "solid",
                    }
                  : undefined,

              //
              style: {
                overflow: clipsContent ? "clip" : undefined,
              },
              corner_radius: node.cornerRadius ?? 0,
              ...rectangleCornerRadius(
                node.rectangleCornerRadii,
                node.cornerRadius ?? 0
              ),
              padding:
                paddingTop === paddingRight &&
                paddingTop === paddingBottom &&
                paddingTop === paddingLeft
                  ? (paddingTop ?? 0)
                  : {
                      padding_top: paddingTop ?? 0,
                      padding_right: paddingRight ?? 0,
                      padding_bottom: paddingBottom ?? 0,
                      padding_left: paddingLeft ?? 0,
                    },
              // TODO:
              layout: "flow",
              direction: "horizontal",
              main_axis_alignment: "start",
              cross_axis_alignment: "start",
              main_axis_gap: itemSpacing ?? 0,
              cross_axis_gap: counterAxisSpacing ?? itemSpacing ?? 0,
              ...(node.effects?.length
                ? layer_effects_trait(node.effects)
                : {}),
            } satisfies grida.program.nodes.ContainerNode;
          }
          case "GROUP": {
            // Note:
            // Group -> Container is not a accurate transformation.
            // Since children of group has constraints relative to the parent of the group, nesting children of group to container will break some constraints.
            return {
              id: node.id,
              name: node.name,
              active: node.visible ?? true,
              locked: node.locked ?? false,
              rotation: node.rotation ?? 0,
              opacity: node.opacity ?? 1,
              blend_mode: map.layerBlendModeMap[node.blendMode],
              z_index: 0,
              type: "container",
              expanded: false,
              //
              position: "absolute",
              left: node.relativeTransform![0][2],
              top: node.relativeTransform![1][2],
              width: node.size!.x,
              height: node.size!.y,
              //
              style: {},
              corner_radius: 0,
              ...rectangleCornerRadius([0, 0, 0, 0], 0),
              padding: 0,
              layout: "flow",
              direction: "horizontal",
              main_axis_alignment: "start",
              cross_axis_alignment: "start",
              main_axis_gap: 0,
              cross_axis_gap: 0,
            } satisfies grida.program.nodes.ContainerNode;
            // throw new Error(`Unsupported node type: ${node.type}`);
          }
          case "TEXT": {
            const { fills, strokes, strokeWeight, strokeDashes } = node;

            const visible_fills = visible_paints(fills);
            const visible_strokes = strokes ? visible_paints(strokes) : [];
            const first_visible_fill = first_visible(fills);
            const first_visible_stroke = strokes
              ? first_visible(strokes)
              : undefined;

            const fills_paints = visible_fills
              .map(paint)
              .filter((p): p is cg.Paint => p !== undefined);
            const strokes_paints = visible_strokes
              .map(paint)
              .filter((p): p is cg.Paint => p !== undefined);

            const figma_text_resizing_model = node.style.textAutoResize;
            const figma_constraints_horizontal = node.constraints?.horizontal;
            const figma_constraints_vertical = node.constraints?.vertical;

            const fixedwidth = node.size!.x;
            const fixedheight = node.size!.y;

            const fixedleft = node.relativeTransform![0][2];
            const fixedtop = node.relativeTransform![1][2];
            const fixedright = parent?.size
              ? parent.size.x - fixedleft - fixedwidth
              : undefined;
            const fixedbottom = parent?.size
              ? parent.size.y - fixedtop - fixedheight
              : undefined;

            const constraints = {
              left:
                figma_constraints_horizontal !== "RIGHT"
                  ? fixedleft
                  : undefined,
              right:
                figma_constraints_horizontal !== "LEFT"
                  ? fixedright
                  : undefined,
              top:
                figma_constraints_vertical !== "BOTTOM" ? fixedtop : undefined,
              bottom:
                figma_constraints_vertical !== "TOP" ? fixedbottom : undefined,
            };

            return {
              id: node.id,
              name: node.name,
              active: node.visible ?? true,
              locked: node.locked ?? false,
              rotation: node.rotation ?? 0,
              opacity: node.opacity ?? 1,
              blend_mode: map.layerBlendModeMap[node.blendMode],
              z_index: 0,
              type: "text",
              text: node.characters,
              position: "absolute",
              left: constraints.left,
              top: constraints.top,
              right: constraints.right,
              bottom: constraints.bottom,
              // left: fixedleft,
              // top: fixedtop,
              width:
                figma_text_resizing_model === "WIDTH_AND_HEIGHT"
                  ? "auto"
                  : fixedwidth,
              height:
                figma_text_resizing_model === "WIDTH_AND_HEIGHT" ||
                figma_text_resizing_model === "HEIGHT"
                  ? "auto"
                  : fixedheight,
              fills: fills_paints.length > 0 ? fills_paints : undefined,
              strokes: strokes_paints.length > 0 ? strokes_paints : undefined,
              stroke_width: strokeWeight ?? 0,
              border:
                first_visible_stroke?.type === "SOLID"
                  ? {
                      border_width: strokeWeight ?? 0,
                      border_color: toSolidPaint(first_visible_stroke).color,
                      border_style: strokeDashes ? "dashed" : "solid",
                    }
                  : undefined,
              //
              style: {},
              text_align: node.style.textAlignHorizontal
                ? (map.textAlignMap[node.style.textAlignHorizontal] ?? "left")
                : "left",
              text_align_vertical: node.style.textAlignVertical
                ? map.textAlignVerticalMap[node.style.textAlignVertical]
                : "top",
              text_decoration_line: node.style.textDecoration
                ? (map.textDecorationMap[node.style.textDecoration] ?? "none")
                : "none",
              line_height: node.style.lineHeightPercentFontSize
                ? node.style.lineHeightPercentFontSize / 100
                : // normal = 1.2
                  1.2,

              letter_spacing: node.style.letterSpacing,
              font_size: node.style.fontSize ?? 0,
              font_family: node.style.fontFamily,
              font_weight:
                (node.style.fontWeight as cg.NFontWeight) ?? (400 as const),
              font_kerning: true, // TODO: parse from features (`kern`)
              ...(node.effects?.length
                ? layer_effects_trait(node.effects)
                : {}),
            };
          }
          case "RECTANGLE": {
            const {
              fills,
              strokes,
              strokeDashes,
              strokeWeight,
              strokeCap,
              strokeJoin,
            } = node;

            const visible_fills = visible_paints(fills);
            const visible_strokes = strokes ? visible_paints(strokes) : [];
            const first_visible_fill = first_visible(fills);
            const first_visible_stroke = strokes
              ? first_visible(strokes)
              : undefined;

            const fills_paints = visible_fills
              .map(paint)
              .filter((p): p is cg.Paint => p !== undefined);
            const strokes_paints = visible_strokes
              .map(paint)
              .filter((p): p is cg.Paint => p !== undefined);

            if (first_visible_fill?.type === "IMAGE") {
              return {
                id: node.id,
                name: node.name,
                active: node.visible ?? true,
                locked: node.locked ?? false,
                rotation: node.rotation ?? 0,
                opacity: node.opacity ?? 1,
                blend_mode: map.layerBlendModeMap[node.blendMode],
                z_index: 0,
                type: "image",
                src: images[first_visible_fill.imageRef!],
                position: "absolute",
                left: node.relativeTransform![0][2],
                top: node.relativeTransform![1][2],
                width: node.size!.x,
                height: node.size!.y,
                corner_radius: node.cornerRadius ?? 0,
                ...rectangleCornerRadius(
                  node.rectangleCornerRadii,
                  node.cornerRadius ?? 0
                ),
                fit: "cover",
                //
                border:
                  first_visible_stroke?.type === "SOLID"
                    ? {
                        border_width: strokeWeight ?? 0,
                        border_color: toSolidPaint(first_visible_stroke).color,
                        border_style: strokeDashes ? "dashed" : "solid",
                      }
                    : undefined,
                //
                style: {},
                ...(node.effects?.length
                  ? layer_effects_trait(node.effects)
                  : {}),
              } satisfies grida.program.nodes.ImageNode;
            }

            return {
              id: node.id,
              name: node.name,
              active: node.visible ?? true,
              locked: node.locked ?? false,
              rotation: node.rotation ?? 0,
              opacity: node.opacity ?? 1,
              blend_mode: map.layerBlendModeMap[node.blendMode],
              z_index: 0,
              type: "rectangle",
              //
              position: "absolute",
              left: node.relativeTransform![0][2],
              top: node.relativeTransform![1][2],
              width: node.size!.x,
              height: node.size!.y,
              fills: fills_paints.length > 0 ? fills_paints : undefined,
              strokes: strokes_paints.length > 0 ? strokes_paints : undefined,
              stroke_width: strokeWeight ?? 0,
              stroke_cap: strokeCap
                ? (map.strokeCapMap[strokeCap] ?? "butt")
                : "butt",
              stroke_join: strokeJoin
                ? (map.strokeJoinMap[strokeJoin] ?? "miter")
                : "miter",
              corner_radius: node.cornerRadius ?? 0,
              ...rectangleCornerRadius(
                node.rectangleCornerRadii,
                node.cornerRadius ?? 0
              ),
              ...(node.effects?.length
                ? layer_effects_trait(node.effects)
                : {}),
            } satisfies grida.program.nodes.RectangleNode;
          }
          case "ELLIPSE": {
            const { fills, strokes, strokeWeight, strokeCap, strokeJoin } =
              node;

            const visible_fills = visible_paints(fills);
            const visible_strokes = strokes ? visible_paints(strokes) : [];
            const first_visible_fill = first_visible(fills);
            const first_visible_stroke = strokes
              ? first_visible(strokes)
              : undefined;

            const fills_paints = visible_fills
              .map(paint)
              .filter((p): p is cg.Paint => p !== undefined);
            const strokes_paints = visible_strokes
              .map(paint)
              .filter((p): p is cg.Paint => p !== undefined);

            return {
              id: node.id,
              name: node.name,
              active: node.visible ?? true,
              locked: node.locked ?? false,
              rotation: node.rotation ?? 0,
              opacity: node.opacity ?? 1,
              blend_mode: map.layerBlendModeMap[node.blendMode],
              z_index: 0,
              type: "ellipse",
              //
              position: "absolute",
              left: node.relativeTransform![0][2],
              top: node.relativeTransform![1][2],
              width: node.size!.x,
              height: node.size!.y,
              fills: fills_paints.length > 0 ? fills_paints : undefined,
              strokes: strokes_paints.length > 0 ? strokes_paints : undefined,
              stroke_width: strokeWeight ?? 0,
              stroke_cap: strokeCap
                ? (map.strokeCapMap[strokeCap] ?? "butt")
                : "butt",
              stroke_join: strokeJoin
                ? (map.strokeJoinMap[strokeJoin] ?? "miter")
                : "miter",
              // arc data
              inner_radius: node.arcData.innerRadius,
              angle_offset: cmath.rad2deg(node.arcData.startingAngle),
              angle: cmath.rad2deg(
                node.arcData.endingAngle - node.arcData.startingAngle
              ),
              ...(node.effects?.length
                ? layer_effects_trait(node.effects)
                : {}),
            } satisfies grida.program.nodes.EllipseNode;
          }
          case "BOOLEAN_OPERATION": {
          }
          case "LINE": {
            const {
              fills,
              strokes,
              strokeWeight,
              strokeCap,
              strokeAlign,
              strokeJoin,
            } = node;
            const visible_strokes = strokes ? visible_paints(strokes) : [];
            const first_visible_stroke = first_visible(strokes ?? []);

            const strokes_paints = visible_strokes
              .map(paint)
              .filter((p): p is cg.Paint => p !== undefined);

            return {
              id: node.id,
              name: node.name,
              active: node.visible ?? true,
              locked: node.locked ?? false,
              rotation: node.rotation ?? 0,
              opacity: node.opacity ?? 1,
              blend_mode: map.layerBlendModeMap[node.blendMode],
              z_index: 0,
              type: "line",
              position: "absolute",
              strokes: strokes_paints.length > 0 ? strokes_paints : undefined,
              stroke_width: strokeWeight ?? 0,
              stroke_align: strokeAlign
                ? (map.strokeAlignMap[strokeAlign] ?? "inside")
                : "inside",
              stroke_cap: strokeCap
                ? (map.strokeCapMap[strokeCap] ?? "butt")
                : "butt",
              stroke_join: strokeJoin
                ? (map.strokeJoinMap[strokeJoin] ?? "miter")
                : "miter",
              left: node.relativeTransform![0][2],
              top: node.relativeTransform![1][2],
              width: node.size!.x,
              height: 0,
              ...(node.effects?.length
                ? layer_effects_trait(node.effects)
                : {}),
            } satisfies grida.program.nodes.LineNode;
          }
          case "SLICE": {
            return;
          }
          case "REGULAR_POLYGON":
          case "STAR":
          case "VECTOR": {
            const { fills, strokes, fillGeometry, strokeGeometry } = node;

            // check if vector can be converted to line
            // if (
            //   (fillGeometry?.length ?? 0) === 0 &&
            //   strokeGeometry?.length === 1
            // ) {
            //   const path = strokeGeometry[0].path;

            //   if (linedata) {
            //     return {
            //       id: node.id,
            //       name: node.name,
            //       active: node.visible ?? true,
            //       locked: node.locked ?? false,
            //       rotation: node.rotation ?? 0,
            //       opacity: node.opacity ?? 1,
            //       zIndex: 0,
            //       type: "line",
            //       position: "absolute",
            //       left: node.relativeTransform![0][2],
            //       top: node.relativeTransform![1][2],
            //       width: linedata.x2 - linedata.x1,
            //       height: 0,
            //     } satisfies grida.program.nodes.LineNode;
            //   }
            // }

            const visible_fills = visible_paints(fills);
            const visible_strokes = strokes ? visible_paints(strokes) : [];
            const first_visible_fill = first_visible(fills);

            const fills_paints = visible_fills
              .map(paint)
              .filter((p): p is cg.Paint => p !== undefined);
            const strokes_paints = visible_strokes
              .map(paint)
              .filter((p): p is cg.Paint => p !== undefined);

            return {
              id: node.id,
              name: node.name,
              active: node.visible ?? true,
              locked: node.locked ?? false,
              rotation: node.rotation ?? 0,
              opacity: node.opacity ?? 1,
              blend_mode: map.layerBlendModeMap[node.blendMode],
              z_index: 0,
              type: "svgpath",
              //
              position: "absolute",
              left: node.relativeTransform![0][2],
              top: node.relativeTransform![1][2],
              width: node.size!.x,
              height: node.size!.y,
              fills: fills_paints.length > 0 ? fills_paints : undefined,
              // effects: [], // TODO:
              // cornerRadius: node.cornerRadius
              //   ? node.cornerRadius
              //   : node.rectangleCornerRadii
              //     ? {
              //         topLeftRadius: node.rectangleCornerRadii[0],
              //         topRightRadius: node.rectangleCornerRadii[1],
              //         bottomRightRadius: node.rectangleCornerRadii[2],
              //         bottomLeftRadius: node.rectangleCornerRadii[3],
              //       }
              //     : 0,
              paths: [
                ...(node.fillGeometry?.map((p) => ({
                  d: p.path ?? "",
                  fill_rule: map.windingRuleMap[p.windingRule],
                  fill: "fill" as const,
                })) ?? []),
                ...(node.strokeGeometry?.map((p) => ({
                  d: p.path ?? "",
                  fill_rule: map.windingRuleMap[p.windingRule],
                  fill: "stroke" as const,
                })) ?? []),
              ],
              ...(node.effects?.length
                ? layer_effects_trait(node.effects)
                : {}),
            } satisfies grida.program.nodes.SVGPathNode;
          }

          // IR nodes - extended types with additional data
          case "X_VECTOR": {
            const visible_fills = visible_paints(node.fills);
            const visible_strokes = node.strokes
              ? visible_paints(node.strokes)
              : [];
            const first_visible_fill = first_visible(node.fills);
            const first_visible_stroke = node.strokes
              ? first_visible(node.strokes)
              : undefined;

            const fills_paints = visible_fills
              .map(paint)
              .filter((p): p is cg.Paint => p !== undefined);
            const strokes_paints = visible_strokes
              .map(paint)
              .filter((p): p is cg.Paint => p !== undefined);

            // Convert Figma VectorNetwork to Grida vn.VectorNetwork format
            const gridaVectorNetwork: vn.VectorNetwork = {
              vertices: node.vectorNetwork.vertices.map((v) => [v.x, v.y]),
              segments: node.vectorNetwork.segments.map((seg) => ({
                a: seg.start.vertex,
                b: seg.end.vertex,
                ta: [seg.start.dx, seg.start.dy],
                tb: [seg.end.dx, seg.end.dy],
              })),
            };

            return {
              id: node.id,
              name: node.name,
              active: node.visible ?? true,
              locked: node.locked ?? false,
              rotation: 0,
              opacity: node.opacity ?? 1,
              blend_mode: map.layerBlendModeMap[node.blendMode],
              z_index: 0,
              type: "vector",
              position: "absolute",
              left: node.relativeTransform![0][2],
              top: node.relativeTransform![1][2],
              width: node.size!.x,
              height: node.size!.y,
              fills: fills_paints.length > 0 ? fills_paints : undefined,
              strokes: strokes_paints.length > 0 ? strokes_paints : undefined,
              stroke_width: node.strokeWeight ?? 0,
              stroke_align: node.strokeAlign
                ? (map.strokeAlignMap[node.strokeAlign] ?? "center")
                : undefined,
              stroke_cap: node.strokeCap
                ? (map.strokeCapMap[node.strokeCap] ?? "butt")
                : "butt",
              stroke_join: node.strokeJoin
                ? (map.strokeJoinMap[node.strokeJoin] ?? "miter")
                : "miter",
              corner_radius: node.cornerRadius ?? 0,
              vector_network: gridaVectorNetwork,
              ...(node.effects?.length
                ? layer_effects_trait(node.effects)
                : {}),
            } satisfies grida.program.nodes.VectorNode;
          }
          case "X_STAR": {
            const visible_fills = visible_paints(node.fills);
            const visible_strokes = node.strokes
              ? visible_paints(node.strokes)
              : [];
            const first_visible_fill = first_visible(node.fills);
            const first_visible_stroke = node.strokes
              ? first_visible(node.strokes)
              : undefined;

            const fills_paints = visible_fills
              .map(paint)
              .filter((p): p is cg.Paint => p !== undefined);
            const strokes_paints = visible_strokes
              .map(paint)
              .filter((p): p is cg.Paint => p !== undefined);

            return {
              id: node.id,
              name: node.name,
              active: node.visible ?? true,
              locked: node.locked ?? false,
              rotation: 0,
              opacity: node.opacity ?? 1,
              blend_mode: map.layerBlendModeMap[node.blendMode],
              z_index: 0,
              type: "star",
              position: "absolute",
              left: node.relativeTransform![0][2],
              top: node.relativeTransform![1][2],
              width: node.size!.x,
              height: node.size!.y,
              fills: fills_paints.length > 0 ? fills_paints : undefined,
              strokes: strokes_paints.length > 0 ? strokes_paints : undefined,
              stroke_width: node.strokeWeight ?? 0,
              stroke_align: node.strokeAlign
                ? (map.strokeAlignMap[node.strokeAlign] ?? "center")
                : undefined,
              stroke_cap: node.strokeCap
                ? (map.strokeCapMap[node.strokeCap] ?? "butt")
                : "butt",
              stroke_join: node.strokeJoin
                ? (map.strokeJoinMap[node.strokeJoin] ?? "miter")
                : "miter",
              point_count: node.pointCount,
              inner_radius: node.innerRadius,
              ...(node.effects?.length
                ? layer_effects_trait(node.effects)
                : {}),
            } satisfies grida.program.nodes.RegularStarPolygonNode;
          }
          case "X_REGULAR_POLYGON": {
            const visible_fills = visible_paints(node.fills);
            const visible_strokes = node.strokes
              ? visible_paints(node.strokes)
              : [];
            const first_visible_fill = first_visible(node.fills);
            const first_visible_stroke = node.strokes
              ? first_visible(node.strokes)
              : undefined;

            const fills_paints = visible_fills
              .map(paint)
              .filter((p): p is cg.Paint => p !== undefined);
            const strokes_paints = visible_strokes
              .map(paint)
              .filter((p): p is cg.Paint => p !== undefined);

            return {
              id: node.id,
              name: node.name,
              active: node.visible ?? true,
              locked: node.locked ?? false,
              rotation: 0,
              opacity: node.opacity ?? 1,
              blend_mode: map.layerBlendModeMap[node.blendMode],
              z_index: 0,
              type: "polygon",
              position: "absolute",
              left: node.relativeTransform![0][2],
              top: node.relativeTransform![1][2],
              width: node.size!.x,
              height: node.size!.y,
              fills: fills_paints.length > 0 ? fills_paints : undefined,
              strokes: strokes_paints.length > 0 ? strokes_paints : undefined,
              stroke_width: node.strokeWeight ?? 0,
              stroke_align: node.strokeAlign
                ? (map.strokeAlignMap[node.strokeAlign] ?? "center")
                : undefined,
              stroke_cap: node.strokeCap
                ? (map.strokeCapMap[node.strokeCap] ?? "butt")
                : "butt",
              stroke_join: node.strokeJoin
                ? (map.strokeJoinMap[node.strokeJoin] ?? "miter")
                : "miter",
              point_count: node.pointCount,
              ...(node.effects?.length
                ? layer_effects_trait(node.effects)
                : {}),
            } satisfies grida.program.nodes.RegularPolygonNode;
          }

          // components
          case "COMPONENT_SET": {
            throw new Error(`Unsupported node type: ${node.type}`);
          }

          // figjam
          case "LINK_UNFURL":
          case "EMBED":
          case "CONNECTOR":
          case "STICKY":
          case "TABLE":
          case "SHAPE_WITH_TEXT":
          case "TABLE_CELL":
          case "WASHI_TAPE":
          case "WIDGET":
            throw new Error(`Unknown node type: ${node.type}`);
        }
      }
    }

    //
  }

  /**
   * Namespace for converting Kiwi format (from .fig files and clipboard) to Figma REST API types
   */
  export namespace kiwi {
    /**
     * Convert Kiwi GUID to string ID
     * Format: `sessionID:localID`
     */
    export function guid(kiwi: { sessionID: number; localID: number }): string {
      return `${kiwi.sessionID}:${kiwi.localID}`;
    }

    export namespace map {
      /**
       * Convert Kiwi figrest.BlendMode to Figma REST API BlendMode
       * Defaults to "PASS_THROUGH"
       */
      export function blendMode(
        kiwi: figkiwi.BlendMode | undefined
      ): figrest.BlendMode {
        return (kiwi ?? "PASS_THROUGH") as figrest.BlendMode; // They use the same names
      }

      /**
       * Convert Kiwi StrokeAlign to Figma REST API StrokeAlign
       */
      export function strokeAlign(
        kiwi: figkiwi.StrokeAlign
      ): "INSIDE" | "OUTSIDE" | "CENTER" {
        return kiwi as "INSIDE" | "OUTSIDE" | "CENTER";
      }

      /**
       * Convert Kiwi StrokeCap to Figma REST API StrokeCap
       */
      export function strokeCap(
        kiwi: figkiwi.StrokeCap
      ): figrest.LineNode["strokeCap"] {
        // Kiwi has more cap types than REST API, map what we can
        switch (kiwi) {
          case "NONE":
            return "NONE";
          case "ROUND":
            return "ROUND";
          case "SQUARE":
            return "SQUARE";
          case "ARROW_LINES":
            return "LINE_ARROW";
          case "ARROW_EQUILATERAL":
            return "TRIANGLE_ARROW";
          case "DIAMOND_FILLED":
            return "DIAMOND_FILLED";
          case "TRIANGLE_FILLED":
            return "TRIANGLE_FILLED";
          case "CIRCLE_FILLED":
            return "CIRCLE_FILLED";
          default:
            return "NONE";
        }
      }

      /**
       * Convert Kiwi StrokeJoin to Figma REST API StrokeJoin
       */
      export function strokeJoin(
        kiwi: figkiwi.StrokeJoin
      ): "MITER" | "BEVEL" | "ROUND" {
        return kiwi as "MITER" | "BEVEL" | "ROUND";
      }
    }

    export namespace factory {
      /**
       * Convert Kiwi Color to Figma REST API Color
       */
      function color(kiwi: figkiwi.Color): {
        r: number;
        g: number;
        b: number;
        a: number;
      } {
        return {
          r: kiwi.r,
          g: kiwi.g,
          b: kiwi.b,
          a: kiwi.a,
        };
      }

      /**
       * Convert Kiwi Vector to Figma REST API Vector
       */
      function vector(kiwi: figkiwi.Vector): { x: number; y: number } {
        return {
          x: kiwi.x,
          y: kiwi.y,
        };
      }

      /**
       * Convert Kiwi Matrix to Figma REST API Transform
       */
      function transform(
        kiwi: figkiwi.Matrix
      ): [[number, number, number], [number, number, number]] {
        return [
          [kiwi.m00, kiwi.m01, kiwi.m02],
          [kiwi.m10, kiwi.m11, kiwi.m12],
        ];
      }

      /**
       * Convert Kiwi GUID to string ID
       * @deprecated Use iofigma.kiwi.guid() instead
       */
      const guid = iofigma.kiwi.guid;

      /**
       * Calculate absolute bounding box from transform and size
       */
      function absoluteBounds(
        relativeTransform: [[number, number, number], [number, number, number]],
        size: { x: number; y: number }
      ): { x: number; y: number; width: number; height: number } {
        const x = relativeTransform[0][2];
        const y = relativeTransform[1][2];
        return {
          x,
          y,
          width: size.x,
          height: size.y,
        };
      }

      /**
       * Convert Kiwi figrest.Paint to Figma REST API Paint
       */
      function paint(kiwi: figkiwi.Paint): figrest.Paint | undefined {
        if (!kiwi.type) return undefined;

        switch (kiwi.type) {
          case "SOLID": {
            if (!kiwi.color) return undefined;
            return {
              type: "SOLID",
              visible: kiwi.visible ?? true,
              opacity: kiwi.opacity ?? 1,
              blendMode: kiwi.blendMode
                ? map.blendMode(kiwi.blendMode)
                : "NORMAL",
              color: color(kiwi.color),
            } satisfies figrest.SolidPaint;
          }
          case "GRADIENT_LINEAR":
          case "GRADIENT_RADIAL":
          case "GRADIENT_ANGULAR":
          case "GRADIENT_DIAMOND": {
            const gradientStops =
              kiwi.stops?.map((stop) => ({
                color: color(stop.color),
                position: stop.position,
              })) ?? [];

            const gradientHandlePositions = kiwi.transform
              ? [
                  { x: kiwi.transform.m02, y: kiwi.transform.m12 },
                  {
                    x: kiwi.transform.m00 + kiwi.transform.m02,
                    y: kiwi.transform.m10 + kiwi.transform.m12,
                  },
                  {
                    x: kiwi.transform.m01 + kiwi.transform.m02,
                    y: kiwi.transform.m11 + kiwi.transform.m12,
                  },
                ]
              : [
                  { x: 0, y: 0 },
                  { x: 1, y: 0 },
                  { x: 0, y: 1 },
                ];

            return {
              type: kiwi.type,
              visible: kiwi.visible ?? true,
              opacity: kiwi.opacity ?? 1,
              blendMode: kiwi.blendMode
                ? map.blendMode(kiwi.blendMode)
                : "NORMAL",
              gradientStops,
              gradientHandlePositions,
            } as figrest.GradientPaint;
          }
          case "IMAGE": {
            // Image paint support would require image hash and storage
            // For now, return undefined or fallback
            return undefined;
          }
          default:
            return undefined;
        }
      }

      /**
       * Convert array of Kiwi Paints to Figma REST API Paints
       */
      function paints(kiwiPaints?: figkiwi.Paint[]): figrest.Paint[] {
        if (!kiwiPaints) return [];
        return kiwiPaints
          .map(paint)
          .filter((p): p is figrest.Paint => p !== undefined);
      }

      /**
       * Convert Kiwi Effects to Figma REST API Effects
       */
      function effects(kiwiEffects?: figkiwi.Effect[]): figrest.Effect[] {
        if (!kiwiEffects) return [];

        return kiwiEffects
          .map((effect): figrest.Effect | undefined => {
            if (!effect.type) return undefined;

            switch (effect.type) {
              case "DROP_SHADOW":
                return {
                  type: "DROP_SHADOW",
                  visible: effect.visible ?? true,
                  color: effect.color
                    ? color(effect.color)
                    : { r: 0, g: 0, b: 0, a: 0.5 },
                  blendMode: effect.blendMode
                    ? map.blendMode(effect.blendMode)
                    : "NORMAL",
                  offset: effect.offset
                    ? vector(effect.offset)
                    : { x: 0, y: 0 },
                  radius: effect.radius ?? 0,
                  spread: effect.spread ?? 0,
                  showShadowBehindNode: effect.showShadowBehindNode ?? false,
                } satisfies figrest.DropShadowEffect;

              case "INNER_SHADOW":
                return {
                  type: "INNER_SHADOW",
                  visible: effect.visible ?? true,
                  color: effect.color
                    ? color(effect.color)
                    : { r: 0, g: 0, b: 0, a: 0.5 },
                  blendMode: effect.blendMode
                    ? map.blendMode(effect.blendMode)
                    : "NORMAL",
                  offset: effect.offset
                    ? vector(effect.offset)
                    : { x: 0, y: 0 },
                  radius: effect.radius ?? 0,
                  spread: effect.spread ?? 0,
                } satisfies figrest.InnerShadowEffect;

              case "FOREGROUND_BLUR":
                return {
                  type: "LAYER_BLUR",
                  visible: effect.visible ?? true,
                  radius: effect.radius ?? 0,
                } satisfies figrest.BlurEffect;

              case "BACKGROUND_BLUR":
                return {
                  type: "BACKGROUND_BLUR",
                  visible: effect.visible ?? true,
                  radius: effect.radius ?? 0,
                } satisfies figrest.BlurEffect;

              default:
                return undefined;
            }
          })
          .filter((e): e is figrest.Effect => e !== undefined);
      }

      /**
       * Convert NodeChange to RECTANGLE node
       */
      function rectangle(
        nc: figkiwi.NodeChange
      ): figrest.SubcanvasNode | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        const relTrans = nc.transform
          ? transform(nc.transform)
          : [
              [1, 0, 0],
              [0, 1, 0],
            ];
        const sz = nc.size ? vector(nc.size) : { x: 0, y: 0 };
        const bounds = absoluteBounds(
          relTrans as [[number, number, number], [number, number, number]],
          sz
        );

        return {
          id: guid(nc.guid),
          name: nc.name,
          type: "RECTANGLE",
          visible: nc.visible ?? true,
          locked: nc.locked ?? false,
          opacity: nc.opacity ?? 1,
          blendMode: map.blendMode(nc.blendMode),
          scrollBehavior: "SCROLLS",
          size: sz,
          relativeTransform: relTrans,
          absoluteBoundingBox: bounds,
          absoluteRenderBounds: bounds,
          fills: nc.fillPaints ? paints(nc.fillPaints) : [],
          strokes: nc.strokePaints ? paints(nc.strokePaints) : [],
          strokeWeight: nc.strokeWeight ?? 0,
          strokeAlign: nc.strokeAlign
            ? map.strokeAlign(nc.strokeAlign)
            : "INSIDE",
          strokeCap: nc.strokeCap ? map.strokeCap(nc.strokeCap) : "NONE",
          strokeJoin: nc.strokeJoin ? map.strokeJoin(nc.strokeJoin) : "MITER",
          cornerRadius: nc.cornerRadius ?? 0,
          rectangleCornerRadii: nc.rectangleCornerRadiiIndependent
            ? [
                nc.rectangleTopLeftCornerRadius ?? 0,
                nc.rectangleTopRightCornerRadius ?? 0,
                nc.rectangleBottomRightCornerRadius ?? 0,
                nc.rectangleBottomLeftCornerRadius ?? 0,
              ]
            : undefined,
          effects: effects(nc.effects),
        };
      }

      /**
       * Convert NodeChange to ELLIPSE node
       */
      function ellipse(
        nc: figkiwi.NodeChange
      ): figrest.SubcanvasNode | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        const relTrans = nc.transform
          ? transform(nc.transform)
          : [
              [1, 0, 0],
              [0, 1, 0],
            ];
        const sz = nc.size ? vector(nc.size) : { x: 0, y: 0 };
        const bounds = absoluteBounds(
          relTrans as [[number, number, number], [number, number, number]],
          sz
        );

        return {
          id: guid(nc.guid),
          name: nc.name,
          type: "ELLIPSE",
          visible: nc.visible ?? true,
          locked: nc.locked ?? false,
          opacity: nc.opacity ?? 1,
          blendMode: map.blendMode(nc.blendMode),
          scrollBehavior: "SCROLLS",
          size: sz,
          relativeTransform: relTrans,
          absoluteBoundingBox: bounds,
          absoluteRenderBounds: bounds,
          fills: nc.fillPaints ? paints(nc.fillPaints) : [],
          strokes: nc.strokePaints ? paints(nc.strokePaints) : [],
          strokeWeight: nc.strokeWeight ?? 0,
          strokeAlign: nc.strokeAlign
            ? map.strokeAlign(nc.strokeAlign)
            : "INSIDE",
          arcData: nc.arcData
            ? {
                startingAngle: nc.arcData.startingAngle ?? 0,
                endingAngle: nc.arcData.endingAngle ?? 2 * Math.PI,
                innerRadius: nc.arcData.innerRadius ?? 0,
              }
            : {
                startingAngle: 0,
                endingAngle: 2 * Math.PI,
                innerRadius: 0,
              },
          effects: effects(nc.effects),
        };
      }

      /**
       * Convert NodeChange to LINE node
       */
      function line(nc: figkiwi.NodeChange): figrest.SubcanvasNode | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        const relTrans = nc.transform
          ? transform(nc.transform)
          : [
              [1, 0, 0],
              [0, 1, 0],
            ];
        const sz = nc.size ? vector(nc.size) : { x: 0, y: 0 };
        const bounds = absoluteBounds(
          relTrans as [[number, number, number], [number, number, number]],
          sz
        );

        return {
          id: guid(nc.guid),
          name: nc.name,
          type: "LINE",
          visible: nc.visible ?? true,
          locked: nc.locked ?? false,
          opacity: nc.opacity ?? 1,
          blendMode: map.blendMode(nc.blendMode),
          scrollBehavior: "SCROLLS",
          size: sz,
          relativeTransform: relTrans,
          absoluteBoundingBox: bounds,
          absoluteRenderBounds: bounds,
          fills: [],
          strokes: nc.strokePaints ? paints(nc.strokePaints) : [],
          strokeWeight: nc.strokeWeight ?? 0,
          strokeAlign: nc.strokeAlign
            ? map.strokeAlign(nc.strokeAlign)
            : "CENTER",
          strokeCap: nc.strokeCap ? map.strokeCap(nc.strokeCap) : "NONE",
          strokeJoin: nc.strokeJoin ? map.strokeJoin(nc.strokeJoin) : "MITER",
          effects: effects(nc.effects),
        };
      }

      /**
       * Convert NodeChange to TEXT node
       */
      function text(nc: figkiwi.NodeChange): figrest.SubcanvasNode | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        const characters = nc.textData?.characters ?? "";
        const relTrans = nc.transform
          ? transform(nc.transform)
          : [
              [1, 0, 0],
              [0, 1, 0],
            ];
        const sz = nc.size ? vector(nc.size) : { x: 0, y: 0 };
        const bounds = absoluteBounds(
          relTrans as [[number, number, number], [number, number, number]],
          sz
        );

        return {
          id: guid(nc.guid),
          name: nc.name,
          type: "TEXT",
          visible: nc.visible ?? true,
          locked: nc.locked ?? false,
          opacity: nc.opacity ?? 1,
          blendMode: map.blendMode(nc.blendMode),
          scrollBehavior: "SCROLLS",
          size: sz,
          relativeTransform: relTrans,
          absoluteBoundingBox: bounds,
          absoluteRenderBounds: bounds,
          characters,
          fills: nc.fillPaints ? paints(nc.fillPaints) : [],
          strokes: nc.strokePaints ? paints(nc.strokePaints) : [],
          strokeWeight: nc.strokeWeight ?? 0,
          style: {
            fontFamily: nc.fontName?.family ?? "Inter",
            fontPostScriptName: nc.fontName?.postscript,
            fontWeight: 400,
            fontSize: nc.fontSize ?? 12,
            textAlignHorizontal: nc.textAlignHorizontal ?? "LEFT",
            textAlignVertical: nc.textAlignVertical ?? "TOP",
            letterSpacing: nc.letterSpacing?.value ?? 0,
            lineHeightPx:
              nc.lineHeight?.units === "PIXELS"
                ? nc.lineHeight.value
                : undefined,
            lineHeightPercent:
              nc.lineHeight?.units === "PERCENT"
                ? nc.lineHeight.value
                : undefined,
            lineHeightPercentFontSize:
              nc.lineHeight?.units === "PERCENT" ? nc.lineHeight.value : 100,
            textAutoResize: nc.textAutoResize ?? "WIDTH_AND_HEIGHT",
            textCase:
              nc.textCase === "ORIGINAL"
                ? undefined
                : (nc.textCase ?? undefined),
            textDecoration: nc.textDecoration ?? "NONE",
          },
          characterStyleOverrides: [],
          styleOverrideTable: {},
          lineTypes: [],
          lineIndentations: [],
          effects: effects(nc.effects),
        };
      }

      /**
       * Convert NodeChange to FRAME node
       */
      function frame(
        nc: figkiwi.NodeChange
      ): figrest.SubcanvasNode | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        const relTrans = nc.transform
          ? transform(nc.transform)
          : [
              [1, 0, 0],
              [0, 1, 0],
            ];
        const sz = nc.size ? vector(nc.size) : { x: 0, y: 0 };
        const bounds = absoluteBounds(
          relTrans as [[number, number, number], [number, number, number]],
          sz
        );

        return {
          id: guid(nc.guid),
          name: nc.name,
          type: "FRAME",
          visible: nc.visible ?? true,
          locked: nc.locked ?? false,
          opacity: nc.opacity ?? 1,
          blendMode: map.blendMode(nc.blendMode),
          scrollBehavior: "SCROLLS",
          size: sz,
          relativeTransform: relTrans,
          absoluteBoundingBox: bounds,
          absoluteRenderBounds: bounds,
          fills: nc.fillPaints ? paints(nc.fillPaints) : [],
          strokes: nc.strokePaints ? paints(nc.strokePaints) : [],
          strokeWeight: nc.strokeWeight ?? 0,
          strokeAlign: nc.strokeAlign
            ? map.strokeAlign(nc.strokeAlign)
            : "INSIDE",
          cornerRadius: nc.cornerRadius ?? 0,
          rectangleCornerRadii: nc.rectangleCornerRadiiIndependent
            ? [
                nc.rectangleTopLeftCornerRadius ?? 0,
                nc.rectangleTopRightCornerRadius ?? 0,
                nc.rectangleBottomRightCornerRadius ?? 0,
                nc.rectangleBottomLeftCornerRadius ?? 0,
              ]
            : undefined,
          clipsContent: true,
          children: [], // Children will be populated by parent logic
          effects: effects(nc.effects),
        };
      }

      /**
       * Convert NodeChange to GROUP node
       */
      function group(
        nc: figkiwi.NodeChange
      ): figrest.SubcanvasNode | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        const relTrans = nc.transform
          ? transform(nc.transform)
          : [
              [1, 0, 0],
              [0, 1, 0],
            ];
        const sz = nc.size ? vector(nc.size) : { x: 0, y: 0 };
        const bounds = absoluteBounds(
          relTrans as [[number, number, number], [number, number, number]],
          sz
        );

        return {
          id: guid(nc.guid),
          name: nc.name,
          type: "GROUP",
          visible: nc.visible ?? true,
          locked: nc.locked ?? false,
          opacity: nc.opacity ?? 1,
          blendMode: map.blendMode(nc.blendMode),
          scrollBehavior: "SCROLLS",
          size: sz,
          relativeTransform: relTrans,
          absoluteBoundingBox: bounds,
          absoluteRenderBounds: bounds,
          children: [], // Children will be populated by parent logic
          clipsContent: false,
          fills: [],
          effects: effects(nc.effects),
        };
      }

      /**
       * Convert Kiwi WindingRule to Figma REST API windingRule
       */
      function windingRule(kiwi: "NONZERO" | "ODD"): "NONZERO" | "EVENODD" {
        return kiwi === "ODD" ? "EVENODD" : "NONZERO";
      }

      /**
       * Convert NodeChange to VECTOR node or X_VECTOR with parsed vector network
       */
      function vectorNode(
        nc: figkiwi.NodeChange,
        message: figkiwi.Message
      ):
        | figrest.SubcanvasNode
        | __ir.VectorNodeWithVectorNetworkDataPresent
        | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        const relTrans = nc.transform
          ? transform(nc.transform)
          : [
              [1, 0, 0],
              [0, 1, 0],
            ];
        const sz = nc.size ? vector(nc.size) : { x: 0, y: 0 };
        const bounds = absoluteBounds(
          relTrans as [[number, number, number], [number, number, number]],
          sz
        );

        // Try to parse vector network blob if available
        if (nc.vectorData?.vectorNetworkBlob !== undefined) {
          const blobBytes = getBlobBytes(
            nc.vectorData.vectorNetworkBlob,
            message
          );

          if (blobBytes) {
            const vectorNetwork = parseVectorNetworkBlob(blobBytes);

            if (vectorNetwork) {
              // Return X_VECTOR with parsed network data
              return {
                id: guid(nc.guid),
                name: nc.name,
                type: "X_VECTOR",
                visible: nc.visible ?? true,
                locked: nc.locked ?? false,
                opacity: nc.opacity ?? 1,
                blendMode: map.blendMode(nc.blendMode),
                scrollBehavior: "SCROLLS",
                size: sz,
                relativeTransform: relTrans,
                absoluteBoundingBox: bounds,
                absoluteRenderBounds: bounds,
                fills: nc.fillPaints ? paints(nc.fillPaints) : [],
                strokes: nc.strokePaints ? paints(nc.strokePaints) : [],
                strokeWeight: nc.strokeWeight ?? 0,
                strokeAlign: nc.strokeAlign
                  ? map.strokeAlign(nc.strokeAlign)
                  : "INSIDE",
                strokeCap: nc.strokeCap ? map.strokeCap(nc.strokeCap) : "NONE",
                strokeJoin: nc.strokeJoin
                  ? map.strokeJoin(nc.strokeJoin)
                  : "MITER",
                effects: effects(nc.effects),
                cornerRadius: nc.cornerRadius ?? 0,
                vectorNetwork, // Parsed vector network data
              } as __ir.VectorNodeWithVectorNetworkDataPresent;
            }
          }
        }

        // Fallback to regular VECTOR with fillGeometry/strokeGeometry
        return {
          id: guid(nc.guid),
          name: nc.name,
          type: "VECTOR",
          visible: nc.visible ?? true,
          locked: nc.locked ?? false,
          opacity: nc.opacity ?? 1,
          blendMode: map.blendMode(nc.blendMode),
          scrollBehavior: "SCROLLS",
          size: sz,
          relativeTransform: relTrans,
          absoluteBoundingBox: bounds,
          absoluteRenderBounds: bounds,
          fills: nc.fillPaints ? paints(nc.fillPaints) : [],
          strokes: nc.strokePaints ? paints(nc.strokePaints) : [],
          strokeWeight: nc.strokeWeight ?? 0,
          strokeCap: nc.strokeCap ? map.strokeCap(nc.strokeCap) : "NONE",
          strokeJoin: nc.strokeJoin ? map.strokeJoin(nc.strokeJoin) : "MITER",
          fillGeometry: nc.fillGeometry?.map((path) => ({
            path: "", // Would need to decode from commandsBlob
            windingRule: path.windingRule
              ? windingRule(path.windingRule)
              : "NONZERO",
          })),
          strokeGeometry: nc.strokeGeometry?.map((path) => ({
            path: "", // Would need to decode from commandsBlob
            windingRule: path.windingRule
              ? windingRule(path.windingRule)
              : "NONZERO",
          })),
          effects: effects(nc.effects),
        };
      }

      /**
       * Convert NodeChange to X_STAR node with point count and inner radius
       */
      function star(
        nc: figkiwi.NodeChange
      ): __ir.StarNodeWithPointsDataPresent | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        const relTrans = nc.transform
          ? transform(nc.transform)
          : [
              [1, 0, 0],
              [0, 1, 0],
            ];
        const sz = nc.size ? vector(nc.size) : { x: 0, y: 0 };
        const bounds = absoluteBounds(
          relTrans as [[number, number, number], [number, number, number]],
          sz
        );

        return {
          id: guid(nc.guid),
          name: nc.name,
          type: "X_STAR",
          visible: nc.visible ?? true,
          locked: nc.locked ?? false,
          opacity: nc.opacity ?? 1,
          blendMode: map.blendMode(nc.blendMode),
          scrollBehavior: "SCROLLS",
          size: sz,
          relativeTransform: relTrans,
          absoluteBoundingBox: bounds,
          absoluteRenderBounds: bounds,
          fills: nc.fillPaints ? paints(nc.fillPaints) : [],
          strokes: nc.strokePaints ? paints(nc.strokePaints) : [],
          strokeWeight: nc.strokeWeight ?? 0,
          strokeAlign: nc.strokeAlign
            ? map.strokeAlign(nc.strokeAlign)
            : "INSIDE",
          strokeCap: nc.strokeCap ? map.strokeCap(nc.strokeCap) : "NONE",
          strokeJoin: nc.strokeJoin ? map.strokeJoin(nc.strokeJoin) : "MITER",
          effects: effects(nc.effects),
          cornerRadius: nc.cornerRadius ?? 0,
          pointCount: nc.count ?? 5, // From Kiwi
          innerRadius: nc.starInnerScale ?? 0.5, // From Kiwi
        } as __ir.StarNodeWithPointsDataPresent;
      }

      /**
       * Convert NodeChange to X_REGULAR_POLYGON node with point count
       */
      function regularPolygon(
        nc: figkiwi.NodeChange
      ): __ir.RegularPolygonNodeWithPointsDataPresent | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        const relTrans = nc.transform
          ? transform(nc.transform)
          : [
              [1, 0, 0],
              [0, 1, 0],
            ];
        const sz = nc.size ? vector(nc.size) : { x: 0, y: 0 };
        const bounds = absoluteBounds(
          relTrans as [[number, number, number], [number, number, number]],
          sz
        );

        return {
          id: guid(nc.guid),
          name: nc.name,
          type: "X_REGULAR_POLYGON",
          visible: nc.visible ?? true,
          locked: nc.locked ?? false,
          opacity: nc.opacity ?? 1,
          blendMode: map.blendMode(nc.blendMode),
          scrollBehavior: "SCROLLS",
          size: sz,
          relativeTransform: relTrans,
          absoluteBoundingBox: bounds,
          absoluteRenderBounds: bounds,
          fills: nc.fillPaints ? paints(nc.fillPaints) : [],
          strokes: nc.strokePaints ? paints(nc.strokePaints) : [],
          strokeWeight: nc.strokeWeight ?? 0,
          strokeAlign: nc.strokeAlign
            ? map.strokeAlign(nc.strokeAlign)
            : "INSIDE",
          strokeCap: nc.strokeCap ? map.strokeCap(nc.strokeCap) : "NONE",
          strokeJoin: nc.strokeJoin ? map.strokeJoin(nc.strokeJoin) : "MITER",
          effects: effects(nc.effects),
          cornerRadius: nc.cornerRadius ?? 0,
          pointCount: nc.count ?? 3, // From Kiwi
        } as __ir.RegularPolygonNodeWithPointsDataPresent;
      }

      /**
       * Main converter: NodeChange → SubcanvasNode or IR node
       *
       * Converts a Kiwi NodeChange to Figma REST API SubcanvasNode or intermediate representation (IR) node.
       * This enables the conversion pipeline: Kiwi → Figma IR → Grida
       *
       * @param nodeChange Kiwi NodeChange from .fig file or clipboard
       * @param message Message containing blobs array (required for vector network parsing)
       * @returns Figma REST API compatible node, IR node, or undefined if unsupported/invalid
       */
      export function node(
        nodeChange: figkiwi.NodeChange,
        message: figkiwi.Message
      ):
        | figrest.SubcanvasNode
        | __ir.VectorNodeWithVectorNetworkDataPresent
        | __ir.StarNodeWithPointsDataPresent
        | __ir.RegularPolygonNodeWithPointsDataPresent
        | undefined {
        if (!nodeChange.type) return undefined;

        switch (nodeChange.type) {
          case "RECTANGLE":
          case "ROUNDED_RECTANGLE":
            return rectangle(nodeChange);
          case "ELLIPSE":
            return ellipse(nodeChange);
          case "LINE":
            return line(nodeChange);
          case "TEXT":
            return text(nodeChange);
          case "FRAME":
            return frame(nodeChange);
          case "GROUP":
            return group(nodeChange);
          case "VECTOR":
            return vectorNode(nodeChange, message);
          case "REGULAR_POLYGON":
            return regularPolygon(nodeChange);
          case "STAR":
            return star(nodeChange);
          default:
            return undefined;
        }
      }
    }
  }
}
