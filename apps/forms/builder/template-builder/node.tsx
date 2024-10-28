"use client";

import React, { useCallback } from "react";
import { useGesture } from "@use-gesture/react";
import { TemplateComponents } from "@/builder/template-builder";
import type {
  TemplateValueProperties,
  TemplateComponent,
} from "./with-template";
import type { Tokens } from "@/ast";
import { useComputed } from "./use-computed";
import { useValue } from "../../grida/react-runtime/data-context";
import { grida } from "@/grida";
import { TemplateBuilderWidgets } from "./widgets";
import { useDocument } from "../provider";

interface SlotProps<P extends Record<string, any>> {
  node_id: string;
  name: string;
  component:
    | TemplateComponent
    | typeof TemplateBuilderWidgets.Text
    | typeof TemplateBuilderWidgets.Image
    | typeof TemplateBuilderWidgets.Container;

  className?: string;
  text?: Tokens.StringValueExpression;
  defaultProperties?: TemplateValueProperties<
    Omit<P, "id" | "name" | "hidden" | "locked">,
    Tokens.StringValueExpression
  >;
  defaultStyle?: React.CSSProperties;
}

export function NodeSlot<P extends Record<string, any>>({
  node_id,
  component,
  text: defaultText,
  defaultProperties,
  defaultStyle,
  className,
  children,
}: React.PropsWithChildren<SlotProps<P>>) {
  const {
    document: { template },
    selectNode,
    pointerEnterNode,
    pointerLeaveNode,
  } = useDocument();

  const { id, hidden, name, style, component_id, props, text, src } = (template
    .overrides[node_id] || {}) as grida.program.nodes.AnyNode;

  const renderer = component_id
    ? TemplateComponents.components[component_id]
    : component;

  const context = useValue();
  const computedProperties = useComputed({
    ...defaultProperties,
    ...props,
  }) as P;

  const computedText = useComputed({ text: text ?? defaultText });

  const masterprops = {
    text: computedText.text,
    props: computedProperties,
    src,
    style: {
      ...defaultStyle,
      ...style,
    },
    // @ts-ignore
  } satisfies
    | grida.program.template.IBuiltinTemplateNodeReactComponentRenderProps<P>
    | grida.program.nodes.AnyNode;

  const onSelect = useCallback(() => {
    selectNode(node_id, {
      type: component.type,
      // TODO:
      properties: "properties" in component ? component.properties : undefined,
      default: defaultProperties,
      default_style: defaultStyle,
      default_text: defaultText,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectNode]);

  // const child = React.Children.only(children);
  // const childProps = (child as React.ReactElement).props;
  // console.log("meta in Node", childProps['data-grida-widget-type'], childProps, children);

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
      <div {...bind()} style={{ display: hidden ? "none" : undefined }}>
        {React.createElement<any>(
          renderer,
          {
            id: node_id,
            ...masterprops,
            className,
          },
          children
        )}
      </div>
    </>
  );
}
