import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { EditorAppbarFragments } from "components/editor";
import { Canvas } from "@code-editor/canvas";
import { useEditorState, useWorkspace } from "core/states";
import { Preview } from "scaffolds/preview";
import { useDispatch } from "core/dispatch";
import { FrameTitleRenderer } from "./render/frame-title";
import { IsolateModeCanvas } from "./isolate-mode";

/**
 * Statefull canvas segment that contains canvas as a child, with state-data connected.
 */
export function VisualContentArea({ fileid }: { fileid: string }) {
  const [state] = useEditorState();
  const { highlightedLayer, highlightLayer } = useWorkspace();
  const dispatch = useDispatch();

  const { selectedPage, design, selectedNodes } = state;

  const thisPageNodes = selectedPage
    ? state.design.pages
        .find((p) => p.id == selectedPage)
        .children.filter(Boolean)
    : [];

  const isEmptyPage = thisPageNodes?.length === 0;

  const [mode, setMode] = useState<"full" | "isolate">("full");

  return (
    <CanvasContainer id="canvas">
      {/* <EditorAppbarFragments.Canvas /> */}

      {isEmptyPage ? (
        <></>
      ) : (
        <>
          {mode == "isolate" && (
            <IsolateModeCanvas
              onClose={() => {
                setMode("full");
              }}
            />
          )}
          <div
            style={{
              display: mode == "full" ? undefined : "none",
            }}
          >
            <Canvas
              key={selectedPage}
              selectedNodes={selectedNodes.filter(Boolean)}
              highlightedLayer={highlightedLayer}
              onSelectNode={(node) => {
                dispatch({ type: "select-node", node: node?.id });
              }}
              onClearSelection={() => {
                dispatch({ type: "select-node", node: null });
              }}
              nodes={thisPageNodes}
              renderItem={(node) => {
                return <Preview key={node.id} target={node} />;
              }}
              renderFrameTitle={(p) => (
                <FrameTitleRenderer
                  key={p.id}
                  {...p}
                  onRunClick={() => {
                    setMode("isolate");
                  }}
                />
              )}
            />
          </div>
        </>
      )}
    </CanvasContainer>
  );
}

const CanvasContainer = styled.div`
  display: flex;
  flex-direction: column;
  max-width: calc((100vw - 200px) * 0.6); // TODO: make this dynamic
  height: 100%;
`;
