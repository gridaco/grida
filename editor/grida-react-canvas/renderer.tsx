"use client";

import React, { useContext, useLayoutEffect, useMemo, useRef } from "react";
import { useCurrentScene, useTransform } from "./provider";
import { NodeElement } from "./nodes/node";
import { domapi } from "../grida-canvas/backends/dom";
import { cmath } from "@grida/cmath";
import { TransparencyGrid } from "@grida/transparency-grid/react";
import { useMeasure } from "@uidotdev/usehooks";

type CustomComponent = React.ComponentType<any>;

const UserCustomTemplatesContext = React.createContext<
  Record<string, CustomComponent>
>({});

export function useUserCustomTemplates() {
  return useContext(UserCustomTemplatesContext);
}

export function UserCustomTemplatesProvider({
  children,
  templates,
}: React.PropsWithChildren<UserCustomTemplatesProps>) {
  return (
    <UserCustomTemplatesContext.Provider value={templates ?? {}}>
      {children}
    </UserCustomTemplatesContext.Provider>
  );
}

export interface UserCustomTemplatesProps {
  templates?: Record<string, CustomComponent>;
}

export interface StandaloneDocumentContentProps {
  /**
   * when primary, it sets the id of the view - this is essential for the editor to work
   * multiple primary contents will cause an error
   *
   * @deprecated FIXME: this needs to be removed and handled differently - do not rely on id.
   *
   * @default true
   */
  primary?: boolean;
}

export function StandaloneSceneContent({
  primary = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & StandaloneDocumentContentProps) {
  const { children } = useCurrentScene();

  return (
    <div
      id={primary ? domapi.k.EDITOR_CONTENT_ELEMENT_ID : undefined}
      {...props}
    >
      {children?.map((id) => <NodeElement key={id} node_id={id} />)}
    </div>
  );
}

export function StandaloneRootNodeContent({
  primary = false,
  node_id,
  ...props
}: React.HTMLAttributes<HTMLDivElement> &
  StandaloneDocumentContentProps & {
    node_id: string;
  }) {
  return (
    <div
      id={primary ? domapi.k.EDITOR_CONTENT_ELEMENT_ID : undefined}
      {...props}
    >
      <NodeElement
        node_id={node_id}
        override={{
          style: {
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            right: 0,
            width: "100%",
            height: "100%",
            overflow: "auto",
          },
        }}
      />
    </div>
  );
}

export function StandaloneSceneBackground({
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { backgroundColor, transform } = useCurrentScene();

  const [cssBackgroundColor, opacity] = useMemo(() => {
    if (!backgroundColor) return [undefined, 1] as const;
    const hex = cmath.color.rgba8888_to_hex(backgroundColor);
    const opacity = backgroundColor.a;
    return [hex, opacity] as const;
  }, [backgroundColor]);

  const [visiblearea, { width, height }] = useMeasure();

  return (
    <div {...props}>
      <div
        ref={visiblearea}
        className="absolute inset-0 pointer-events-none overflow-hidden -z-10"
      >
        {/* root bg - transparency grid */}
        <TransparencyGrid
          transform={transform}
          width={width ?? 0}
          height={height ?? 0}
        />
        {/* background color */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ backgroundColor: cssBackgroundColor }}
        />
      </div>
      {children}
    </div>
  );
}

export function Transformer({ children }: React.PropsWithChildren<{}>) {
  const { style } = useTransform();

  return (
    <div
      style={{
        ...style,
        position: "absolute",
      }}
    >
      {children}
    </div>
  );
}

export function AutoInitialFitTransformer({
  children,
}: React.PropsWithChildren<{}>) {
  const scene = useCurrentScene();
  const { transform, style, setTransform } = useTransform();

  const applied_initial_transform_key = useRef<string | undefined>("__noop__");
  useLayoutEffect(() => {
    if (applied_initial_transform_key.current === scene.id) return;

    const retransform = () => {
      if (scene.children.length === 0) return;
      const cdom = new domapi.CanvasDOM(transform);
      const root_rects = scene.children
        .map((id) => cdom.getNodeBoundingRect(id))
        .filter(Boolean) as cmath.Rectangle[];

      const rect: cmath.Rectangle =
        root_rects.length > 0
          ? cmath.rect.union(root_rects)
          : { x: 0, y: 0, width: 0, height: 0 };

      const _vrect = domapi.get_viewport_rect();
      const vrect = {
        x: 0,
        y: 0,
        width: _vrect.width,
        height: _vrect.height,
      };
      const t = cmath.ext.viewport.transformToFit(vrect, rect!, 64);
      setTransform(t);
    };

    retransform();
    applied_initial_transform_key.current = scene.id;
  }, [scene.id, scene.children]);

  return (
    <div
      style={{
        ...style,
        position: "absolute",
      }}
    >
      {children}
    </div>
  );
}
