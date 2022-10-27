import React from "react";
import type { ReflectSceneNode } from "@design-sdk/figma-node";
import { useEditorState } from "core/states";
import { FigmaStaticImageFrameView } from "scaffolds/preview-canvas";
import { SceneNodeIcon } from "components/icons";
import styled from "@emotion/styled";
import { useDispatch } from "core/dispatch";

export function EditorHomePageView() {
  const [state] = useEditorState();
  const { design, selectedNodes } = state;
  const dispatch = useDispatch();

  const scenes: ReadonlyArray<ReflectSceneNode> = design.pages
    .reduce((acc, page) => {
      return acc.concat(page.children);
    }, [])
    .filter(Boolean)
    .filter(
      (s: ReflectSceneNode) =>
        (s.origin === "FRAME" ||
          s.origin === "COMPONENT" ||
          s.origin === "COMPONENT_SET") &&
        s.visible &&
        s.children.length > 0
    );

  return (
    <div
      style={{
        padding: 40,
      }}
    >
      <SceneGrid
        onClick={() => {
          dispatch({
            type: "select-node",
            node: null,
          });
        }}
      >
        {scenes.map((s) => {
          return (
            <SceneCard
              key={s.id}
              scene={s}
              selected={selectedNodes.includes(s.id)}
              onClick={(e) => {
                dispatch({
                  type: "select-node",
                  node: s.id,
                });
                e.stopPropagation();
              }}
              onDoubleClick={() => {
                dispatch({
                  type: "locate-node",
                  node: s.id,
                });
                dispatch({
                  type: "mode",
                  mode: "code",
                });
              }}
            />
          );
        })}
      </SceneGrid>
    </div>
  );
}

const SceneGrid = styled.div`
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 40px;
`;

function SceneCard({
  scene,
  selected,
  onClick,
  onDoubleClick,
}: {
  scene: ReflectSceneNode;
  selected?: boolean;
  onClick?: (e) => void;
  onDoubleClick?: () => void;
}) {
  const maxwidth = 300;
  const scale = maxwidth / scene.width;
  const { height, type } = scene;
  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 0,
      }}
    >
      {/* sizer */}
      <Preview
        data-selected={selected}
        style={{
          height: height * scale,
          width: maxwidth,
        }}
      >
        <span id="overlay" />
        {/* transformer */}
        <div
          style={{
            pointerEvents: "none",
            userSelect: "none",
            transformOrigin: "top left",
            transform: `scale(${scale})`,
          }}
        >
          <FigmaStaticImageFrameView
            key={scene.id}
            target={scene}
            isPanning={false}
            isZooming={false}
            zoom={null}
            inViewport
            focused={false}
          />
        </div>
      </Preview>
      <footer>
        <Label>
          <SceneNodeIcon type={type} color="white" />
          <label>{scene.name}</label>
        </Label>
      </footer>
    </div>
  );
}

const Preview = styled.div`
  outline: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 2px;
  overflow: hidden;
  background: white;
  overflow: hidden;
  box-sizing: border-box;

  #overlay {
    display: none;
    z-index: 99;
    position: absolute;
    width: inherit;
    height: inherit;
    background: rgba(0, 0, 255, 0.1);
  }

  &[data-selected="true"] {
    outline: 4px solid rgb(0, 179, 255);

    #overlay {
      display: block;
    }
  }
`;

const Label = styled.span`
  padding: 16px 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;

  label {
    font-size: 12px;
    font-weight: 500;
    color: white;
  }
`;
