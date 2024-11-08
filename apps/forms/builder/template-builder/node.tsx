"use client";

import React, { ReactNode, useMemo } from "react";
import { TemplateComponents } from "@/builder/template-builder";
import type { TemplateComponent } from "./with-template";
import { grida } from "@/grida";
import { TemplateBuilderWidgets } from "./widgets";
import { useComputedNode, useDocument, useNode } from "../provider";
import assert from "assert";

interface NodeElementProps<P extends Record<string, any>> {
  node_id: string;
  component?: TemplateComponent;
  style?: grida.program.css.ExplicitlySupportedCSSProperties;
  zIndex?: number;
  position?: "absolute" | "relative";
  left?: number;
  top?: number;
}

export function NodeElement<P extends Record<string, any>>({
  node_id,
  component: USER_COMPONENT,
  children: USER_CHILDREN,
  zIndex: DEFAULT_ZINDEX,
  position: DEFAULT_POSITION,
  left: DEFAULT_LEFT,
  top: DEFAULT_TOP,
  style,
}: React.PropsWithChildren<NodeElementProps<P>>) {
  const { state: document, selected_node_id } = useDocument();

  const node = useNode(node_id);
  const computed = useComputedNode(node_id);
  const selected = node_id === selected_node_id;
  const hovered = node_id === document.hovered_node_id;

  const { component_id, children } = node;

  const renderer = useMemo(() => {
    switch (node.type) {
      case "instance": {
        return component_id
          ? TemplateComponents.components[component_id]
          : USER_COMPONENT;
      }
      case "template_instance": {
        return USER_COMPONENT;
      }
      case "container":
      case "image":
      case "text":
      case "svg":
      case "rectangle":
      case "ellipse": {
        return TemplateBuilderWidgets[node.type];
      }
      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }

    //
  }, [USER_COMPONENT, component_id, node.type]);

  assert(
    !(children && USER_CHILDREN),
    "NodeElement: children should not be provided when node has children"
  );

  const computedchildren: ReactNode | undefined = useMemo(() => {
    return (
      USER_CHILDREN ||
      children?.map((child_id) => {
        return <NodeElement key={child_id} node_id={child_id} />;
      }) ||
      undefined
    );
  }, [USER_CHILDREN, children]);

  const renderprops = {
    text: computed.text,
    props: computed.props,
    src: computed.src,
    svg: node.svg,
    opacity: node.opacity,
    zIndex: DEFAULT_ZINDEX ?? node.zIndex,
    position: DEFAULT_POSITION ?? node.position,
    left: DEFAULT_LEFT ?? node.left,
    top: DEFAULT_TOP ?? node.top,

    style: {
      ...style,
      ...node.style,
    },
    // IPositionable (does not instrictly mean left and top)
    // x: node.x,
    // y: node.y,
    // IDemension (does not instrictly mean width and height)
    width: node.width,
    height: node.height,
    fill: node.fill,
    cornerRadius: node.cornerRadius,
    // @ts-ignore
  } satisfies
    | grida.program.document.template.IUserDefinedTemplateNodeReactComponentRenderProps<P>
    | grida.program.nodes.AnyNode;

  if (!node.active) return <></>;

  const { opacity, zIndex, style: styles, ...props } = renderprops;

  return (
    <HrefWrapper href={computed.href} target={node.target}>
      {React.createElement<any>(
        // TODO: double check
        // @ts-expect-error
        renderer,
        {
          id: node_id,
          ...props,
          ...({
            ["data-grida-node-id"]: node_id,
            ["data-grida-node-type"]: node.type,
            ["data-dev-editor-selected"]: selected,
            ["data-dev-editor-hovered"]: hovered,
          } satisfies grida.program.document.INodeHtmlDocumentQueryDataAttributes),
          style: {
            opacity: opacity,
            zIndex: zIndex,
            position: node.position,
            top: node.top,
            left: node.left,
            ...grida.program.css.toReactCSSProperties({
              ...styles,
            }),
            // hard override user-select
            userSelect: document.editable ? "none" : undefined,
          },
        } satisfies grida.program.document.IComputedNodeReactRenderProps<any>,
        computedchildren
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
    state: { editable },
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
