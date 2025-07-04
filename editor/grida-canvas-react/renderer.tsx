"use client";

import React, { useContext, useEffect, useMemo } from "react";
import { useCurrentSceneState, useTransformState } from "./provider";
import { useCurrentEditor, useEditorState } from "./use-editor";
import { NodeElement } from "./nodes/node";
import { domapi } from "../grida-canvas/backends/dom";
import { TransparencyGrid } from "@grida/transparency-grid/react";
import { useMeasure } from "@uidotdev/usehooks";
import { SizeProvider } from "./viewport/size";
import cmath from "@grida/cmath";
import Canvas from "@/grida-canvas-wasm-react";
import type { Editor } from "@/grida-canvas/editor";

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
  const { children } = useCurrentSceneState();

  return (
    <div
      id={primary ? domapi.k.EDITOR_CONTENT_ELEMENT_ID : undefined}
      {...props}
    >
      {children?.map((id) => <NodeElement key={id} node_id={id} />)}
    </div>
  );
}

export function __WIP_UNSTABLE_WasmContent({ editor }: { editor: Editor }) {
  const document = useEditorState(editor, (state) => state.document);
  const transform = useEditorState(editor, (state) => state.transform);

  return (
    <SizeProvider className="w-full h-full">
      <Canvas
        width={100}
        height={100}
        transform={transform}
        data={document}
        onMount={editor.setSurface.bind(editor)}
      />
    </SizeProvider>
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
  const instance = useCurrentEditor();
  const slice = useEditorState(instance, (state) => ({
    backgroundColor: state.document.scenes[state.scene_id!].backgroundColor,
    transform: state.transform,
  }));
  const { backgroundColor, transform } = slice;

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
  const { style } = useTransformState();

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

function useFitInitiallyEffect() {
  const editor = useCurrentEditor();
  const documentKey = useEditorState(editor, (state) => state.document_key);
  const sceneId = useEditorState(editor, (state) => state.scene_id);

  useEffect(() => {
    editor.fit("*");
  }, [documentKey, sceneId]);
}

export function AutoInitialFitTransformer({
  children,
}: React.PropsWithChildren<{}>) {
  const { style } = useTransformState();

  useFitInitiallyEffect();

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
