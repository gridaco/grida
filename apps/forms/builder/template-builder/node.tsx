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
import { TemplateComponents } from "@/builder/template-builder";
import type {
  TemplateValueProperties,
  TemplateComponent,
} from "./with-template";
import type { Tokens } from "@/ast";
import { useComputed } from "./use-computed";
import { useValue } from "../core/data-context";
import { useCurrentDocument } from "@/scaffolds/editor/use-document";
import { useCanvasOverlayPortal } from "@/scaffolds/canvas/canvas";

interface SlotProps<P extends Record<string, any>> {
  node_id: string;
  // templatePath
  component: TemplateComponent<P>;
  className?: string;
  defaultText?: Tokens.StringValueExpression;
  defaultProperties?: TemplateValueProperties<P, Tokens.StringValueExpression>;
  defaultStyle?: React.CSSProperties;
}

export function SlotNode<P extends Record<string, any>>({
  node_id,
  component,
  defaultText,
  defaultProperties,
  defaultStyle,
  className,
  children,
}: React.PropsWithChildren<SlotProps<P>>) {
  const [state, dispatch] = useEditorState();
  const [hovered, setHovered] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const portal = useCanvasOverlayPortal();

  const {
    document: { selected_node_id, template },
    selectNode,
  } = useCurrentDocument();

  const selected = !!selected_node_id && selected_node_id === node_id;

  // @ts-ignore TODO:
  const { component_id, properties, style, attributes, text } =
    template.overrides[node_id] || {};

  const renderer = component_id
    ? TemplateComponents.components[component_id]
    : component;

  const componentschema = component.schema;

  const context = useValue();
  const computedProperties = useComputed({
    ...defaultProperties,
    ...properties,
  });
  const computedText = useComputed({ text: text ?? defaultText });

  const props = {
    text: computedText.text,
    properties: computedProperties,
    style: {
      ...defaultStyle,
      ...style,
    },
  };

  const onSelect = useCallback(() => {
    selectNode(node_id);
  }, [selectNode, node_id]);

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
      onPointerDown: ({ event }) => {
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
    if (!portal) return;
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

  return (
    <>
      <div ref={containerRef} {...bind()}>
        <div
          {...(attributes || {})}
          style={{
            opacity: props.style?.opacity,
          }}
          className={cn(className)}
        >
          {/*  */}
          {React.createElement(renderer, props, children)}
        </div>
      </div>
      {(hovered || selected) && portal && (
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
