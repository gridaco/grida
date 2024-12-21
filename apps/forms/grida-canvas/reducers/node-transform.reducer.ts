import { produce } from "immer";
import { grida } from "@/grida";
import assert from "assert";
import { cmath } from "../cmath";

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
      // scale changes top, right, bottom, left, width and height
      // this is the one we should use when user "resizes" the node with the resize handles
      type: "scale";

      /**
       * the initial rectangle to be scaled
       */
      rect: cmath.Rectangle;

      /**
       * the space of the node will be scaled
       *
       * e.g. when multiple nodes are selected, the space will be the bounding box of all selected nodes
       */
      // space: cmath.Rectangle;

      /**
       * the transform origin, absolute. (not relative to the space)
       */
      origin: cmath.Vector2;

      /**
       * the direction and distance of the scale relative to the origin
       */
      movement: cmath.Vector2;

      /**
       * whether to preserve the aspect ratio while scaling
       */
      preserveAspectRatio: boolean;
    }
  | {
      // resize only changes right, bottom, width, height
      type: "resize";
      delta: cmath.Vector2;
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

          draft.left = cmath.quantize(x, 1);
          draft.top = cmath.quantize(y, 1);
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
      case "scale": {
        const { rect, origin, movement, preserveAspectRatio } = action;

        let scale: cmath.Vector2;

        if (preserveAspectRatio) {
          // TODO: need to use scale-applied rectangle to calculate the dominant axis
          // the current implementation works, but it's not best for the ux.
          // conceptually, the movement point should align with certain side of the rectangle
          const dominantAxis =
            Math.abs(movement[0]) > Math.abs(movement[1]) ? "x" : "y";

          switch (dominantAxis) {
            case "x": {
              const factor = (rect.width + movement[0]) / rect.width;
              scale = [factor, factor];
              break;
            }
            case "y": {
              const factor = (rect.height + movement[1]) / rect.height;
              scale = [factor, factor];
              break;
            }
          }
        } else {
          scale = cmath.rect.getScaleFactors(rect, {
            x: rect.x,
            y: rect.y,
            width: rect.width + movement[0],
            height: rect.height + movement[1],
          });
        }

        const scaled = cmath.rect.positive(
          cmath.rect.scale(rect, origin, scale)
        );

        const _draft = draft as grida.program.nodes.i.ICSSDimension &
          grida.program.nodes.i.IPositioning;

        if (_draft.position === "absolute") {
          _draft.left = cmath.quantize(scaled.x, 1);
          _draft.top = cmath.quantize(scaled.y, 1);
        }

        _draft.width = cmath.quantize(Math.max(scaled.width, 0), 1);
        if (draft.type === "line") {
          _draft.height = 0;
        } else {
          _draft.height = cmath.quantize(Math.max(scaled.height, 0), 1);
        }

        return;
      }
      case "resize": {
        const { delta } = action;
        const [dx, dy] = delta;

        const _draft = draft as grida.program.nodes.i.IFixedDimension &
          grida.program.nodes.i.IPositioning;

        // right, bottom
        if (_draft.right) _draft.right -= dx;
        if (_draft.bottom) _draft.bottom -= dy;

        // size
        _draft.width = cmath.quantize(Math.max(_draft.width + dx, 0), 1);
        if (draft.type === "line") _draft.height = 0;
        else _draft.height = cmath.quantize(Math.max(_draft.height + dy, 0), 1);
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
            draft.left = cmath.quantize(new_l, 1);
          }
          if (draft.right !== undefined) {
            const new_r = draft.right - dx;
            draft.right = cmath.quantize(new_r, 1);
          }
        } else {
          draft.left = cmath.quantize(dx, 1);
        }
      }
      if (dy) {
        if (draft.top !== undefined || draft.bottom !== undefined) {
          if (draft.top !== undefined) {
            const new_t = draft.top + dy;
            draft.top = cmath.quantize(new_t, 1);
          }
          if (draft.bottom !== undefined) {
            const new_b = draft.bottom - dy;
            draft.bottom = cmath.quantize(new_b, 1);
          }
        } else {
          draft.top = cmath.quantize(dy, 1);
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
