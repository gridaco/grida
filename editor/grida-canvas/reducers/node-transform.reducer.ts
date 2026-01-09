import grida from "@grida/schema";
import cmath from "@grida/cmath";
import { editor } from "@/grida-canvas";
import assert from "assert";

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

      /**
       * optional target aspect ratio [width, height] to enforce.
       * When provided, this ratio is used instead of the current rect's aspect ratio.
       * This is used when the node has layout_target_aspect_ratio set.
       */
      targetAspectRatio?: [number, number];
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
 * @param geometry Geometry query interface for resolving node dimensions
 * @param nodeId Node ID for geometry queries
 */
export default function updateNodeTransform(
  draft: grida.program.nodes.Node,
  action: NodeTransformAction,
  geometry: editor.api.IDocumentGeometryQuery,
  nodeId: string
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

        if (
          ("layout_inset_left" satisfies grida.program.nodes.UnknownNodePropertiesKey) in
          draft
        )
          draft.layout_inset_left = cmath.quantize(x, 1);
        if (
          ("layout_inset_top" satisfies grida.program.nodes.UnknownNodePropertiesKey) in
          draft
        )
          draft.layout_inset_top = cmath.quantize(y, 1);
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
      const { rect, origin, movement, preserveAspectRatio, targetAspectRatio } =
        action;

      let scale: cmath.Vector2;

      if (preserveAspectRatio) {
        // TODO: need to use scale-applied rectangle to calculate the dominant axis
        // the current implementation works, but it's not best for the ux.
        // conceptually, the movement point should align with certain side of the rectangle
        const dominantAxis =
          Math.abs(movement[0]) > Math.abs(movement[1]) ? "x" : "y";

        if (targetAspectRatio) {
          // Use target aspect ratio instead of current rect's ratio
          const targetRatio = targetAspectRatio[0] / targetAspectRatio[1];
          switch (dominantAxis) {
            case "x": {
              const newWidth = rect.width + movement[0];
              const newHeight = newWidth / targetRatio;
              scale = [newWidth / rect.width, newHeight / rect.height];
              break;
            }
            case "y": {
              const newHeight = rect.height + movement[1];
              const newWidth = newHeight * targetRatio;
              scale = [newWidth / rect.width, newHeight / rect.height];
              break;
            }
          }
        } else {
          // Use current rect's aspect ratio
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

      const heightWasNumber = typeof _draft.layout_target_height === "number";

      if (_draft.position === "absolute") {
        _draft.layout_inset_left = cmath.quantize(scaled.x, 1);
        _draft.layout_inset_top = cmath.quantize(scaled.y, 1);
      }

      // For text nodes, use ceil to ensure we don't cut off content
      if (draft.type === "tspan") {
        _draft.layout_target_width = Math.ceil(Math.max(scaled.width, 0));
      } else {
        _draft.layout_target_width = cmath.quantize(
          Math.max(scaled.width, 0),
          1
        );
      }

      if (draft.type === "line") {
        _draft.layout_target_height = 0;
      } else {
        const preserveAutoHeight =
          draft.type === "tspan" && !heightWasNumber && movement[1] === 0;
        if (!preserveAutoHeight) {
          // For text nodes, use ceil to ensure we don't cut off content
          if (draft.type === "tspan") {
            _draft.layout_target_height = Math.ceil(Math.max(scaled.height, 0));
          } else {
            _draft.layout_target_height = cmath.quantize(
              Math.max(scaled.height, 0),
              1
            );
          }
        }
      }

      break;
    }
    case "resize": {
      const { delta } = action;
      const [dx, dy] = delta;

      const _draft = draft as grida.program.nodes.i.ILayoutTrait;

      // Get resolved dimensions from geometry cache
      // This is necessary when width/height are relative (e.g., percentages, viewport units)
      const rect = geometry.getNodeAbsoluteBoundingRect(nodeId);
      assert(rect, `Bounding rect for node ${nodeId} must be defined`);

      const currentWidth = rect.width;
      const currentHeight = rect.height;

      // right, bottom
      if (_draft.layout_inset_right) _draft.layout_inset_right -= dx;
      if (_draft.layout_inset_bottom) _draft.layout_inset_bottom -= dy;

      // size
      // For text nodes, use ceil to ensure we don't cut off content
      if (draft.type === "tspan") {
        _draft.layout_target_width = Math.ceil(Math.max(currentWidth + dx, 0));
      } else {
        _draft.layout_target_width = cmath.quantize(
          Math.max(currentWidth + dx, 0),
          1
        );
      }

      if (draft.type === "line") {
        _draft.layout_target_height = 0;
      } else {
        // For text nodes, use ceil to ensure we don't cut off content
        if (draft.type === "tspan") {
          _draft.layout_target_height = Math.ceil(
            Math.max(currentHeight + dy, 0)
          );
        } else {
          _draft.layout_target_height = cmath.quantize(
            Math.max(currentHeight + dy, 0),
            1
          );
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
      if (
        draft.layout_inset_left !== undefined ||
        draft.layout_inset_right !== undefined
      ) {
        if (draft.layout_inset_left !== undefined) {
          const new_l = draft.layout_inset_left + dx;
          draft.layout_inset_left = cmath.quantize(new_l, 1);
        }
        if (draft.layout_inset_right !== undefined) {
          const new_r = draft.layout_inset_right - dx;
          draft.layout_inset_right = cmath.quantize(new_r, 1);
        }
      } else {
        draft.layout_inset_left = cmath.quantize(dx, 1);
      }
    }
    if (dy) {
      if (
        draft.layout_inset_top !== undefined ||
        draft.layout_inset_bottom !== undefined
      ) {
        if (draft.layout_inset_top !== undefined) {
          const new_t = draft.layout_inset_top + dy;
          draft.layout_inset_top = cmath.quantize(new_t, 1);
        }
        if (draft.layout_inset_bottom !== undefined) {
          const new_b = draft.layout_inset_bottom - dy;
          draft.layout_inset_bottom = cmath.quantize(new_b, 1);
        }
      } else {
        draft.layout_inset_top = cmath.quantize(dy, 1);
      }
    }
  } else {
    // ignore
    reportError("node is not draggable");
  }
}
