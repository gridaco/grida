import React, { useCallback } from "react";
import styled from "@emotion/styled";
import { Canvas } from "@code-editor/canvas";
import { useEditorState, useWorkspace } from "core/states";
import useMeasure from "react-use-measure";
import { useDispatch } from "core/dispatch";
import { FrameTitleRenderer } from "./render/frame-title";
import { cursors } from "@code-editor/ui";
import { usePreferences } from "@code-editor/preferences";
import { useRenderItemWithPreference } from "./hooks";
import { ViewportTitleRenderer } from "@/renderers/viewport-title-renderer";

/**
 * Statefull canvas segment that contains canvas as a child, with state-data connected.
 */
export function EditorFigmaCanvas({
  readonly,
  renderer,
}: {
  readonly?: boolean;
  renderer?:
    | "bitmap-renderer"
    | "d2c-vanilla-iframe-renderer"
    | "craft-renderer";
}) {
  const [state] = useEditorState();
  const [canvasSizingRef, canvasBounds] = useMeasure();
  const { highlightedLayer, highlightLayer } = useWorkspace();
  const dispatch = useDispatch();
  const renderItem = useRenderItemWithPreference(
    renderer ? { force_use_renderer: renderer } : undefined
  );

  const {
    selectedPage,
    design,
    selectedNodes,
    canvas: canvasMeta,
    canvasMode,
  } = state;
  const { focus } = canvasMeta;

  const thisPage = design?.pages?.find((p) => p.id == selectedPage);
  const thisPageNodes = selectedPage ? thisPage?.children?.filter(Boolean) : [];

  const isEmptyPage = thisPageNodes?.length === 0;

  const startCodeSession = useCallback(
    (target: string) =>
      dispatch({
        type: "coding/new-template-session",
        template: {
          type: "d2c",
          target: target,
        },
      }),
    [dispatch]
  );

  const enterIsolation = useCallback(
    (node: string) =>
      dispatch({
        type: "design/enter-isolation",
        node,
      }),
    [dispatch]
  );

  const _bg =
    thisPage?.backgroundColor &&
    `rgba(${thisPage.backgroundColor.r * 255}, ${
      thisPage.backgroundColor.g * 255
    }, ${thisPage.backgroundColor.b * 255}, ${thisPage.backgroundColor.a})`;

  const cursor = state.designerMode === "comment" ? cursors.comment : "default";

  return (
    <CanvasContainer ref={canvasSizingRef} id="canvas">
      {/* <EditorAppbarFragments.Canvas /> */}

      {isEmptyPage ? (
        <></>
      ) : (
        <>
          <Canvas
            key={selectedPage}
            viewbound={[
              canvasBounds.left,
              canvasBounds.top,
              canvasBounds.right,
              canvasBounds.bottom,
            ]}
            filekey={state.design.key}
            pageid={selectedPage}
            backgroundColor={_bg}
            selectedNodes={selectedNodes}
            focusRefreshkey={focus.refreshkey}
            focus={focus.nodes}
            highlightedLayer={highlightedLayer}
            onSelectNode={(...nodes) => {
              dispatch({ type: "select-node", node: nodes.map((n) => n.id) });
            }}
            onClearSelection={() => {
              dispatch({ type: "select-node", node: [] });
            }}
            nodes={thisPageNodes}
            // initialTransform={ } // TODO: if the initial selection is provided from first load, from the query param, we have to focus to fit that node.
            renderItem={renderItem}
            // readonly={false}
            readonly
            config={{
              can_highlight_selected_layer: true,
              marquee: {
                disabled: false,
              },
              grouping: {
                disabled: false,
              },
            }}
            cursor={cursor}
            renderFrameTitle={(p) => (
              <FrameTitleRenderer
                key={p.id}
                {...p}
                runnable={selectedNodes.length === 1}
                onRunClick={() => startCodeSession(p.id)}
                onDoubleClick={() => enterIsolation(p.id)}
              />
            )}
          />
        </>
      )}
    </CanvasContainer>
  );
}

export function EditorCraftCanvas() {
  const [state] = useEditorState();
  const [canvasSizingRef, canvasBounds] = useMeasure();
  const { highlightedLayer, highlightLayer } = useWorkspace();
  const dispatch = useDispatch();
  const renderItem = useRenderItemWithPreference({
    force_use_renderer: "craft-renderer",
  });

  const {
    selectedPage,
    // design,
    selectedNodes,
    canvas: canvasMeta,
    craft,
    canvasMode,
  } = state;
  const { focus } = canvasMeta;

  const startCodeSession = useCallback(
    (target: string) =>
      dispatch({
        type: "coding/new-template-session",
        template: {
          type: "d2c",
          target: target,
        },
      }),
    [dispatch]
  );

  const enterIsolation = useCallback(
    (node: string) =>
      dispatch({
        type: "design/enter-isolation",
        node,
      }),
    [dispatch]
  );

  return (
    <CanvasContainer ref={canvasSizingRef} id="canvas">
      {/* <EditorAppbarFragments.Canvas /> */}

      <Canvas
        key={selectedPage}
        viewbound={[
          canvasBounds.left,
          canvasBounds.top,
          canvasBounds.right,
          canvasBounds.bottom,
        ]}
        filekey={"craft"}
        pageid={selectedPage}
        backgroundColor={"#E5E5E5"}
        selectedNodes={selectedNodes}
        focusRefreshkey={focus.refreshkey}
        focus={focus.nodes}
        highlightedLayer={highlightedLayer}
        onSelectNode={(...nodes) => {
          dispatch({ type: "select-node", node: nodes.map((n) => n.id) });
        }}
        onMoveNode={([x, y], ...nodes) => {
          dispatch({
            type: "node-transform-translate",
            translate: [x, y],
          });
        }}
        onResizeNode={([w, h], { origin, shiftKey, altKey }, ...nodes) => {
          dispatch({
            type: "node-resize-delta",
            origin,
            delta: [w, h],
            shiftKey,
            altKey,
          });
        }}
        onClearSelection={() => {
          dispatch({ type: "select-node", node: [] });
        }}
        nodes={craft.children}
        // initialTransform={ } // TODO: if the initial selection is provided from first load, from the query param, we have to focus to fit that node.
        renderItem={renderItem}
        readonly={false}
        config={{
          can_highlight_selected_layer: true,
          marquee: {
            disabled: false,
          },
          grouping: {
            disabled: false,
          },
        }}
        renderFrameTitle={(p) => {
          if (p.type === "viewport") {
            return (
              <ViewportTitleRenderer
                key={p.id}
                {...p}
                runnable={true}
                onRunClick={() => startCodeSession(p.id!)}
                onDoubleClick={() => enterIsolation(p.id!)}
              />
            );
          }
          // TODO: consider removing title for non viewport nodes?
          return <></>;
          return (
            <FrameTitleRenderer
              key={p.id}
              {...p}
              runnable={false}
              onRunClick={() => startCodeSession(p.id!)}
              onDoubleClick={() => enterIsolation(p.id!)}
            />
          );
        }}
      />
    </CanvasContainer>
  );
}

const CanvasContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;
