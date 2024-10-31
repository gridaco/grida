"use client";

import React, { useCallback } from "react";
import { useGesture } from "@use-gesture/react";
import { TemplateComponents } from "@/builder/template-builder";
import type { TemplateComponent } from "./with-template";
import { grida } from "@/grida";
import { TemplateBuilderWidgets } from "./widgets";
import { useComputedNode, useDocument, useNode } from "../provider";

interface SlotProps<P extends Record<string, any>> {
  node_id: string;
  component:
    | TemplateComponent
    | typeof TemplateBuilderWidgets.Text
    | typeof TemplateBuilderWidgets.Image
    | typeof TemplateBuilderWidgets.Container;

  // className?: string;
  style?: React.CSSProperties;
  // defaultStyle?: React.CSSProperties;
}

export function NodeSlot<P extends Record<string, any>>({
  node_id,
  component,
  children,
  style,
}: React.PropsWithChildren<SlotProps<P>>) {
  const {
    document: { template },
    selectNode,
    pointerEnterNode,
    pointerLeaveNode,
  } = useDocument();

  const node = useNode(node_id);
  const computed = useComputedNode(node_id);

  const { component_id } = node;
  const renderer = component_id
    ? TemplateComponents.components[component_id]
    : component;

  const masterprops = {
    text: computed.text,
    props: computed.props,
    src: computed.src,
    style: {
      ...style,
      ...node.style,
    },
    // @ts-ignore
  } satisfies
    | grida.program.document.template.IBuiltinTemplateNodeReactComponentRenderProps<P>
    | grida.program.nodes.AnyNode;

  const onSelect = useCallback(() => {
    selectNode(node_id);
  }, [node_id, selectNode]);

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
    <HrefWrapper href={computed.href} target={node.target}>
      {React.createElement<any>(
        renderer,
        {
          id: node_id,
          ...masterprops,
          ...bind(),
          style: {
            ...masterprops.style,
            display: node.active ? masterprops.style.display : "none",
          },
        },
        children
      )}
    </HrefWrapper>
  );
}

function HrefWrapper({
  href,
  target,
  children,
}: React.PropsWithChildren<{
  href?: string;
  target?: string;
}>) {
  const {
    document: { readonly },
  } = useDocument();

  // only render a tag on viewer mode
  if (readonly && href) {
    return (
      <a href={href} target={target}>
        {children}
      </a>
    );
  }
  return <>{children}</>;
}
