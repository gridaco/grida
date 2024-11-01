"use client";

import React, { useCallback } from "react";
import { TemplateComponents } from "@/builder/template-builder";
import type { TemplateComponent } from "./with-template";
import { grida } from "@/grida";
import { TemplateBuilderWidgets } from "./widgets";
import { useComputedNode, useDocument, useNode } from "../provider";

interface NodeElementProps<P extends Record<string, any>> {
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

export function NodeElement<P extends Record<string, any>>({
  node_id,
  component,
  children,
  style,
}: React.PropsWithChildren<NodeElementProps<P>>) {
  const { document, selected_node_id } = useDocument();

  const node = useNode(node_id);
  const computed = useComputedNode(node_id);
  const selected = node_id === selected_node_id;
  const hovered = node_id === document.hovered_node_id;

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

  if (!node.active) return <></>;
  return (
    <HrefWrapper href={computed.href} target={node.target}>
      {React.createElement<any>(
        renderer,
        {
          id: node_id,
          ...masterprops,
          ...({
            ["data-grida-node-id"]: node_id,
            ["data-grida-node-type"]: node.type,
            ["data-dev-editor-selected"]: selected,
            ["data-dev-editor-hovered"]: hovered,
          } satisfies grida.program.document.INodeHtmlDocumentQueryDataAttributes),
          style: {
            ...masterprops.style,
            userSelect: document.editable ? "none" : undefined,
          } satisfies React.CSSProperties,
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
    document: { editable },
  } = useDocument();

  // only render a tag on viewer mode
  if (!editable && href) {
    return (
      <a href={href} target={target}>
        {children}
      </a>
    );
  }
  return <>{children}</>;
}
