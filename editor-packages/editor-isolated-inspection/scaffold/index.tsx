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
        position: "relative",
        display: "flex",
      }}
    >
      <Navigation />
      <VisualContentArea />
    </div>
  );
}

function Navigation() {
  const [state] = useEditorState();
  const dispatch = useDispatch();
  const { design, selectedNodes, canvas: canvasMeta, isolation } = state;

  const id = isolation.node;
  const scene = useMemo(() => findUnder(id, design), [id, design]);

  const previousitem = useMemo(() => findShifted(id, design, -1), [id, design]);
  const nextitem = useMemo(() => findShifted(id, design, 1), [id, design]);

  const onPreviousClick = useCallback(() => {
    dispatch({
      type: "design/enter-isolation",
      node: previousitem.id,
    });
  }, [dispatch, previousitem]);
  const onNextClick = useCallback(() => {
    dispatch({
      type: "design/enter-isolation",
      node: nextitem.id,
    });
  }, [dispatch, nextitem]);

  return (
    <NavigationPositioner>
      <NavigationBar>
        <IconButton
          outline="none"
          onClick={onPreviousClick}
          disabled={!!!previousitem}
        >
          <CaretLeftIcon />
        </IconButton>
        <span className="label">{scene.name}</span>
        <IconButton outline="none" onClick={onNextClick} disabled={!!!nextitem}>
          <CaretRightIcon />
        </IconButton>
      </NavigationBar>
    </NavigationPositioner>
  );
}

const NavigationPositioner = styled.div`
  z-index: 9;

  position: absolute;
  top: 0;
  left: 0;
  right: 0;

  display: flex;
  align-items: center;
  justify-content: center;
`;

const NavigationBar = styled.div`
  margin: 24px;

  display: flex;
  align-items: center;

  color: white;
  border-radius: 4px;
  background-color: rgba(0, 0, 0, 0.9);
  padding: 4px;
  gap: 4px;

  .label {
    padding: 0 8px;
    font-size: 0.8em;
    text-align: center;
    min-width: 160px;
    max-width: 320px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

function VisualContentArea() {
  const [state] = useEditorState();
  const [canvasSizingRef, canvasBounds] = useMeasure();
  const { config: preferences } = usePreferences();

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
        // debug
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

function findShifted(node: string, design: FigmaReflectRepository, shift = 0) {
  for (const page of design.pages) {
    for (let i = 0; i < page.children.length; i++) {
      const frame = page.children[i];
      if (frame.id === node) {
        return page.children[i + shift];
      }
    }
  }
}
