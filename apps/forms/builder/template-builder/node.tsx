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

  const portal = useMemo(() => {
    return document.getElementById("canvas-overlay-portal")!;
  }, []);

  const {
    document: { selected_node_id },
  } = state;

  const selected = !!selected_node_id && selected_node_id === node_id;

  const { template_id, properties, style, attributes, text } =
    state.document.templatedata[node_id] || {};

  const renderer = template_id
    ? TemplateComponents.components[template_id]
    : component;

  const componentschema = component.schema;

  const computedProperties = useComputed(defaultProperties);
  const computedText = useComputed({ text: defaultText });

  const props = {
    text: computedText.text || defaultText,
    properties: {
      ...computedProperties,
      ...properties,
    },
    style: {
      ...defaultStyle,
      ...style,
    },
  };

  const onSelect = useCallback(() => {
    dispatch({
      type: "editor/document/node/select",
      node_id: node_id,
      node_type: component.type,
      // @ts-ignore TODO:
      schema: componentschema,
      default_properties: defaultProperties,
      default_style: defaultStyle,
      default_text: defaultText,
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
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
