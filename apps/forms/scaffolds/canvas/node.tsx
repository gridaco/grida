"use client";

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
import type { ZodSchema } from "zod";
import { TemplateComponents } from "@/theme/templates/components";

interface TemplateProps<P> {
  node_id?: string;
  component: React.FC<P>;
  defaultProps: P;
}

export function Editable<P>({
  node_id,
  component,
  defaultProps: props,
}: TemplateProps<P>) {
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
    const schema = TemplateComponents.components[component.type].schema;
    console.log("selected", node_id, component.type, schema);
    dispatch({
      type: "editor/document/select-node",
      node_id: node_id,
      schema: component.schema,
    });

    // Access __type from children props
    // const child = React.Children.only(children);
    // const childProps = (child as React.ReactElement).props;
    // console.log("meta in Node", childProps.__type, childProps, children);
  }, [dispatch, node_id]);

  // const child = React.Children.only(children);
  // const childProps = (child as React.ReactElement).props;
  // console.log("meta in Node", childProps.__type, childProps, children);

  // console.log(component.schema);

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
    if ((hovered || selected) && containerRef.current && overlayRef.current) {
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
  }, [hovered, portal, selected]);

  const Component = component as React.FC<P>;

  return (
    <>
      <div ref={containerRef} {...bind()}>
        {React.createElement(component, props)}
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
