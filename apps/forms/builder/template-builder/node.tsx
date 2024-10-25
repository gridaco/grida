"use client";

import React, { useCallback, useRef } from "react";
import { cn } from "@/utils";
import { useGesture } from "@use-gesture/react";
import { TemplateComponents } from "@/builder/template-builder";
import type {
  TemplateValueProperties,
  TemplateComponent,
} from "./with-template";
import type { Tokens } from "@/ast";
import { useComputed } from "./use-computed";
import { useValue } from "../core/data-context";
import { useCurrentDocument } from "@/scaffolds/editor/use-document";

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
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    document: { template },
    selectNode,
    pointerEnterNode,
    pointerLeaveNode,
  } = useCurrentDocument();

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
    selectNode(node_id, {
      selected_node_type: component.type,
      // @ts-ignore TODO:
      selected_node_schema: componentschema,
      selected_node_context: context,
      selected_node_default_properties: defaultProperties,
      selected_node_default_style: defaultStyle,
      selected_node_default_text: defaultText,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectNode]);

  // const child = React.Children.only(children);
  // const childProps = (child as React.ReactElement).props;
  // console.log("meta in Node", childProps.__type, childProps, children);

  // console.log(component.schema);

  const bind = useGesture(
    {
      onPointerEnter: ({ event }) => {
        pointerEnterNode(node_id);
      },
      onPointerLeave: ({ event }) => {
        pointerLeaveNode(node_id);
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

  return (
    <>
      <div id={node_id} ref={containerRef} {...bind()}>
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
    </>
  );
}
