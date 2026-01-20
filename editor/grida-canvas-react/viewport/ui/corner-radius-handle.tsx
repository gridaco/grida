import React, { useMemo } from "react";
import { useGesture } from "@use-gesture/react";
import { useCurrentEditor } from "../../use-editor";
import { useNode, useGestureState, useTransformState } from "../../provider";
import cmath from "@grida/cmath";

export function NodeOverlayCornerRadiusHandle({
  node_id,
  anchor,
  size = 8,
  margin = 16,
}: {
  node_id: string;
  anchor: cmath.IntercardinalDirection;
  margin?: number;
  size?: number;
}) {
  const editor = useCurrentEditor();
  const { gesture } = useGestureState();
  const { transform } = useTransformState();

  const bind = useGesture({
    onDragStart: ({ event }) => {
      event.preventDefault();
      const altKey = (event as PointerEvent).altKey || false;
      editor.surface.surfaceStartCornerRadiusGesture(node_id, anchor, altKey);
    },
  });

  const node = useNode(node_id);

  // Get current radius value for this corner
  const currentRadius = useMemo(() => {
    if (
      node.type === "rectangle" ||
      node.type === "container" ||
      node.type === "component" ||
      node.type === "image" ||
      node.type === "video"
    ) {
      const keyMap = {
        nw: "rectangular_corner_radius_top_left",
        ne: "rectangular_corner_radius_top_right",
        se: "rectangular_corner_radius_bottom_right",
        sw: "rectangular_corner_radius_bottom_left",
      } as const;
      return (node as any)[keyMap[anchor]] ?? 0;
    }
    return typeof node.corner_radius === "number" ? node.corner_radius : 0;
  }, [node, anchor]);

  // Mathematical constants: computed once per size change
  const labelOffsets = useMemo(
    () => ({
      X: size / 2 + 4,
      Y_TOP: size / 2 + 4,
      Y_BOTTOM: size / 2 + 20,
    }),
    [size]
  );

  // Shared geometry calculations: compute once, use multiple times
  const geometry = useMemo(() => {
    const br = editor.geometryProvider.getNodeAbsoluteBoundingRect(node_id);
    if (!br) return null;

    const boundingSurfaceRect = cmath.rect.transform(br, transform);
    const [scaleX, scaleY] = cmath.transform.getScale(transform);
    const w = boundingSurfaceRect.width;
    const h = boundingSurfaceRect.height;
    const minmargin = Math.max(currentRadius + size, margin);
    const useMarginBased = currentRadius < margin;

    // Corner coordinates: C = (C_x, C_y)
    const corners = {
      nw: [0, 0],
      ne: [w, 0],
      se: [w, h],
      sw: [0, h],
    } as const;
    const [C_x, C_y] = corners[anchor];

    // Arc center offset: O = (O_x, O_y) = (r * s_x * sign_x, r * s_y * sign_y)
    const offsets = {
      nw: [currentRadius * scaleX, currentRadius * scaleY],
      ne: [-currentRadius * scaleX, currentRadius * scaleY],
      se: [-currentRadius * scaleX, -currentRadius * scaleY],
      sw: [currentRadius * scaleX, -currentRadius * scaleY],
    } as const;
    const [O_x, O_y] = offsets[anchor];

    // Center coordinates: M = (M_x, M_y) = (w/2, h/2)
    const M_x = w / 2;
    const M_y = h / 2;

    // Handle position relative to center: H = (H_x, H_y) = (C + O - M)
    const H_x = C_x + O_x - M_x;
    const H_y = C_y + O_y - M_y;

    return {
      w,
      h,
      scaleX,
      scaleY,
      minmargin,
      useMarginBased,
      H_x,
      H_y,
      M_x,
      M_y,
    };
  }, [
    editor.geometryProvider,
    node_id,
    anchor,
    currentRadius,
    transform,
    size,
    margin,
  ]);

  // Calculate handle position: at arc center O when radius >= margin, otherwise at corner with margin
  const handleStyle = useMemo(() => {
    if (!geometry) return null;

    const { useMarginBased, H_x, H_y, minmargin } = geometry;

    if (!useMarginBased && currentRadius > 0) {
      // Handle at arc center: H = (C + O - M) relative to center
      return {
        left: `calc(50% + ${H_x}px)`,
        top: `calc(50% + ${H_y}px)`,
        transform: "translate(-50%, -50%)",
      };
    }

    // Handle at corner with margin: position = minmargin from edge
    const positions = {
      nw: { top: `${minmargin}px`, left: `${minmargin}px` },
      ne: { top: `${minmargin}px`, right: `${minmargin}px` },
      se: { bottom: `${minmargin}px`, right: `${minmargin}px` },
      sw: { bottom: `${minmargin}px`, left: `${minmargin}px` },
    } as const;

    return {
      ...positions[anchor],
      transform: `translate(${anchor[1] === "w" ? "-50%" : "50%"}, ${anchor[0] === "n" ? "-50%" : "50%"})`,
    };
  }, [geometry, anchor, currentRadius]);

  // Only show label for the specific handle being dragged
  const isDragging =
    gesture.type === "corner-radius" &&
    gesture.node_id === node_id &&
    gesture.anchor === anchor;

  // Label position relative to handle (inside direction, toward center)
  const labelStyle = useMemo(() => {
    if (!isDragging || !geometry) return null;

    const { useMarginBased, H_x, H_y, M_x, minmargin } = geometry;

    if (!useMarginBased && currentRadius > 0) {
      // Label offset from handle: L_offset = (L_x, L_y) in inside direction
      const labelOffsetMap = {
        nw: [labelOffsets.X, labelOffsets.Y_TOP],
        ne: [-labelOffsets.X, labelOffsets.Y_TOP],
        se: [-labelOffsets.X, -labelOffsets.Y_BOTTOM],
        sw: [labelOffsets.X, -labelOffsets.Y_BOTTOM],
      } as const;
      const [L_x, L_y] = labelOffsetMap[anchor];

      // Label position relative to center: L = H + L_offset
      const L_x_center = H_x + L_x;
      const L_y_center = H_y + L_y;

      // For right-side corners (ne, se), use 'right' instead of 'left' to maintain consistency
      if (anchor === "ne" || anchor === "se") {
        // Convert from center-relative to right-edge distance: right = M_x - L_x_center
        return {
          right: `${M_x - L_x_center}px`,
          top: `calc(50% + ${L_y_center}px)`,
        };
      }

      return {
        left: `calc(50% + ${L_x_center}px)`,
        top: `calc(50% + ${L_y_center}px)`,
      };
    }

    // Margin-based: label inside direction from handle
    const labelPositions = {
      nw: {
        top: `${minmargin + labelOffsets.Y_TOP}px`,
        left: `${minmargin + labelOffsets.X}px`,
      },
      ne: {
        top: `${minmargin + labelOffsets.Y_TOP}px`,
        right: `${minmargin + labelOffsets.X}px`,
      },
      se: {
        bottom: `${minmargin + labelOffsets.X}px`,
        right: `${minmargin + labelOffsets.X}px`,
      },
      sw: {
        bottom: `${minmargin + labelOffsets.X}px`,
        left: `${minmargin + labelOffsets.X}px`,
      },
    } as const;

    return labelPositions[anchor];
  }, [isDragging, geometry, anchor, currentRadius, labelOffsets]);

  if (!handleStyle) return null;

  return (
    <>
      <div
        {...bind()}
        className="hidden group-hover:block border rounded-full bg-white border-workbench-accent-sky absolute z-10 pointer-events-auto"
        style={{
          ...handleStyle,
          width: size,
          height: size,
          cursor: "pointer",
          touchAction: "none",
        }}
      />
      {isDragging && labelStyle && (
        <div className="absolute pointer-events-none z-20" style={labelStyle}>
          <div className="bg-workbench-accent-sky text-white text-xs px-1.5 py-0.5 rounded-sm shadow whitespace-nowrap">
            Radius {currentRadius}
          </div>
        </div>
      )}
    </>
  );
}

export function NodeOverlayRectangularCornerRadiusHandles({
  node_id,
}: {
  node_id: string;
}) {
  return (
    <>
      <NodeOverlayCornerRadiusHandle node_id={node_id} anchor="nw" />
      <NodeOverlayCornerRadiusHandle node_id={node_id} anchor="ne" />
      <NodeOverlayCornerRadiusHandle node_id={node_id} anchor="sw" />
      <NodeOverlayCornerRadiusHandle node_id={node_id} anchor="se" />
    </>
  );
}
