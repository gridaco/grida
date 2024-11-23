import { v4 } from "uuid";
import { grida } from "..";
import type {
  SubcanvasNode,
  Node,
  Paint,
  TypeStyle,
  Path,
  BooleanOperationNode,
  InstanceNode,
  GroupNode,
  FrameNode,
  BlendMode,
} from "@figma/rest-api-spec";

export namespace iofigma {
  export namespace restful {
    export namespace map {
      export const textAlignMap: Record<
        NonNullable<TypeStyle["textAlignHorizontal"]>,
        grida.program.cg.TextAlign | undefined
      > = {
        CENTER: "center",
        RIGHT: "right",
        LEFT: "left",
        JUSTIFIED: undefined,
      };

      export const textAlignVerticalMap: Record<
        NonNullable<TypeStyle["textAlignVertical"]>,
        grida.program.cg.TextAlignVertical
      > = {
        CENTER: "center",
        TOP: "top",
        BOTTOM: "bottom",
      };

      export const textDecorationMap: Record<
        NonNullable<TypeStyle["textDecoration"]>,
        grida.program.cg.TextDecoration | undefined
      > = {
        NONE: "none",
        STRIKETHROUGH: undefined,
        UNDERLINE: "underline",
      };

      export const windingRuleMap: Record<
        Path["windingRule"],
        grida.program.cg.FillRule
      > = {
        EVENODD: "evenodd",
        NONZERO: "nonzero",
      };

      export const blendModeMap: Record<
        BlendMode,
        grida.program.css.BlendMode
      > = {
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

      export function paint(paint: Paint): grida.program.cg.Paint | undefined {
        switch (paint.type) {
          case "SOLID": {
            return {
              type: "solid",
              color: grida.program.cg.rgbaf_multiply_alpha(
                grida.program.cg.rgbaf_to_rgba8888(paint.color),
                // opacity is present only when it is not 1
                paint.opacity ?? 1
              ),
            };
          }
          case "GRADIENT_LINEAR":
          case "GRADIENT_RADIAL": {
            const _t = {
              GRADIENT_LINEAR: "linear_gradient",
              GRADIENT_RADIAL: "radial_gradient",
            } as const;
            return {
              type: _t[paint.type],
              id: v4(),
              stops: paint.gradientStops.map((stop) => {
                return {
                  offset: stop.position,
                  color: grida.program.cg.rgbaf_multiply_alpha(
                    grida.program.cg.rgbaf_to_rgba8888(stop.color),
                    // opacity is present only when it is not 1
                    paint.opacity ?? 1
                  ),
                };
              }),
            };
          }
          case "GRADIENT_ANGULAR":
          case "GRADIENT_DIAMOND":
          case "IMAGE":
            // fallback to linear gradient
            return {
              type: "linear_gradient",
              id: v4(),
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
      export function first_visible<T extends { visible?: boolean }>(
        arr: T[]
      ): T | undefined {
        return arr.filter((f) => f.visible !== false)[0];
      }

      type FigmaParentNode =
        | BooleanOperationNode
        | InstanceNode
        | FrameNode
        | GroupNode;

      export function document(
        node: SubcanvasNode,
        images: { [key: string]: string }
      ): grida.program.document.IDocumentDefinition {
        const nodes: Record<string, grida.program.nodes.Node> = {};

        function processNode(
          currentNode: SubcanvasNode,
          parent?: FigmaParentNode
        ): grida.program.nodes.Node | undefined {
          const processedNode = node_without_children(
            currentNode,
            images,
            parent
          );

          if (!processedNode) {
            return undefined;
          }

          // Add the node to the flat structure
          nodes[processedNode.id] = processedNode;

          // If the node has children, process them recursively
          if ("children" in currentNode && currentNode.children?.length) {
            (processedNode as grida.program.nodes.i.IChildren).children =
              currentNode.children
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
          root_id: rootNode.id,
        };
      }

      export function node_without_children(
        node: SubcanvasNode,
        images: { [key: string]: string },
        parent?: FigmaParentNode
      ): grida.program.nodes.Node | undefined {
        switch (node.type) {
          case "SECTION": {
            throw new Error(`Unsupported node type: ${node.type}`);
          }
          //
          case "INSTANCE":
          case "FRAME": {
            const {
              clipsContent,
              itemSpacing,
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
                      borderColor: grida.program.cg.rgbaf_multiply_alpha(
                        grida.program.cg.rgbaf_to_rgba8888(
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
                padding: `${paddingTop ?? 0}px ${paddingRight ?? 0}px ${paddingBottom ?? 0}px ${paddingLeft ?? 0}px`,
              },
              cornerRadius: node.cornerRadius
                ? node.cornerRadius
                : node.rectangleCornerRadii
                  ? {
                      topLeftRadius: node.rectangleCornerRadii[0],
                      topRightRadius: node.rectangleCornerRadii[1],
                      bottomRightRadius: node.rectangleCornerRadii[2],
                      bottomLeftRadius: node.rectangleCornerRadii[3],
                    }
                  : 0,
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
                      borderColor: grida.program.cg.rgbaf_multiply_alpha(
                        grida.program.cg.rgbaf_to_rgba8888(
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
                ? textAlignMap[node.style.textAlignHorizontal] ?? "left"
                : "left",
              textAlignVertical: node.style.textAlignVertical
                ? textAlignVerticalMap[node.style.textAlignVertical]
                : "top",
              textDecoration: node.style.textDecoration
                ? textDecorationMap[node.style.textDecoration] ?? "none"
                : "none",
              lineHeight: node.style.lineHeightPercentFontSize
                ? node.style.lineHeightPercentFontSize / 100
                : // normal = 1.2
                  1.2,

              letterSpacing: node.style.letterSpacing,
              fontSize: node.style.fontSize ?? 0,
              fontFamily: node.style.fontFamily,
              fontWeight:
                (node.style.fontWeight as grida.program.cg.NFontWeight) ??
                (400 as const),
            };
          }
          case "RECTANGLE": {
            const { fills, strokes, strokeDashes, strokeWeight } = node;

            const first_visible_fill = first_visible(fills);
            const first_visible_stroke = strokes
              ? first_visible(strokes)
              : undefined;

            const cornerRadius = node.cornerRadius
              ? node.cornerRadius
              : node.rectangleCornerRadii
                ? {
                    topLeftRadius: node.rectangleCornerRadii[0],
                    topRightRadius: node.rectangleCornerRadii[1],
                    bottomRightRadius: node.rectangleCornerRadii[2],
                    bottomLeftRadius: node.rectangleCornerRadii[3],
                  }
                : 0;

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
                cornerRadius,
                fit: "cover",
                //
                border:
                  first_visible_stroke?.type === "SOLID"
                    ? {
                        borderWidth: strokeWeight ?? 0,
                        borderColor: grida.program.cg.rgbaf_multiply_alpha(
                          grida.program.cg.rgbaf_to_rgba8888(
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
              zIndex: 0,
              type: "rectangle",
              //
              position: "absolute",
              left: node.relativeTransform![0][2],
              top: node.relativeTransform![1][2],
              width: node.size!.x,
              height: node.size!.y,
              fill: first_visible_fill ? paint(first_visible_fill) : undefined,
              effects: [], // TODO:
              cornerRadius: cornerRadius,
            } satisfies grida.program.nodes.RectangleNode;
          }
          case "ELLIPSE": {
            const { fills } = node;

            const first_visible_fill = first_visible(fills);

            return {
              id: node.id,
              name: node.name,
              active: node.visible ?? true,
              locked: node.locked ?? false,
              rotation: node.rotation ?? 0,
              opacity: node.opacity ?? 1,
              zIndex: 0,
              type: "ellipse",
              //
              position: "absolute",
              left: node.relativeTransform![0][2],
              top: node.relativeTransform![1][2],
              width: node.size!.x,
              height: node.size!.y,
              fill: first_visible_fill ? paint(first_visible_fill) : undefined,
              effects: [], // TODO:
            } satisfies grida.program.nodes.EllipseNode;
          }
          case "BOOLEAN_OPERATION": {
          }
          case "LINE": {
            return {
              id: node.id,
              name: node.name,
              active: node.visible ?? true,
              locked: node.locked ?? false,
              rotation: node.rotation ?? 0,
              opacity: node.opacity ?? 1,
              zIndex: 0,
              type: "line",
              position: "absolute",
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
              zIndex: 0,
              type: "vector",
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
                  fillRule: windingRuleMap[p.windingRule],
                  fill: "fill" as const,
                })) ?? []),
                ...(node.strokeGeometry?.map((p) => ({
                  d: p.path ?? "",
                  fillRule: windingRuleMap[p.windingRule],
                  fill: "stroke" as const,
                })) ?? []),
              ],
            } satisfies grida.program.nodes.VectorNode;
          }

          // components
          case "COMPONENT":
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
