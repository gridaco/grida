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
    | grida.program.template.IBuiltinTemplateNodeReactComponentRenderProps<P>
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
    <>
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
    </>
  );
}
