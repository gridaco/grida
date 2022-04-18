import React, { useCallback } from "react";
import styled from "@emotion/styled";
import { Canvas } from "@code-editor/canvas";
import { useEditorState, useWorkspace } from "core/states";
import {
  D2CVanillaPreview,
  WebWorkerD2CVanillaPreview,
} from "scaffolds/preview";
import useMeasure from "react-use-measure";
import { useDispatch } from "core/dispatch";
import { FrameTitleRenderer } from "./render/frame-title";
import { IsolateModeCanvas } from "./isolate-mode";
import { Dialog } from "@material-ui/core";
import { FullScreenPreview } from "scaffolds/preview-full-screen";

/**
 * Statefull canvas segment that contains canvas as a child, with state-data connected.
 */
export function VisualContentArea() {
  const [state] = useEditorState();
  const [canvasSizingRef, canvasBounds] = useMeasure();

  const { highlightedLayer, highlightLayer } = useWorkspace();
  const dispatch = useDispatch();

  const {
    selectedPage,
    design,
    selectedNodes,
    canvasMode,
    canvasMode_previous,
  } = state;

  const thisPageNodes = selectedPage
    ? design.pages.find((p) => p.id == selectedPage).children.filter(Boolean)
    : [];

  const isEmptyPage = thisPageNodes?.length === 0;

  const startIsolatedViewMode = useCallback(
    () =>
      dispatch({
        type: "canvas-mode-switch",
        mode: "isolated-view",
      }),
    [dispatch]
  );

  const startFullscreenPreviewMode = useCallback(
    () =>
      dispatch({
        type: "canvas-mode-switch",
        mode: "fullscreen-preview",
      }),
    [dispatch]
  );

  const endIsolatedViewMode = useCallback(
    () =>
      dispatch({
        type: "canvas-mode-switch",
        mode: "free",
      }),
    [dispatch]
  );

  const exitFullscreenPreview = useCallback(
    () =>
      dispatch({
        type: "canvas-mode-goback",
        fallback: "isolated-view",
      }),
    [dispatch]
  );

  return (
    <CanvasContainer ref={canvasSizingRef} id="canvas">
      {/* <EditorAppbarFragments.Canvas /> */}

      {isEmptyPage ? (
        <></>
      ) : (
        <>
          <FullScreenPreviewContainer
            show={canvasMode == "fullscreen-preview"}
            onExit={exitFullscreenPreview}
          />
          {(canvasMode == "isolated-view" ||
            (canvasMode == "fullscreen-preview" &&
              canvasMode_previous === "isolated-view")) && (
            <IsolateModeCanvas
              hidden={
                // if prev mode is this, hide, not remove.
                canvasMode == "fullscreen-preview" &&
                canvasMode_previous === "isolated-view"
              }
              onClose={endIsolatedViewMode}
              onEnterFullscreen={startFullscreenPreviewMode}
            />
          )}
          <div
            style={{
              display: canvasMode !== "free" && "none",
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
              // initialTransform={ } // TODO: if the initial selection is provided from first load, from the query param, we have to focus to fit that node.
              renderItem={(p) => {
                return (
                  // <WebWorkerD2CVanillaPreview
                  //   key={p.node.id}
                  //   target={p.node}
                  //   {...p}
                  // />
                  <D2CVanillaPreview key={p.node.id} target={p.node} {...p} />
                );
              }}
              config={{
                can_highlight_selected_layer: true,
                marquee: {
                  disabled: false,
                },
              }}
              renderFrameTitle={(p) => (
                <FrameTitleRenderer
                  key={p.id}
                  {...p}
                  onRunClick={startIsolatedViewMode}
                />
              )}
            />
          </div>
        </>
      )}
    </CanvasContainer>
  );
}

function FullScreenPreviewContainer({
  onExit,
  show,
}: {
  onExit: () => void;
  show: boolean;
}) {
  return (
    <Dialog fullScreen onClose={onExit} open={show}>
      <FullScreenPreview onClose={onExit} />
    </Dialog>
  );
}

const CanvasContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;
