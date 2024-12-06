import { produce } from "immer";
import { grida } from "@/grida";
import assert from "assert";
import { cmath } from "../math";

type NodeTransformAction =
  | {
      type: "position";
      /**
       * distance
       */
      x: number;
      /**
       * distance
       */
      y: number;
    }
  | {
      type: "translate";
      /**
       * delta
       */
      dx: number;
      /**
       * delta
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
      case "position": {
        const { x, y } = action;
        if (draft.position == "absolute") {
          // TODO: with resolve box model
          // TODO: also need to update right, bottom, width, height

          draft.left = x;
          draft.top = y;
        } else {
          // ignore
          reportError("node is not draggable");
        }
        break;
      }
      case "translate": {
        const { dx, dy } = action;
        return moveNode(draft, dx, dy);
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

function moveNode(
  node: grida.program.nodes.Node,
  dx: number,
  dy: number
): grida.program.nodes.Node {
  return produce(node, (draft: grida.program.nodes.i.IPositioning) => {
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
  });
}

type BoxConstraint = { min: number; max: number; size: number };

function resolveBoxModelAxis(box: Partial<BoxConstraint>): BoxConstraint {
  const { min, max, size } = box;

  // if already resolved, return
  if (min !== undefined && max !== undefined && size !== undefined)
    return box as BoxConstraint;

  assert(
    (min !== undefined && max !== undefined) ||
      (min !== undefined && size !== undefined) ||
      (max !== undefined && size !== undefined),
    "Invalid state: At least 'min & max', 'min & size', or 'max & size' must be defined."
  );

  if (min !== undefined && size !== undefined) {
    // Resolve max
    return { min, max: min + size, size };
  }

  if (max !== undefined && size !== undefined) {
    // Resolve min
    return { min: max - size, max, size };
  }

  if (min !== undefined && max !== undefined) {
    // Resolve size
    assert(max >= min, "'max' must be '>=' to 'min' when resolving 'size'.");
    return { min, max, size: max - min };
  }

  // can't reach here
  throw new Error();
}

function resolveBoxModel(node: {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  width?: number;
  height?: number;
}): cmath.Rectangle {
  assert(typeof node.left === "number" || node.left === undefined);
  assert(typeof node.right === "number" || node.right === undefined);
  assert(typeof node.top === "number" || node.top === undefined);
  assert(typeof node.bottom === "number" || node.bottom === undefined);
  assert(typeof node.width === "number" || node.width === undefined);
  assert(typeof node.height === "number" || node.width === undefined);

  // let top,
  //   right,
  //   bottom,
  //   left,
  //   width,
  //   height = undefined;

  assert(
    node.left !== undefined ||
      node.right !== undefined ||
      node.width !== undefined,
    "Either 'left' or 'right' or 'width' must be defined"
  );

  assert(
    node.top !== undefined ||
      node.bottom !== undefined ||
      node.height !== undefined,
    "Either 'top' or 'bottom' or 'height' must be defined"
  );

  // TODO: fallback left and top to 0 if not defined and cannot be inferred

  const _x_axis = resolveBoxModelAxis({
    min: node.left,
    max: node.right,
    size: node.width,
  });

  const _y_axis = resolveBoxModelAxis({
    min: node.top,
    max: node.bottom,
    size: node.height,
  });

  return {
    x: _x_axis.min,
    y: _y_axis.min,
    width: _x_axis.size,
    height: _y_axis.size,
  };
}
