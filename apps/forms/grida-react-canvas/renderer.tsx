"use client";

import React, {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { useDocument, useTransform } from "./provider";
import { NodeElement } from "./nodes/node";
import { domapi } from "./domapi";
import { cmath } from "@grida/cmath";
import { css } from "@/grida/css";
import { TransparencyGrid } from "@grida/transparency-grid";
import { useMeasure } from "@uidotdev/usehooks";
// import { DebugPointer } from "./viewport/ui/debug";

const UserDocumentCustomRendererContext = React.createContext<
  Record<string, CustomReactRenderer>
>({});

export function useUserDocumentCustomRenderer() {
  return useContext(UserDocumentCustomRendererContext);
}

type CustomReactRenderer = React.ComponentType<any>;

interface DocumentContentViewProps {
  /**
   * custom templates to render
   */
  templates?: Record<string, CustomReactRenderer>;
}

export function StandaloneDocumentContent({
  templates,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & DocumentContentViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const {
    state: { document, pointer },
  } = useDocument();
  const { root_id } = document;

  return (
    <div id={domapi.k.EDITOR_CONTENT_ELEMENT_ID} ref={ref} {...props}>
      {/* <DebugPointer position={pointer.position} /> */}
      <UserDocumentCustomRendererContext.Provider value={templates ?? {}}>
        <NodeElement node_id={root_id} />
      </UserDocumentCustomRendererContext.Provider>
    </div>
  );
}

export function StandaloneDocumentBackground({
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { background, transform } = useDocument();

  const backgroundColor = useMemo(() => {
    if (!background) return undefined;
    return "#" + css.rgbaToHex(background);
  }, [background]);

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
          style={{ backgroundColor: backgroundColor }}
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
  const {
    state: {
      document: { root_id },
      document_key,
    },
  } = useDocument();
  const { transform, style, setTransform } = useTransform();

  const applied_initial_transform_key = useRef<string | undefined>("__noop__");
  useLayoutEffect(() => {
    if (applied_initial_transform_key.current === document_key) return;

    const retransform = () => {
      const cdom = new domapi.CanvasDOM(transform);
      const rect = cdom.getNodeBoundingRect(root_id);
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
    applied_initial_transform_key.current = document_key;
  }, [document_key, root_id]);

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
