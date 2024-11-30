import { produce } from "immer";
import { grida } from "@/grida";
import assert from "assert";

type NodeTransformAction =
  | {
      type: "move";
      /**
       * distance or delta
       */
      dx: number;
      /**
       * distance or delta
       */
      dy: number;
    }
  | {
      type: "resize";
      anchor: "nw" | "ne" | "sw" | "se";
      /**
       * distance or delta
       */
      dx: number;
      /**
       * distance or delta
       */
      dy: number;
    };

export default function nodeTransformReducer(
  node: grida.program.nodes.Node,
  action: NodeTransformAction
) {
  return produce(node, (draft) => {
    assert(
      draft.type !== "template_instance",
      "template_instance cannot be transformed"
    );

    switch (action.type) {
      case "move": {
        const { dx, dy } = action;
        if (draft.position == "absolute") {
          if (dx) {
            if (draft.left !== undefined || draft.right !== undefined) {
              if (draft.left !== undefined) {
                const new_l = draft.left + dx;
                draft.left = new_l;
              }
              if (draft.right !== undefined) {
                const new_r = draft.right - dx;
                draft.right = new_r;
              }
            } else {
              draft.left = dx;
            }
          }
          if (dy) {
            if (draft.top !== undefined || draft.bottom !== undefined) {
              if (draft.top !== undefined) {
                const new_t = draft.top + dy;
                draft.top = new_t;
              }
              if (draft.bottom !== undefined) {
                const new_b = draft.bottom - dy;
                draft.bottom = new_b;
              }
            } else {
              draft.top = dy;
            }
          }
        } else {
          // ignore
          reportError("node is not draggable");
        }

        return;
      }
      case "resize": {
        const { anchor, dx, dy } = action;
        //
        // TODO: calculate the final delta based on anchor and movement delta

        switch (anchor) {
          case "nw": {
            break;
          }
          case "ne": {
            break;
          }
          case "sw": {
            break;
          }
          case "se": {
            if (dx) {
              ((draft as grida.program.nodes.i.ICSSDimension)
                .width as number) += dx;

              if (draft.right !== undefined) {
                draft.right -= dx;
              }
            }

            if (dy) {
              if (draft.type === "line") {
                // line cannot be resized in height
                draft.height = 0;
                break;
              }
              ((draft as grida.program.nodes.i.ICSSDimension)
                .height as number) += dy;

              if (draft.bottom !== undefined) {
                draft.bottom -= dy;
              }
            }

            break;
          }
        }

        return;
      }
    }
  });
}
