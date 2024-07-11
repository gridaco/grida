import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

  const portal = useMemo(() => {
    return document.getElementById("canvas-overlay-portal")!;
  }, []);

  const {
    document: { selected_node_id },
  } = state;

  const selected = !!selected_node_id && selected_node_id === node_id;

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
      onClick: ({ event }) => {
        event.stopPropagation();
        onSelect();
      },
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
      const portalRect = portal.getBoundingClientRect();
      const overlay = overlayRef.current;

      // Calculate the position of the target relative to the portal
      const top = containerRect.top - portalRect.top;
      const left = containerRect.left - portalRect.left;
      const width = containerRect.width;
      const height = containerRect.height;

      overlay.style.position = "absolute";
      overlay.style.top = `${top}px`;
      overlay.style.left = `${left}px`;
      overlay.style.width = `${width}px`;
      overlay.style.height = `${height}px`;
    }
  }, [hovered, portal]);

  return (
    <>
      <div ref={containerRef} {...bind()}>
        {children}
      </div>
      {(hovered || selected) && (
        <>
          {ReactDOM.createPortal(
            <div
              data-node-id={node_id}
              data-selected={selected}
              data-hovered={hovered}
              ref={overlayRef}
              className={cn(
                "pointer-events-none select-none z-10 border-2 border-blue-500"
              )}
            />,
            portal
          )}
        </>
      )}
    </>
  );
}
