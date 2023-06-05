import React, { useMemo } from "react";
import styled from "@emotion/styled";
import { Canvas } from "@code-editor/canvas";
import { useEditorState, useWorkspace } from "editor/core/states";
import { useDispatch } from "editor/core/dispatch";
import useMeasure from "react-use-measure";
import { cursors } from "@code-editor/ui";
import assert from "assert";
import { Navigation } from "./navigation";
// import { Toolbar } from "./toolbar";
import { findUnder } from "../utils/find-under";
import { useRenderItemWithPreference } from "editor/scaffolds/canvas/hooks";

export function EditorIsolatedInspection() {
  return (
    <div
      data-wtf="editor-isolated-inspection"
      style={{
        position: "relative",
        display: "flex",
      }}
    >
      {/* TODO: Add toolbar */}
      {/* <Toolbar /> */}
      <Navigation />
      <VisualContentArea />
    </div>
  );
}

function VisualContentArea() {
  const [state] = useEditorState();
  const [canvasSizingRef, canvasBounds] = useMeasure();

  const { highlightedLayer } = useWorkspace();
  const dispatch = useDispatch();

  const { design, selectedNodes, canvas: canvasMeta, isolation } = state;

  assert(
    !!isolation.node && isolation.isolated === true,
    `Invalid isolation input`
  );
  const id = isolation.node;

  // find the target scene
  // todo: clean this up
  const scene = useMemo(() => findUnder(id, design), [id, design]);
  const cursor = state.designerMode === "comment" ? cursors.comment : "default";

  const renderItem = useRenderItemWithPreference();

  return (
    <CanvasContainer ref={canvasSizingRef} id="canvas">
      {/* <EditorAppbarFragments.Canvas /> */}

      <Canvas
        key={id}
        viewbound={[
          canvasBounds.left,
          canvasBounds.top,
          canvasBounds.right,
          canvasBounds.bottom,
        ]}
        filekey={state.design.key}
        pageid={"isolation"}
        backgroundColor={"transparent"}
        selectedNodes={selectedNodes}
        highlightedLayer={highlightedLayer}
        onSelectNode={(...nodes) => {
          dispatch({ type: "select-node", node: nodes.map((n) => n.id) });
        }}
        onClearSelection={() => {
          dispatch({ type: "select-node", node: [] });
        }}
        nodes={[scene]}
        focus={[id]}
        renderItem={renderItem}
        renderFrameTitle={() => <></>}
        readonly
        config={{
          can_highlight_selected_layer: true,
          marquee: {
            disabled: true,
          },
          grouping: {
            disabled: false,
          },
        }}
        cursor={cursor}
      />
    </CanvasContainer>
  );
}

const CanvasContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
`;
