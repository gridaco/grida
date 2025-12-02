"use client";

import React, { useContext, useEffect, useMemo } from "react";
import { useCurrentSceneState, useTransformState } from "./provider";
import { useCurrentEditor, useEditorState } from "./use-editor";
import { NodeElement } from "@/grida-canvas-react-renderer-dom/nodes/node";
import { domapi } from "../grida-canvas/backends/dom";
import { TransparencyGrid } from "@grida/transparency-grid/react";
import { useMeasure } from "@uidotdev/usehooks";
import kolor from "@grida/color";
import grida from "@grida/schema";

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
  const { children_refs: children } = useCurrentSceneState();

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
  const instance = useCurrentEditor();
  const slice = useEditorState(instance, (state) => {
    const scene = state.document.nodes[
      state.scene_id!
    ] as grida.program.nodes.SceneNode;
    return {
      backgroundColor: scene?.background_color,
      transform: state.transform,
    };
  });
  const { backgroundColor, transform } = slice;

  const cssBackgroundColor = useMemo(() => {
    if (!backgroundColor) return undefined;
    return kolor.colorformats.RGBA32F.intoCSSRGBA(backgroundColor);
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
    editor.camera.fit("*");
  }, [documentKey, sceneId]);
}

/**
 * @deprecated
 * TODO: this should work in plugin-wise, without any react dependencies - like how canvas backend does on mount
 */
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
