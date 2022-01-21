import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { PreviewAndRunPanel } from "components/preview-and-run";
import { EditorAppbarFragments, EditorSidebar } from "components/editor";
import { Canvas } from "@code-editor/canvas";
import { LazyFrame } from "@code-editor/canvas/lazy-frame";
import { useEditorState } from "core/states";
import { Preview } from "scaffolds/preview";
/**
 * Statefull canvas segment that contains canvas as a child, with state-data connected.
 */
export function CanvasSegment({ fileid }: { fileid: string }) {
  const [state] = useEditorState();

  const { selectedPage, design } = state;

  const thisPageNodes = selectedPage
    ? state.design.pages
        .find((p) => p.id == selectedPage)
        .children.filter(Boolean)
    : null;

  const isEmptyPage = thisPageNodes?.length === 0;

  return (
    <CanvasContainer id="canvas">
      {/* <EditorAppbarFragments.Canvas /> */}
      {isEmptyPage ? (
        <EditorCanvasSkeleton />
      ) : (
        <Canvas
          nodes={thisPageNodes}
          renderItem={(node) => {
            return (
              <LazyFrame
                xy={[node.x, node.y]}
                size={node}
                placeholder={<EmptyFrame />}
              >
                <Preview root={design?.input} target={node} />
              </LazyFrame>
            );
          }}
        />
      )}
    </CanvasContainer>
  );
}

const EditorCanvasSkeleton = () => {
  return (
    <PreviewAndRunPanel
      config={{
        src: "",
        platform: "vanilla",
        componentName: "loading",
        sceneSize: {
          w: 375,
          h: 812,
        },
        initialMode: "run",
        fileid: "loading",
        sceneid: "loading",
        hideModeChangeControls: true,
      }}
    />
  );
};

const CanvasContainer = styled.div`
  display: flex;
  flex-direction: column;
  max-width: calc((100vw - 200px) * 0.6); // TODO: make this dynamic
  height: 100%;
`;

const EmptyFrame = styled.div`
  width: 100%;
  height: 100%;
  background-color: #f0f0f0;
  border-radius: 4px;
  box-shadow: 0px 0px 48px #00000020;
`;
