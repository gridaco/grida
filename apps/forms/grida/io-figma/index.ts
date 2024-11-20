import { v4 } from "uuid";
import { grida } from "..";
import type {
  SubcanvasNode,
  Node,
  Paint,
  TypeStyle,
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

      export function paint(paint: Paint): grida.program.cg.Paint | undefined {
        switch (paint.type) {
          case "SOLID": {
            return {
              type: "solid",
              color: grida.program.cg.rgbaf_to_rgba8888(
                // opacity is present only when it is not 1
                paint.opacity !== undefined
                  ? { ...paint.color, a: paint.opacity }
                  : paint.color
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
                  color: grida.program.cg.rgbaf_to_rgba8888(stop.color),
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
        node: SubcanvasNode
      ): grida.program.document.IDocumentDefinition {
        const nodes: grida.program.nodes.Node[] = [];
        if ("children" in node) {
          for (const child of node.children) {
            const n = node_without_children(child);
            if (n) {
              nodes.push(n);
            }
          }
        }
        const root: grida.program.nodes.ContainerNode = node_without_children(
          node
        )! as grida.program.nodes.ContainerNode;
        root.position = "relative";
        root.left = 0;
        root.top = 0;

        if (nodes.length > 0) {
          (root as grida.program.nodes.i.IChildren).children = nodes.map(
            (n) => n.id
          );
        }

        return {
          nodes: {
            [root.id]: root,
            ...nodes.reduce((acc: any, node) => {
              acc[node.id] = node;
              return acc;
            }, {}),
          },
          root_id: root.id,
        };
      }

      export function node_without_children(
        node: SubcanvasNode
      ): grida.program.nodes.Node | undefined {
        switch (node.type) {
          case "SECTION": {
            throw new Error(`Unsupported node type: ${node.type}`);
          }
          //
          case "FRAME": {
            const {
              clipsContent,
              itemSpacing,
              paddingLeft,
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
                //     // padding:
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
            } satisfies grida.program.nodes.RectangleNode;
          }
          case "BOOLEAN_OPERATION":
          case "ELLIPSE":
          case "INSTANCE":
          case "LINE":
          case "REGULAR_POLYGON":
          case "SLICE":
          case "STAR":
          case "VECTOR": {
            throw new Error(`Unsupported node type: ${node.type}`);
            // return {
            //   id: node.id,
            //   active: node.visible ?? true,
            //   locked: node.locked ?? false,
            //   rotation: node.rotation ?? 0,
            // };
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
