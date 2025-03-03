"use client";

import React, { useContext, useLayoutEffect, useMemo, useRef } from "react";
import { useCurrentScene, useTransform } from "./provider";
import { NodeElement } from "./nodes/node";
import { domapi } from "./domapi";
import { cmath } from "@grida/cmath";
import { css } from "@/grida/css";
import { TransparencyGrid } from "@grida/transparency-grid";
import { useMeasure } from "@uidotdev/usehooks";

const UserDocumentCustomRendererContext = React.createContext<
  Record<string, CustomReactRenderer>
>({});

export function useUserDocumentCustomRenderer() {
  return useContext(UserDocumentCustomRendererContext);
}

type CustomReactRenderer = React.ComponentType<any>;

export interface StandaloneDocumentContentProps {
  /**
   * custom templates to render
   */
  templates?: Record<string, CustomReactRenderer>;
}

export function StandaloneSceneContent({
  templates,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & StandaloneDocumentContentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { children } = useCurrentScene();

  return (
    <div id={domapi.k.EDITOR_CONTENT_ELEMENT_ID} ref={ref} {...props}>
      {/* <DebugPointer position={pointer.position} /> */}
      <UserDocumentCustomRendererContext.Provider value={templates ?? {}}>
        {children.map((id) => (
          <NodeElement key={id} node_id={id} />
        ))}
      </UserDocumentCustomRendererContext.Provider>
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
    const hex = "#" + css.rgbaToHex(backgroundColor);
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
        {opacity < 1 && (
          <TransparencyGrid
            transform={transform}
            width={width ?? 0}
            height={height ?? 0}
          />
        )}
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
