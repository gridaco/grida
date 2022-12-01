import React, { useCallback, useMemo } from "react";
import styled from "@emotion/styled";
import { CaretLeftIcon, CaretRightIcon } from "@radix-ui/react-icons";
import { IconButton } from "@code-editor/ui";
import { Canvas } from "@code-editor/canvas";
import {
  FigmaReflectRepository,
  useEditorState,
  useWorkspace,
} from "editor/core/states";
import { useDispatch } from "editor/core/dispatch";
import {
  D2CVanillaPreview,
  OptimizedPreviewCanvas,
} from "editor/scaffolds/preview-canvas";
import useMeasure from "react-use-measure";
// import { FrameTitleRenderer } from "./render/frame-title";
import { cursors } from "@code-editor/ui";
import { usePreferences } from "@code-editor/preferences";
import assert from "assert";

export function EditorIsolatedInspection() {
  return (
    <div
      style={{
        display: "flex",
      }}
    >
      <Navigation />
      <VisualContentArea />
    </div>
  );
}

function Navigation() {
  return (
    <div
      style={{
        alignSelf: "center",
        display: "flex",
        alignItems: "center",
        width: "100%",
      }}
    >
      <IconButton>
        <CaretLeftIcon />
      </IconButton>
      <IconButton>
        <CaretRightIcon />
      </IconButton>
    </div>
  );
}

function VisualContentArea() {
  const [state] = useEditorState();
  const [canvasSizingRef, canvasBounds] = useMeasure();
  const { config: preferences } = usePreferences();

  const { highlightedLayer, highlightLayer } = useWorkspace();
  const dispatch = useDispatch();

  const {
    selectedPage,
    design,
    selectedNodes,
    canvas: canvasMeta,
    canvasMode,
    isolation,
  } = state;
  const { focus } = canvasMeta;

  assert(
    !!isolation.node && isolation.isolated === true,
    `Invalid isolation input`
  );
  const id = isolation.node;

  // find the target scene
  // todo: clean this up
  const scene = useMemo(() => findUnder(id, design), [id, design]);
  const cursor = state.designerMode === "comment" ? cursors.comment : "default";

  const { renderer } = preferences.canvas;
  const renderItem = useCallback(
    (p) => {
      switch (renderer) {
        case "bitmap-renderer": {
          return (
            <OptimizedPreviewCanvas key={p.node.id} target={p.node} {...p} />
          );
        }
        case "vanilla-renderer": {
          return <D2CVanillaPreview key={p.node.id} target={p.node} {...p} />;
        }
        default:
          throw new Error("Unknown renderer", renderer);
      }
    },
    [renderer]
  );

  return (
    <CanvasContainer ref={canvasSizingRef} id="canvas">
      {/* <EditorAppbarFragments.Canvas /> */}

      <div
        style={{
          display: state.mode.value === "design" ? "block" : "none",
        }}
      >
        <Canvas
          viewbound={[
            canvasBounds.left,
            canvasBounds.top,
            canvasBounds.bottom,
            canvasBounds.right,
          ]}
          filekey={state.design.key}
          pageid={"isolation"}
          backgroundColor={"grey"}
          selectedNodes={selectedNodes}
          highlightedLayer={highlightedLayer}
          onSelectNode={(...nodes) => {
            dispatch({ type: "select-node", node: nodes.map((n) => n.id) });
          }}
          onClearSelection={() => {
            dispatch({ type: "select-node", node: [] });
          }}
          nodes={[scene]}
          renderItem={renderItem}
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
      </div>
    </CanvasContainer>
  );
}

const CanvasContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
`;

/**
 * This only supports root frame at the moment.
 * @param node
 * @param design
 * @returns
 */
function findUnder(node: string, design: FigmaReflectRepository) {
  for (const page of design.pages) {
    for (const frame of page.children) {
      if (frame.id === node) {
        return frame;
      }
    }
  }
}
