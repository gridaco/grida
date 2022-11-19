import React, { useState } from "react";
import styled from "@emotion/styled";
import type { ReflectSceneNode } from "@design-sdk/figma-node";
import { useEditorState } from "editor/core/states";
import { useDispatch } from "editor/core/dispatch";
import { SceneCard, SceneCardProps } from "./scene-card";
import { EditorHomeHeader } from "./editor-home-header";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

export function EditorHomePageView() {
  const [state] = useEditorState();
  const { design, selectedNodes } = state;
  const dispatch = useDispatch();
  const [query, setQuery] = useState(null);

  const scenes: ReadonlyArray<ReflectSceneNode> = design.pages
    .reduce((acc, page) => {
      return acc.concat(page.children);
    }, [])
    .filter(Boolean)
    // query by name first, since it's more efficient
    .filter((s) => s.name.toLowerCase().includes(query?.toLowerCase() || ""))
    .filter(
      (s: ReflectSceneNode) =>
        (s.origin === "FRAME" ||
          s.origin === "COMPONENT" ||
          s.origin === "COMPONENT_SET") &&
        s.visible &&
        s.children.length > 0
    );

  const components = Object.values(design.components)
    .filter(Boolean)
    // query by name first, since it's more efficient
    .filter((s) => s.name.toLowerCase().includes(query?.toLowerCase() || ""));

  const handleQuery = (query: string) => {
    setQuery(query);
  };

  return (
    <Providers>
      <EditorHomeHeader onQueryChange={handleQuery} />
      <div
        style={{
          marginTop: 80,
          padding: 40,
        }}
      >
        <SectionLabel>Scenes</SectionLabel>
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
              <DraggableSceneCard
                key={s.id}
                scene={s}
                q={query}
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
                    type: "canvas/focus",
                    node: s.id,
                  });
                  dispatch({
                    type: "mode",
                    mode: "design",
                  });
                }}
              />
            );
          })}
        </SceneGrid>
        <SectionLabel>Components</SectionLabel>
        <SceneGrid>
          {components.map((cmp) => (
            <DraggableSceneCard
              key={cmp.id}
              // @ts-ignore // todo
              scene={cmp}
              q={query}
              selected={selectedNodes.includes(cmp.id)}
              onClick={(e) => {
                dispatch({
                  type: "select-node",
                  node: cmp.id,
                });
                e.stopPropagation();
              }}
              onDoubleClick={() => {
                dispatch({
                  type: "canvas/focus",
                  node: cmp.id,
                });
                dispatch({
                  type: "mode",
                  mode: "design",
                });
              }}
            />
          ))}
        </SceneGrid>
      </div>
    </Providers>
  );
}

function Providers({ children }: React.PropsWithChildren<{}>) {
  return <DndProvider backend={HTML5Backend}>{children}</DndProvider>;
}

function DraggableSceneCard({ ...props }: SceneCardProps) {
  const [{ isActive }, drop] = useDrop(() => ({
    accept: "scene-card",
    collect: (monitor) => ({
      isActive: monitor.canDrop() && monitor.isOver(),
    }),
    canDrop<ReflectSceneNode>(item, monitor) {
      return item.id !== props.scene.id;
    },
    drop(item, monitor) {
      console.log("drop", item, monitor);
      // todo:
    },
  }));

  const [{ opacity }, drag] = useDrag(
    () => ({
      type: "scene-card",
      item: props.scene,
      collect: (monitor) => ({
        opacity: monitor.isDragging() ? 0.5 : 1,
      }),
    }),
    []
  );

  function attachRef(el) {
    drag(el);
    drop(el);
  }

  return (
    <SceneCard
      ref={attachRef}
      style={{
        opacity,
      }}
      isOver={isActive}
      {...props}
    />
  );
}

const SceneGrid = styled.div`
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 40px;
`;

const SectionLabel = styled.label`
  display: inline-block;
  color: white;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 16px;
`;
