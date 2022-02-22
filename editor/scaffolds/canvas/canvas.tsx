import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { EditorAppbarFragments } from "components/editor";
import { Canvas } from "@code-editor/canvas";
import { useEditorState, useWorkspace } from "core/states";
import { Preview } from "scaffolds/preview";
import useMeasure from "react-use-measure";
import { useDispatch } from "core/dispatch";
import { FrameTitleRenderer } from "./render/frame-title";
import { IsolateModeCanvas } from "./isolate-mode";

/**
 * Statefull canvas segment that contains canvas as a child, with state-data connected.
 */
export function VisualContentArea() {
  const [state] = useEditorState();
  const [canvasSizingRef, canvasBounds] = useMeasure();

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
    <CanvasContainer
      ref={canvasSizingRef}
      id="canvas"
      maxWidth={mode == "isolate" ? "calc((100vw - 200px) * 0.6)" : "100%"} // TODO: make this dynamic
    >
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
              viewbound={[
                canvasBounds.left,
                canvasBounds.top,
                canvasBounds.bottom,
                canvasBounds.right,
              ]}
              filekey={state.design.key}
              pageid={selectedPage}
              selectedNodes={selectedNodes.filter(Boolean)}
              highlightedLayer={highlightedLayer}
              onSelectNode={(node) => {
                dispatch({ type: "select-node", node: node?.id });
              }}
              onClearSelection={() => {
                dispatch({ type: "select-node", node: null });
              }}
              nodes={thisPageNodes}
              renderItem={(p) => {
                return <Preview key={p.node.id} target={p.node} {...p} />;
              }}
              config={{
                can_highlight_selected_layer: true,
                marquee: {
                  disabled: true,
                },
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

const CanvasContainer = styled.div<{
  maxWidth?: string;
}>`
  display: flex;
  flex-direction: column;
  max-width: ${(p) => p.maxWidth};
  height: 100%;
`;
