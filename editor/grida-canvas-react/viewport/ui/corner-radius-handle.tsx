import React from "react";
import { useGesture } from "@use-gesture/react";
import { useCurrentEditor } from "../../use-editor";
import { useNode } from "../../provider";
import type cmath from "@grida/cmath";

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

  const bind = useGesture({
    onDragStart: ({ event }) => {
      event.preventDefault();
      editor.surface.surfaceStartCornerRadiusGesture(node_id, anchor);
    },
  });

  const node = useNode(node_id);
  const radii = typeof node.cornerRadius === "number" ? node.cornerRadius : 0;
  const minmargin = Math.max(radii + size, margin);

  return (
    <div
      {...bind()}
      className="hidden group-hover:block border rounded-full bg-white border-workbench-accent-sky absolute z-10 pointer-events-auto"
      style={{
        top: anchor[0] === "n" ? minmargin : "auto",
        bottom: anchor[0] === "s" ? minmargin : "auto",
        left: anchor[1] === "w" ? minmargin : "auto",
        right: anchor[1] === "e" ? minmargin : "auto",
        width: size,
        height: size,
        transform: `translate(${anchor[1] === "w" ? "-50%" : "50%"}, ${anchor[0] === "n" ? "-50%" : "50%"})`,
        cursor: "pointer",
        touchAction: "none",
      }}
    />
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
