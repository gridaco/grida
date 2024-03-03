import produce from "immer";
import { CraftHistoryAction, CraftDraftAction } from "./action";
import { EditorState } from "editor/core/states";
import { CraftHtmlElement, CraftNode, CraftRadixIconElement } from "./state";
import { math, XYWH } from "@code-editor/canvas";
import { visit, access, findIndexPath, IndexPath } from "tree-visit";
import { nanoid } from "nanoid";
import * as core from "@reflect-ui/core";
import * as css from "@web-builder/styles";
import * as templates from "../templates";

const canvas = Symbol("canvas");
type NewNodePlacementParentReference = typeof canvas | string;

export function craftDraftReducer(
  state: EditorState,
  action: CraftDraftAction
): EditorState {
  switch (action.type) {
    case "(draft)/(craft)/node/background-color": {
      const { color } = action;
      return produce(state, (draft) => {
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            const colorstr = `rgba(${color.r},${color.g},${color.b},${color.a})`;
            (c as CraftHtmlElement).style!.backgroundColor = colorstr;
          }
        });
      });
    }
    case "(draft)/(craft)/node/foreground-color": {
      const { color } = action;
      return produce(state, (draft) => {
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            const colorstr = `rgba(${color.r},${color.g},${color.b},${color.a})`;
            (c as CraftHtmlElement).style!.color = colorstr;
          }
        });
      });
    }
    case "(draft)/(craft)/node/border/color": {
      const { color } = action;
      return produce(state, (draft) => {
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            const colorstr = `rgba(${color.r},${color.g},${color.b},${color.a})`;
            (c as CraftHtmlElement).style!.borderColor = colorstr;
          }
        });
      });
    }
  }
}

export function craftHistoryReducer(
  state: EditorState,
  action: CraftHistoryAction
): EditorState {
  // console.log("reducer", action);
  switch (action.type) {
    case "(craft)/node/delete": {
      const { id } = action;
      const targets = id ? [id] : state.selectedNodes;
      return produce(state, (draft) => {
        draft.craft.children = draft.craft.children.filter(
          (c) => !targets.includes(c.id)
        );
        draft.selectedNodes = draft.selectedNodes.filter(
          (c) => !targets.includes(c)
        );
      });
    }
    case "(craft)/node/opacity": {
      return produce(state, (draft) => {
        const { opacity } = action;
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            c.style!.opacity = opacity;
          }
        });
      });
    }
    case "(craft)/node/overflow": {
      const { value } = action;
      return produce(state, (draft) => {
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            c.style!.overflow = value;
          }
        });
      });
    }
    case "(craft)/node/corner-radius/all": {
      return produce(state, (draft) => {
        const { radius } = action;
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            c.style!.borderRadius = radius;
          }
        });
      });
    }
    case "(craft)/node/corner-radius/each": {
      return produce(state, (draft) => {
        const { radius } = action;

        visit(draft.craft, {
          getChildren: (node) => node.children ?? [],
          onEnter: (c: CraftNode) => {
            if (draft.selectedNodes.includes(c.id)) {
              const { tl, tr, bl, br } = radius;
              if (tl) c.style!.borderTopLeftRadius = tl;
              if (tr) c.style!.borderTopRightRadius = tr;
              if (bl) c.style!.borderBottomLeftRadius = bl;
              if (br) c.style!.borderBottomRightRadius = br;
              return "skip";
            }
          },
        });
      });
    }
    case "(craft)/node/border/add": {
      return produce(state, (draft) => {
        visit(draft.craft, {
          getChildren: (node) => node.children ?? [],
          onEnter: (node: CraftNode) => {
            if (draft.selectedNodes.includes(node.id)) {
              node.style!.borderWidth = 1;
              node.style!.borderColor = "black";
              return "skip";
            }
          },
        });
      });
    }
    case "(craft)/node/border/remove": {
      return produce(state, (draft) => {
        visit(draft.craft, {
          getChildren: (node) => node.children ?? [],
          onEnter: (c: CraftNode) => {
            if (draft.selectedNodes.includes(c.id)) {
              delete c.style?.borderWidth;
              delete c.style?.borderColor;
              delete c.style?.borderStyle;
              delete c.style?.borderTop;
              delete c.style?.borderBottom;
              delete c.style?.borderLeft;
              delete c.style?.borderRight;
              delete c.style?.borderTopWidth;
              delete c.style?.borderBottomWidth;
              delete c.style?.borderLeftWidth;
              delete c.style?.borderRightWidth;
              delete c.style?.borderTopColor;
              delete c.style?.borderBottomColor;
              delete c.style?.borderLeftColor;
              delete c.style?.borderRightColor;
              delete c.style?.borderTopStyle;
              delete c.style?.borderBottomStyle;
              delete c.style?.borderLeftStyle;
              delete c.style?.borderRightStyle;
              return "skip";
            }
          },
        });
      });
    }
    case "(craft)/node/border/width": {
      return produce(state, (draft) => {
        const { width } = action;
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            c.style!.borderWidth = width;
          }
        });
      });
    }
    case "(craft)/node/box-shadow/add": {
      return produce(state, (draft) => {
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            c.style!.boxShadow = {
              color: { r: 0, g: 0, b: 0, a: 0.25 },
              blurRadius: 4,
              offset: new core.Offset(0, 4),
              spreadRadius: 0,
            };
          }
        });
      });
    }
    case "(craft)/node/box-shadow/remove": {
      return produce(state, (draft) => {
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            delete c.style!.boxShadow;
          }
        });
      });
    }
    case "(craft)/node/box-shadow/color": {
      return produce(state, (draft) => {
        const { color } = action;
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            c.style!.boxShadow!.color = color;
          }
        });
      });
    }
    case "(craft)/node/box-shadow/blur-radius": {
      return produce(state, (draft) => {
        const { radius } = action;
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            c.style!.boxShadow!.blurRadius = radius;
          }
        });
      });
    }
    case "(craft)/node/box-shadow/spread": {
      return produce(state, (draft) => {
        const { radius } = action;
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            c.style!.boxShadow!.spreadRadius = radius;
          }
        });
      });
    }
    case "(craft)/node/box-shadow/offset": {
      return produce(state, (draft) => {
        const { dx, dy } = action;
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            const offset = new core.Offset(
              dx ?? c.style!.boxShadow!.offset.dx ?? 0,
              dy ?? c.style!.boxShadow!.offset.dy ?? 0
            );
            c.style!.boxShadow!.offset = offset;
          }
        });
      });
    }
    case "(craft)/node/box/padding": {
      const { padding } = action;
      return produce(state, (draft) => {
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            c.style!.padding = padding;
          }
        });
      });
    }
    case "(craft)/node/box/margin": {
      const { margin } = action;
      return produce(state, (draft) => {
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            c.style!.margin = margin;
          }
        });
      });
    }
    case "(craft)/node/flex/direction": {
      const { direction } = action;
      return produce(state, (draft) => {
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          c.style!.flexDirection = direction;
        });
      });
    }
    case "(craft)/node/flex/gap": {
      const { gap } = action;
      return produce(state, (draft) => {
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          c.style!.gap = gap;
        });
      });
    }
    case "(craft)/node/text/data": {
      return produce(state, (draft) => {
        const { data } = action;
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            (c as CraftHtmlElement).text = data;
          }
        });
      });
    }
    case "(craft)/node/text/align": {
      const { align } = action;
      console.log("align", align);
      return produce(state, (draft) => {
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            c.style!.textAlign = align;
          }
        });
      });
    }
    case "(craft)/node/text/font/size": {
      const { size } = action;
      return produce(state, (draft) => {
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            c.style!.fontSize = size;
          }
        });
      });
    }
    case "(craft)/node/text/font/weight": {
      const { weight } = action;
      return produce(state, (draft) => {
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            c.style!.fontWeight = css.numericFontWeight(weight);
          }
        });
      });
    }
    case "(craft)/node/icon/data": {
      return produce(state, (draft) => {
        const { data } = action;
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            (c as CraftRadixIconElement).icon = data;
          }
        });
      });
    }
    case "(craft)/node/src/data": {
      return produce(state, (draft) => {
        const { data } = action;
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            c.attributes.src = data;
          }
        });
      });
    }
    case "(craft)/node/background-color": {
      return produce(state, (draft) => {
        const { color } = action;
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            const colorstr = `rgba(${color.r},${color.g},${color.b},${color.a})`;
            (c as CraftHtmlElement).style!.backgroundColor = colorstr;
          }
        });
      });
    }
    case "(craft)/widget/new": {
      const id = new_node_id();

      let parent_path: IndexPath = [];
      let parent_ref: NewNodePlacementParentReference = canvas;
      let point = next_sequential_canvas_placement(state, [0, 0, 100, 100]);

      const is_single_selected = state.selectedNodes.length === 1;

      if (is_single_selected) {
        const selection_id = state.selectedNodes[0];
        const selection = state.craft.children.find(
          (c) => c.id === selection_id
        );
        const can_have_children = selection
          ? can_node_have_children(selection)
          : false;
        if (can_have_children) {
          const parent = selection as CraftNode;

          parent_ref = parent.id;

          parent_path =
            findIndexPath(state.craft, {
              getChildren: (node) => node.children,
              predicate: (node) => node.id === parent_ref,
            }) ?? [];

          // calculate the next placement under the selected node (parent)
          point = node_placement_under_parent(
            [0, 0, 100, 100],
            [parent.absoluteX, parent.absoluteY, parent.width, parent.height]
          );
        }
      }

      const [x, y, w, h] = point;
      switch (action.widget) {
        case "divider": {
          point = next_sequential_canvas_placement(state, [0, 0, 100, 1]);
          break;
        }
        case "flex":
        case "flex flex-row wrap":
        case "flex flex-col":
        case "flex wrap":
        case "flex flex-col wrap":
        case "flex flex-row": {
          point = next_sequential_canvas_placement(state, [0, 0, 200, 100]);
          break;
        }
      }

      return produce(state, (draft) => {
        const parent = access(draft.craft, parent_path!, {
          getChildren: (node) => node.children,
        });

        const widget = templates.new_widget(action.widget, {
          id,
          x,
          y,
          absoluteX: x,
          absoluteY: y,
          width: w,
          height: h,
        });

        parent.children.push(widget);
      });
    }
  }

  return { ...state };
}

/**
 * use this to calculate the next sequential placement of a new node in the canvas
 */
function next_sequential_canvas_placement(
  state: EditorState,
  item: XYWH
): XYWH {
  return math.no_overlap_placement(
    item,
    state.craft.children.map((c) => [
      c.absoluteX,
      c.absoluteY,
      c.width,
      c.height,
    ]),
    {
      padding: 100,
    }
  )!;
}

function node_placement_under_parent(item: XYWH, parent: XYWH): XYWH {
  const [ix, iy, iw, ih] = item;
  const [px, py, pw, ph] = parent;
  // TODO: implement this
  return [px, py, iw, ih];
}

function can_node_have_children(node: CraftNode): boolean {
  // atm, we are checking the availability of children to be added by the object having a children field set.
  // to be more safe, this should be checked by the type of the object.
  return !!node.children;
}

function new_node_id(): string {
  return nanoid();
}
