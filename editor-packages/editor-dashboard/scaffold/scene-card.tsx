import React, { useRef } from "react";
import styled from "@emotion/styled";
import type { ReflectSceneNode } from "@design-sdk/figma-node";
import { FigmaNodeBitmapView } from "@code-editor/canvas-renderer-bitmap";
import { SceneNodeIcon } from "@code-editor/node-icons";
import Highlighter from "react-highlight-words";
import { useInViewport } from "react-in-viewport";
import { mergeRefs } from "react-merge-refs";

export interface SceneCardProps {
  scene: ReflectSceneNode;
  selected?: boolean;
  onClick?: (e) => void;
  onDoubleClick?: () => void;
  q?: string;
  style?: React.CSSProperties;
  /**
   * an explicit field to set the view as accepting drag state view.
   */
  isOver?: boolean;
}

export const SceneCard = React.forwardRef(function (
  {
    style = {},
    scene,
    selected,
    onClick,
    onDoubleClick,
    q,
    isOver,
  }: SceneCardProps,
  ref
) {
  const visibilityRef = useRef();
  const { enterCount } = useInViewport(visibilityRef);

  const maxwidth = 300;

  // max allowed zoom = 1
  const scale = Math.min(maxwidth / scene.width, 1);
  const { height, type } = scene;
  return (
    <div
      ref={mergeRefs([visibilityRef, ref])}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 0,
        ...style,
      }}
    >
      {/* sizer */}
      <Preview
        data-selected={selected}
        data-over={isOver}
        style={{
          height: height * scale,
          width: maxwidth,
        }}
      >
        <span id="overlay" />
        {/* transformer */}
        <div
          id="view"
          style={{
            transform: `scale(${scale})`,
          }}
        >
          <FigmaNodeBitmapView
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
});

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

  #view {
    pointer-events: none;
    user-select: none;
    transform-origin: top left;
    transition: all 0.2s ease-in-out;
  }

  &[data-selected="true"] {
    outline: 4px solid rgb(0, 179, 255);

    #overlay {
      display: block;
    }
  }

  &[data-over="true"] {
    outline: 4px solid rgb(0, 179, 255);

    #view {
      opacity: 0.5;
    }
  }

  transition: all 0.2s ease-in-out;
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
