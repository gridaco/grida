import React, { useRef } from "react";
import styled from "@emotion/styled";
import type { ReflectSceneNode } from "@design-sdk/figma-node";
import { FigmaStaticImageFrameView } from "scaffolds/preview-canvas";
import { SceneNodeIcon } from "components/icons";
import Highlighter from "react-highlight-words";
import { useInViewport } from "react-in-viewport";

export function SceneCard({
  scene,
  selected,
  onClick,
  onDoubleClick,
  q,
}: {
  scene: ReflectSceneNode;
  selected?: boolean;
  onClick?: (e) => void;
  onDoubleClick?: () => void;
  q?: string;
}) {
  const visibilityRef = useRef();
  const { enterCount } = useInViewport(visibilityRef);

  const maxwidth = 300;

  // max allowed zoom = 1
  const scale = Math.min(maxwidth / scene.width, 1);
  const { height, type } = scene;
  return (
    <div
      ref={visibilityRef}
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
            background={"white"}
            key={scene.id}
            target={scene}
            isPanning={false}
            isZooming={false}
            zoom={null}
            inViewport={enterCount > 0}
            focused={false}
          />
        </div>
      </Preview>
      <footer>
        <Label>
          <SceneNodeIcon type={type} color="white" />
          <Highlighter
            className="name"
            highlightClassName="name"
            searchWords={q ? [q] : []}
            textToHighlight={scene.name}
            autoEscape // required to escape regex special characters, like, `+`, `(`, `)`, etc.
          />
        </Label>
      </footer>
    </div>
  );
}

const Preview = styled.div`
  outline: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 2px;
  overflow: hidden;
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

  .name {
    font-size: 12px;
    font-weight: 500;
    color: white;
    mark {
      background: white;
      color: black;
    }
  }
`;
