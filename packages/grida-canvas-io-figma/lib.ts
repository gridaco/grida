import type {
  SubcanvasNode,
  Paint,
  TypeStyle,
  Path,
  LineNode,
  BooleanOperationNode,
  InstanceNode,
  GroupNode,
  FrameNode,
  BlendMode,
  GradientPaint,
} from "@figma/rest-api-spec";
import cmath from "@grida/cmath";
import type cg from "@grida/cg";
import type grida from "@grida/schema";

export namespace iofigma {
  export namespace restful {
    export namespace map {
      export const strokeCapMap: Record<
        NonNullable<LineNode["strokeCap"]>,
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

      export const strokeAlignMap: Record<
        NonNullable<LineNode["strokeAlign"]>,
        cg.StrokeAlign | undefined
      > = {
        CENTER: "center",
        INSIDE: "inside",
        OUTSIDE: "outside",
      };

      export const textAlignMap: Record<
        NonNullable<TypeStyle["textAlignHorizontal"]>,
        cg.TextAlign | undefined
      > = {
        CENTER: "center",
        RIGHT: "right",
        LEFT: "left",
        JUSTIFIED: undefined,
      };

      export const textAlignVerticalMap: Record<
        NonNullable<TypeStyle["textAlignVertical"]>,
        cg.TextAlignVertical
      > = {
        CENTER: "center",
        TOP: "top",
        BOTTOM: "bottom",
      };

      export const textDecorationMap: Record<
        NonNullable<TypeStyle["textDecoration"]>,
        cg.TextDecoration | undefined
      > = {
        NONE: "none",
        STRIKETHROUGH: undefined,
        UNDERLINE: "underline",
      };

      export const windingRuleMap: Record<Path["windingRule"], cg.FillRule> = {
        EVENODD: "evenodd",
        NONZERO: "nonzero",
      };

      export const blendModeMap: Record<BlendMode, cg.BlendMode> = {
        PASS_THROUGH: "normal", // No blending, default behavior.
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
    }

    export namespace factory {
      type Point = { x: number; y: number };

      function getBaseControlPoints(type: cg.GradientPaint["type"]) {
        if (type === "linear_gradient") {
          return {
            A: { x: 0, y: 0.5 },
            B: { x: 1, y: 0.5 },
            C: { x: 0, y: 1 },
          };
        }
        return {
          A: { x: 0.5, y: 0.5 },
          B: { x: 1, y: 0.5 },
          C: { x: 0.5, y: 1 },
        };
      }

      // TODO: move under cmath
      function transformFromPoints(
        points: { A: Point; B: Point; C: Point },
        type: cg.GradientPaint["type"]
      ): cg.AffineTransform {
        const base = getBaseControlPoints(type);

        if (type === "linear_gradient") {
          const dx = points.B.x - points.A.x;
          const dy = points.B.y - points.A.y;
          const len = Math.hypot(dx, dy) || 1e-6;
          const cos = dx / len;
          const sin = dy / len;

          const a = cos * len;
          const d = sin * len;
          const b = -sin;
          const e = cos;
          const tx = points.A.x - b * 0.5;
          const ty = points.A.y - e * 0.5;

          return [
            [a, b, tx],
            [d, e, ty],
          ];
        }

        const dx = points.B.x - points.A.x;
        const dy = points.B.y - points.A.y;
        const len = Math.hypot(dx, dy) || 1e-6;
        const perpX = -dy / len;
        const perpY = dx / len;

        const cRelX = points.C.x - points.A.x;
        const cRelY = points.C.y - points.A.y;
        const cPerpDist = cRelX * perpX + cRelY * perpY;

        const constrainedC = {
          x: points.A.x + perpX * cPerpDist,
          y: points.A.y + perpY * cPerpDist,
        };

        const u1 = base.B.x - base.A.x;
        const u2 = base.B.y - base.A.y;
        const v1 = base.C.x - base.A.x;
        const v2 = base.C.y - base.A.y;

        const p1 = points.B.x - points.A.x;
        const p2 = points.B.y - points.A.y;
        const q1 = constrainedC.x - points.A.x;
        const q2 = constrainedC.y - points.A.y;

        const det = u1 * v2 - u2 * v1 || 1e-6;

        const a = (p1 * v2 - q1 * u2) / det;
        const b = (q1 * u1 - p1 * v1) / det;
        const d = (p2 * v2 - q2 * u2) / det;
        const e = (q2 * u1 - p2 * v1) / det;

        const tx = points.A.x - a * base.A.x - b * base.A.y;
        const ty = points.A.y - d * base.A.x - e * base.A.y;

        return [
          [a, b, tx],
          [d, e, ty],
        ];
      }

      function toGradientPaint(paint: GradientPaint) {
        const map = {
          GRADIENT_LINEAR: "linear_gradient",
          GRADIENT_RADIAL: "radial_gradient",
          GRADIENT_ANGULAR: "sweep_gradient",
          GRADIENT_DIAMOND: "diamond_gradient",
        } as const;

        const type = map[paint.type as keyof typeof map];
        const handles = paint.gradientHandlePositions;
        const points = handles
          ? {
              A: { x: handles[0].x, y: handles[0].y },
              B: { x: handles[1].x, y: handles[1].y },
              C: { x: handles[2].x, y: handles[2].y },
            }
          : getBaseControlPoints(type);

        return {
          type: type,
          transform: transformFromPoints(points, type),
          stops: paint.gradientStops.map((stop) => ({
            offset: stop.position,
            color: cmath.color.rgbaf_multiply_alpha(
              cmath.color.rgbaf_to_rgba8888(stop.color),
              paint.opacity ?? 1
            ),
          })),
        } as cg.GradientPaint;
      }

      function paint(paint: Paint): cg.Paint | undefined {
        switch (paint.type) {
          case "SOLID": {
            return {
              type: "solid",
              color: cmath.color.rgbaf_multiply_alpha(
                cmath.color.rgbaf_to_rgba8888(paint.color),
                paint.opacity ?? 1
              ),
            };
          }
          case "GRADIENT_LINEAR":
          case "GRADIENT_RADIAL":
          case "GRADIENT_ANGULAR":
          case "GRADIENT_DIAMOND": {
            return toGradientPaint(paint);
          }
          case "IMAGE":
            return {
              type: "linear_gradient",
              transform: cmath.transform.identity,
              stops: [
                { offset: 0, color: { r: 217, g: 217, b: 217, a: 1 } },
                { offset: 1, color: { r: 115, g: 115, b: 115, a: 1 } },
              ],
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

      function rectangleCornerRadius(
        rectangleCornerRadii?: number[] | [number, number, number, number]
      ): grida.program.nodes.i.IRectangularCornerRadius {
        return {
          cornerRadiusTopLeft: rectangleCornerRadii?.[0] ?? 0,
          cornerRadiusTopRight: rectangleCornerRadii?.[1] ?? 0,
          cornerRadiusBottomLeft: rectangleCornerRadii?.[2] ?? 0,
          cornerRadiusBottomRight: rectangleCornerRadii?.[3] ?? 0,
        };
      }

      type FigmaParentNode =
        | BooleanOperationNode
        | InstanceNode
        | FrameNode
        | GroupNode;

      export type FactoryContext = {
        // node_id_generator: () => string;
        gradient_id_generator: () => string;
      };

      export function document(
        node: SubcanvasNode,
        images: { [key: string]: string },
        context: FactoryContext
      ): grida.program.document.IPackedSceneDocument {
        const nodes: Record<string, grida.program.nodes.Node> = {};

        function processNode(
          currentNode: SubcanvasNode,
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
            (
              processedNode as grida.program.nodes.i.IChildrenReference
            ).children = currentNode.children
              .map((c) => {
                return processNode(c, currentNode as FigmaParentNode);
              }) // Process each child
              .filter((child) => child !== undefined) // Remove undefined nodes
              .map((child) => child!.id); // Map to IDs
          }

          return processedNode;
        }

        const rootNode = processNode(node) as grida.program.nodes.ContainerNode;
        rootNode.position = "relative";
        rootNode.left = 0;
        rootNode.top = 0;

        if (!rootNode) {
          throw new Error("Failed to process root node");
        }

        return {
          nodes,
          scene: {
            type: "scene",
            id: "scene-" + rootNode.id,
            name: rootNode.name,
            children: [rootNode.id],
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
        node: SubcanvasNode,
        images: { [key: string]: string },
        parent: FigmaParentNode | undefined,
        context: FactoryContext
      ): grida.program.nodes.Node | undefined {
        switch (node.type) {
          case "SECTION": {
            const { fills, strokes, strokeWeight, strokeAlign } = node;

            const first_visible_fill = first_visible(fills);
            const first_visible_stroke = strokes
              ? first_visible(strokes)
              : undefined;

            return {
              id: node.id,
              name: node.name,
              active: node.visible ?? true,
              locked: node.locked ?? false,
              rotation: node.rotation ?? 0,
              opacity: 1,
              zIndex: 0,
              type: "container",
              expanded: false,
              //
              position: "absolute",
              left: node.relativeTransform![0][2],
              top: node.relativeTransform![1][2],
              width: node.size!.x,
              height: node.size!.y,

              fill: first_visible_fill ? paint(first_visible_fill) : undefined,
              //
              border:
                first_visible_stroke?.type === "SOLID"
                  ? {
                      borderWidth: strokeWeight ?? 0,
                      borderColor: cmath.color.rgbaf_multiply_alpha(
                        cmath.color.rgbaf_to_rgba8888(
                          first_visible_stroke.color
                        ),
                        first_visible_stroke.opacity ?? 1
                      ),
                      borderStyle: "none",
                    }
                  : undefined,

              //
              style: {},
              cornerRadius: 0,
              cornerRadiusTopLeft: 0,
              cornerRadiusTopRight: 0,
              cornerRadiusBottomLeft: 0,
              cornerRadiusBottomRight: 0,
              padding: 0,
              // TODO:
              layout: "flow",
              direction: "horizontal",
              mainAxisAlignment: "start",
              crossAxisAlignment: "start",
              mainAxisGap: 0,
              crossAxisGap: 0,
              children: [],
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

            const first_visible_fill = first_visible(fills);
            const first_visible_stroke = strokes
              ? first_visible(strokes)
              : undefined;

            return {
              id: node.id,
              name: node.name,
              active: node.visible ?? true,
              locked: node.locked ?? false,
              rotation: node.rotation ?? 0,
              opacity: node.opacity ?? 1,
              zIndex: 0,
              type: "container",
              expanded: false,
              //
              position: "absolute",
              left: node.relativeTransform![0][2],
              top: node.relativeTransform![1][2],
              width: node.size!.x,
              height: node.size!.y,

              fill: first_visible_fill ? paint(first_visible_fill) : undefined,
              //
              border:
                first_visible_stroke?.type === "SOLID"
                  ? {
                      borderWidth: strokeWeight ?? 0,
                      borderColor: cmath.color.rgbaf_multiply_alpha(
                        cmath.color.rgbaf_to_rgba8888(
                          first_visible_stroke.color
                        ),
                        first_visible_stroke.opacity ?? 1
                      ),
                      borderStyle: strokeDashes ? "dashed" : "solid",
                    }
                  : undefined,

              //
              style: {
                overflow: clipsContent ? "clip" : undefined,
              },
              cornerRadius: node.cornerRadius ?? 0,
              ...rectangleCornerRadius(node.rectangleCornerRadii),
              padding:
                paddingTop === paddingRight &&
                paddingTop === paddingBottom &&
                paddingTop === paddingLeft
                  ? (paddingTop ?? 0)
                  : {
                      paddingTop: paddingTop ?? 0,
                      paddingRight: paddingRight ?? 0,
                      paddingBottom: paddingBottom ?? 0,
                      paddingLeft: paddingLeft ?? 0,
                    },
              // TODO:
              layout: "flow",
              direction: "horizontal",
              mainAxisAlignment: "start",
              crossAxisAlignment: "start",
              mainAxisGap: itemSpacing ?? 0,
              crossAxisGap: counterAxisSpacing ?? itemSpacing ?? 0,
              children: [],
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
              zIndex: 0,
              type: "container",
              expanded: false,
              //
              position: "absolute",
              left: node.relativeTransform![0][2],
              top: node.relativeTransform![1][2],
              width: node.size!.x,
              height: node.size!.y,

              fill: undefined,
              border: undefined,
              //
              style: {},
              cornerRadius: 0,
              ...rectangleCornerRadius([0, 0, 0, 0]),
              padding: 0,
              layout: "flow",
              direction: "horizontal",
              mainAxisAlignment: "start",
              crossAxisAlignment: "start",
              mainAxisGap: 0,
              crossAxisGap: 0,
              children: [],
            } satisfies grida.program.nodes.ContainerNode;
            // throw new Error(`Unsupported node type: ${node.type}`);
          }
          case "TEXT": {
            const { fills, strokes, strokeWeight, strokeDashes } = node;

            const first_visible_fill = first_visible(fills);
            const first_visible_stroke = strokes
              ? first_visible(strokes)
              : undefined;

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
              zIndex: 0,
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
              fill: first_visible_fill ? paint(first_visible_fill) : undefined,
              //
              border:
                first_visible_stroke?.type === "SOLID"
                  ? {
                      borderWidth: strokeWeight ?? 0,
                      borderColor: cmath.color.rgbaf_multiply_alpha(
                        cmath.color.rgbaf_to_rgba8888(
                          first_visible_stroke.color
                        ),
                        first_visible_stroke.opacity ?? 1
                      ),
                      borderStyle: strokeDashes ? "dashed" : "solid",
                    }
                  : undefined,
              //
              style: {},
              textAlign: node.style.textAlignHorizontal
                ? (map.textAlignMap[node.style.textAlignHorizontal] ?? "left")
                : "left",
              textAlignVertical: node.style.textAlignVertical
                ? map.textAlignVerticalMap[node.style.textAlignVertical]
                : "top",
              textDecoration: node.style.textDecoration
                ? (map.textDecorationMap[node.style.textDecoration] ?? "none")
                : "none",
              lineHeight: node.style.lineHeightPercentFontSize
                ? node.style.lineHeightPercentFontSize / 100
                : // normal = 1.2
                  1.2,

              letterSpacing: node.style.letterSpacing,
              fontSize: node.style.fontSize ?? 0,
              fontFamily: node.style.fontFamily,
              fontWeight:
                (node.style.fontWeight as cg.NFontWeight) ?? (400 as const),
            };
          }
          case "RECTANGLE": {
            const { fills, strokes, strokeDashes, strokeWeight, strokeCap } =
              node;

            const first_visible_fill = first_visible(fills);
            const first_visible_stroke = strokes
              ? first_visible(strokes)
              : undefined;

            if (first_visible_fill?.type === "IMAGE") {
              return {
                id: node.id,
                name: node.name,
                active: node.visible ?? true,
                locked: node.locked ?? false,
                rotation: node.rotation ?? 0,
                opacity: node.opacity ?? 1,
                zIndex: 0,
                type: "image",
                src: images[first_visible_fill.imageRef!],
                position: "absolute",
                left: node.relativeTransform![0][2],
                top: node.relativeTransform![1][2],
                width: node.size!.x,
                height: node.size!.y,
                cornerRadius: node.cornerRadius ?? 0,
                ...rectangleCornerRadius(node.rectangleCornerRadii),
                fit: "cover",
                //
                border:
                  first_visible_stroke?.type === "SOLID"
                    ? {
                        borderWidth: strokeWeight ?? 0,
                        borderColor: cmath.color.rgbaf_multiply_alpha(
                          cmath.color.rgbaf_to_rgba8888(
                            first_visible_stroke.color
                          ),
                          first_visible_stroke.opacity ?? 1
                        ),
                        borderStyle: strokeDashes ? "dashed" : "solid",
                      }
                    : undefined,
                //
                style: {},
              } satisfies grida.program.nodes.ImageNode;
            }

            return {
              id: node.id,
              name: node.name,
              active: node.visible ?? true,
              locked: node.locked ?? false,
              rotation: node.rotation ?? 0,
              opacity: node.opacity ?? 1,
              blendMode: map.blendModeMap[node.blendMode],
              zIndex: 0,
              type: "rectangle",
              //
              position: "absolute",
              left: node.relativeTransform![0][2],
              top: node.relativeTransform![1][2],
              width: node.size!.x,
              height: node.size!.y,
              fill: first_visible_fill ? paint(first_visible_fill) : undefined,
              strokeWidth: strokeWeight ?? 0,
              strokeCap: strokeCap
                ? (map.strokeCapMap[strokeCap] ?? "butt")
                : "butt",
              cornerRadius: node.cornerRadius ?? 0,
              ...rectangleCornerRadius(node.rectangleCornerRadii),
            } satisfies grida.program.nodes.RectangleNode;
          }
          case "ELLIPSE": {
            const { fills, strokeWeight, strokeCap } = node;

            const first_visible_fill = first_visible(fills);

            return {
              id: node.id,
              name: node.name,
              active: node.visible ?? true,
              locked: node.locked ?? false,
              rotation: node.rotation ?? 0,
              opacity: node.opacity ?? 1,
              blendMode: map.blendModeMap[node.blendMode],
              zIndex: 0,
              type: "ellipse",
              //
              position: "absolute",
              left: node.relativeTransform![0][2],
              top: node.relativeTransform![1][2],
              width: node.size!.x,
              height: node.size!.y,
              fill: first_visible_fill ? paint(first_visible_fill) : undefined,
              strokeWidth: strokeWeight ?? 0,
              strokeCap: strokeCap
                ? (map.strokeCapMap[strokeCap] ?? "butt")
                : "butt",

              // arc data
              innerRadius: node.arcData.innerRadius,
              angleOffset: cmath.rad2deg(node.arcData.startingAngle),
              angle: cmath.rad2deg(
                node.arcData.endingAngle - node.arcData.startingAngle
              ),
            } satisfies grida.program.nodes.EllipseNode;
          }
          case "BOOLEAN_OPERATION": {
          }
          case "LINE": {
            const { fills, strokeWeight, strokeCap, strokeAlign } = node;
            const first_visible_stroke = first_visible(node.strokes ?? []);

            return {
              id: node.id,
              name: node.name,
              active: node.visible ?? true,
              locked: node.locked ?? false,
              rotation: node.rotation ?? 0,
              opacity: node.opacity ?? 1,
              blendMode: map.blendModeMap[node.blendMode],
              zIndex: 0,
              type: "line",
              position: "absolute",
              stroke: first_visible_stroke
                ? paint(first_visible_stroke)
                : undefined,
              strokeWidth: strokeWeight ?? 0,
              strokeAlign: strokeAlign
                ? (map.strokeAlignMap[strokeAlign] ?? "inside")
                : "inside",
              strokeCap: strokeCap
                ? (map.strokeCapMap[strokeCap] ?? "butt")
                : "butt",
              left: node.relativeTransform![0][2],
              top: node.relativeTransform![1][2],
              width: node.size!.x,
              height: 0,
            } satisfies grida.program.nodes.LineNode;
          }
          case "SLICE": {
            return;
          }
          case "REGULAR_POLYGON":
          case "STAR":
          case "VECTOR": {
            const { fills, fillGeometry, strokeGeometry } = node;

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

            const first_visible_fill = first_visible(fills);

            return {
              id: node.id,
              name: node.name,
              active: node.visible ?? true,
              locked: node.locked ?? false,
              rotation: node.rotation ?? 0,
              opacity: node.opacity ?? 1,
              blendMode: map.blendModeMap[node.blendMode],
              zIndex: 0,
              type: "svgpath",
              //
              position: "absolute",
              left: node.relativeTransform![0][2],
              top: node.relativeTransform![1][2],
              width: node.size!.x,
              height: node.size!.y,
              fill: first_visible_fill ? paint(first_visible_fill) : undefined,
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
                  fillRule: map.windingRuleMap[p.windingRule],
                  fill: "fill" as const,
                })) ?? []),
                ...(node.strokeGeometry?.map((p) => ({
                  d: p.path ?? "",
                  fillRule: map.windingRuleMap[p.windingRule],
                  fill: "stroke" as const,
                })) ?? []),
              ],
            } satisfies grida.program.nodes.SVGPathNode;
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
}
