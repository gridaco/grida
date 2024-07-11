import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { cn } from "@/utils";
import { useGesture } from "@use-gesture/react";
import { useEditorState } from "@/scaffolds/editor";

interface NodeProps {
  node_id?: string;
}

export function Node({
  node_id,
  children,
}: React.PropsWithChildren<NodeProps>) {
  const [state, dispatch] = useEditorState();
  const [hovered, setHovered] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    document: { selected_node_id },
  } = state;

  const selected = selected_node_id == node_id;

  const onSelect = useCallback(() => {
    dispatch({
      type: "editor/document/select-node",
      node_id: node_id,
    });
  }, [dispatch, node_id]);

  const bind = useGesture(
    {
      onMouseEnter: ({ event }) => {
        setHovered(true);
      },
      onMouseLeave: ({ event }) => {
        setHovered(false);
      },
      onClick: onSelect,
    },
    {
      eventOptions: {
        capture: true,
      },
    }
  );

  useEffect(() => {
    if (hovered && containerRef.current && overlayRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const overlay = overlayRef.current;

      overlay.style.position = "absolute";
      overlay.style.top = `${containerRect.top}px`;
      overlay.style.left = `${containerRect.left}px`;
      overlay.style.width = `${containerRect.width}px`;
      overlay.style.height = `${containerRect.height}px`;
    }
  }, [hovered]);

  return (
    <>
      <div ref={containerRef} {...bind()}>
        {children}
      </div>
      {ReactDOM.createPortal(
        <div
          ref={overlayRef}
          onClick={() => {
            alert("clicked");
          }}
          className={cn(
            "pointer-events-none select-none z-10 border-blue-500",
            hovered && "border-2",
            selected && "border-2"
          )}
        />,
        document.body // or a different mount point if you have one
      )}
    </>
  );
}
