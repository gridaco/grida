import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { PreviewAndRunPanel } from "components/preview-and-run";
import { EditorAppbarFragments, EditorSidebar } from "components/editor";
import { Canvas } from "@code-editor/canvas";
import { useEditorState, useWorkspace } from "core/states";
import { Preview } from "scaffolds/preview";
import { useDispatch } from "core/dispatch";
/**
 * Statefull canvas segment that contains canvas as a child, with state-data connected.
 */
export function CanvasSegment({ fileid }: { fileid: string }) {
  const [state] = useEditorState();
  const { highlightedLayer, highlightLayer } = useWorkspace();
  const dispatch = useDispatch();

  const { selectedPage, design, selectedNodes } = state;

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
          selectedNodes={selectedNodes.filter(Boolean)}
          highlightedLayer={highlightedLayer}
          onSelectNode={(node) => {
            dispatch({ type: "select-node", node: node.id });
          }}
          onClearSelection={() => {
            dispatch({ type: "select-node", node: null });
          }}
          nodes={thisPageNodes}
          renderItem={(node) => {
            return <Preview root={design?.input} target={node} />;
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
