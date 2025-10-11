import grida from "@grida/schema";
import cmath from "@grida/cmath";

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

/**
 * @mutates draft
 * @param draft node
 * @param action scale, translate, resize, position
 */
export default function updateNodeTransform(
  draft: grida.program.nodes.Node,
  action: NodeTransformAction
) {
  // Scene nodes cannot be transformed
  if (draft.type === "scene") {
    return;
  }

  switch (action.type) {
    case "position": {
      const { x, y } = action;
      if ("position" in draft && draft.position == "absolute") {
        // TODO: with resolve box model
        // TODO: also need to update right, bottom, width, height

        if ("left" in draft) draft.left = cmath.quantize(x, 1);
        if ("top" in draft) draft.top = cmath.quantize(y, 1);
      } else {
        // ignore
        reportError("node is not draggable");
      }
      break;
    }
    case "translate": {
      const { dx, dy } = action;
      if ("position" in draft) {
        moveNode(draft as grida.program.nodes.i.IPositioning, dx, dy);
      }
      break;
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

      const scaled = cmath.rect.positive(cmath.rect.scale(rect, origin, scale));

      const _draft = draft as grida.program.nodes.i.ICSSDimension &
        grida.program.nodes.i.IPositioning;

      const heightWasNumber = typeof _draft.height === "number";

      if (_draft.position === "absolute") {
        _draft.left = cmath.quantize(scaled.x, 1);
        _draft.top = cmath.quantize(scaled.y, 1);
      }

      // For text nodes, use ceil to ensure we don't cut off content
      if (draft.type === "text") {
        _draft.width = Math.ceil(Math.max(scaled.width, 0));
      } else {
        _draft.width = cmath.quantize(Math.max(scaled.width, 0), 1);
      }

      if (draft.type === "line") {
        _draft.height = 0;
      } else {
        const preserveAutoHeight =
          draft.type === "text" && !heightWasNumber && movement[1] === 0;
        if (!preserveAutoHeight) {
          // For text nodes, use ceil to ensure we don't cut off content
          if (draft.type === "text") {
            _draft.height = Math.ceil(Math.max(scaled.height, 0));
          } else {
            _draft.height = cmath.quantize(Math.max(scaled.height, 0), 1);
          }
        }
      }

      break;
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
      // For text nodes, use ceil to ensure we don't cut off content
      if (draft.type === "text") {
        _draft.width = Math.ceil(Math.max(_draft.width + dx, 0));
      } else {
        _draft.width = cmath.quantize(Math.max(_draft.width + dx, 0), 1);
      }

      if (draft.type === "line") {
        _draft.height = 0;
      } else {
        // For text nodes, use ceil to ensure we don't cut off content
        if (draft.type === "text") {
          _draft.height = Math.ceil(Math.max(_draft.height + dy, 0));
        } else {
          _draft.height = cmath.quantize(Math.max(_draft.height + dy, 0), 1);
        }
      }
      break;
    }
  }
}

function moveNode(
  draft: grida.program.nodes.i.IPositioning,
  dx: number,
  dy: number
) {
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
}
