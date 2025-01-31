"use client";

import React, { ReactNode, useMemo } from "react";
import type { TemplateComponent } from "../template-builder/with-template";
import { grida } from "@/grida";
import { ReactNodeRenderers } from ".";
import { useComputedNode, useDocument, useNode } from "../provider";
import assert from "assert";
import { useUserDocumentCustomRenderer } from "../renderer";
import { css } from "@/grida/css";

class RendererNotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RendererNotFound";
  }
}

interface NodeElementProps<P extends Record<string, any>> {
  node_id: string;
  component?: TemplateComponent;
  style?: grida.program.css.ExplicitlySupportedCSSProperties;
  zIndex?: number;
  position?: "absolute" | "relative";
  left?: number;
  top?: number;
  width?: grida.program.nodes.i.ICSSDimension["width"];
  height?: grida.program.nodes.i.ICSSDimension["height"];
  fill?: grida.program.cg.Paint;
}

export function NodeElement<P extends Record<string, any>>({
  node_id,
  component: USER_COMPONENT,
  children: USER_CHILDREN,
  zIndex: DEFAULT_ZINDEX,
  position: DEFAULT_POSITION,
  left: DEFAULT_LEFT,
  top: DEFAULT_TOP,
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
  fill: DEFAULT_FILL,
  style,
}: React.PropsWithChildren<NodeElementProps<P>>) {
  const user_registered_renderers = useUserDocumentCustomRenderer();
  const { state: document, selection } = useDocument();

  const node = useNode(node_id);
  const computed = useComputedNode(node_id);
  const selected = selection.includes(node_id);
  const hovered = node_id === document.hovered_node_id;

  const { component_id, template_id, children } = node;

  const renderer = useMemo(() => {
    switch (node.type) {
      case "instance": {
        throw new Error("instance node is not supported");
        // const r = component_id
        //   ? TemplateComponents.components[component_id]
        //   : USER_COMPONENT;
      }
      case "template_instance": {
        const r = USER_COMPONENT ?? user_registered_renderers[template_id!];
        if (!r) {
          throw new RendererNotFound(
            `renderer not found for template_instance '${template_id}'`
          );
        }
        return r;
      }
      case "container":
      case "image":
      case "video":
      case "text":
      case "bitmap":
      case "vector":
      case "path":
      case "line":
      case "rectangle":
      case "component":
      case "ellipse":
      case "iframe":
      case "richtext": {
        return ReactNodeRenderers[node.type];
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
    html: computed.html,
    loop: node.loop,
    muted: node.muted,
    autoplay: node.autoplay,
    paths: node.paths,
    vectorNetwork: node.vectorNetwork,
    opacity: node.opacity,
    zIndex: DEFAULT_ZINDEX ?? node.zIndex,
    position: DEFAULT_POSITION ?? node.position,
    left: DEFAULT_LEFT ?? node.left,
    top: DEFAULT_TOP ?? node.top,
    width: DEFAULT_WIDTH ?? node.width,
    height: DEFAULT_HEIGHT ?? node.height,
    fill: DEFAULT_FILL ?? node.fill,
    fillRule: node.fillRule,
    stroke: node.stroke,
    strokeWidth: node.strokeWidth,
    strokeCap: node.strokeCap,
    cursor: node.cursor,
    data: node.data,
    style: {
      ...style,
      ...node.style,
    },
    // IPositionable (does not instrictly mean left and top)
    // x: node.x,
    // y: node.y,
    // IDemension (does not instrictly mean width and height)
    // width: node.width,
    // height: node.height,
    cornerRadius: node.cornerRadius,
    // @ts-ignore
  } satisfies
    | grida.program.document.template.IUserDefinedTemplateNodeReactComponentRenderProps<P>
    | grida.program.nodes.AnyNode;

  if (!node.active) return <></>;

  const { opacity, zIndex, ...props } = renderprops;

  return (
    <HrefWrapper href={computed.href} target={node.target}>
      {React.createElement<any>(
        renderer,
        {
          ...props,
          ...({
            id: node_id,
            ["data-grida-node-id"]: node_id,
            ["data-grida-node-locked"]: node.locked,
            ["data-grida-node-type"]: node.type,
            ["data-dev-editor-selected"]: selected,
            ["data-dev-editor-hovered"]: hovered,
          } satisfies grida.program.document.INodeHtmlDocumentQueryDataAttributes),
          style: {
            ...css.toReactCSSProperties(node, {
              fill: fillings[node.type],
              hasTextStyle: node.type === "text",
            }),
            // hard override user-select
            userSelect: document.editable ? "none" : undefined,
            // hide this node when in surface edit mode
            visibility:
              document.content_edit_mode?.type === "text" &&
              document.content_edit_mode.node_id === node_id
                ? "hidden"
                : undefined,
          } satisfies React.CSSProperties,
        } satisfies grida.program.document.IComputedNodeReactRenderProps<any>,
        computedchildren
      )}
    </HrefWrapper>
  );
}

const fillings = {
  text: "color",
  container: "background",
  component: "background",
  iframe: "background",
  richtext: "color",
  image: "background",
  video: "background",
  rectangle: "none",
  ellipse: "none",
  template_instance: "none",
  instance: "none",
  vector: "none",
  line: "none",
  path: "none",
  polyline: "none",
  bitmap: "background",
} as const;

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
