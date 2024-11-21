import { v4 } from "uuid";
import { grida } from "..";
import type {
  SubcanvasNode,
  Node,
  Paint,
  TypeStyle,
  Path,
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

      export function document(
        node: SubcanvasNode,
        images: { [key: string]: string }
      ): grida.program.document.IDocumentDefinition {
        const nodes: Record<string, grida.program.nodes.Node> = {};

        function processNode(
          currentNode: SubcanvasNode
        ): grida.program.nodes.Node | undefined {
          const processedNode = node_without_children(currentNode, images);

          if (!processedNode) {
            return undefined;
          }

          // Add the node to the flat structure
          nodes[processedNode.id] = processedNode;

          // If the node has children, process them recursively
          if ("children" in currentNode && currentNode.children?.length) {
            (processedNode as grida.program.nodes.i.IChildren).children =
              currentNode.children
                .map(processNode) // Process each child
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
        images: { [key: string]: string }
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
            } = node;

            const first_visible_fill = first_visible(fills);

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
            return;
            // throw new Error(`Unsupported node type: ${node.type}`);
          }
          case "TEXT": {
            const { fills } = node;

            const first_visible_fill = first_visible(fills);
            const figma_text_resizing_model = node.style.textAutoResize;

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
              left: node.relativeTransform![0][2],
              top: node.relativeTransform![1][2],
              width: node.size!.x,
              height: node.size!.y,
              fill: first_visible_fill ? paint(first_visible_fill) : undefined,
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
            const { fills } = node;

            const first_visible_fill = first_visible(fills);

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
          }
          case "SLICE": {
            return;
          }
          case "REGULAR_POLYGON":
          case "STAR":
          case "VECTOR": {
            // TODO: fallbacks to rectangle
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
              paths:
                node.fillGeometry?.map((p) => ({
                  d: p.path ?? "",
                  fillRile: windingRuleMap[p.windingRule],
                })) ?? [],
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
