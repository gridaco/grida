import React, { useState } from "react";
import styled from "@emotion/styled";
import type { ReflectSceneNode } from "@design-sdk/figma-node";
import { useEditorState } from "core/states";
import { useDispatch } from "core/dispatch";
import { SceneCard } from "./scene-card";
import { EditorHomeHeader } from "./editor-home-header";

export function EditorHomePageView() {
  const [state] = useEditorState();
  const { design, selectedNodes } = state;
  const dispatch = useDispatch();
  const [query, setQuery] = useState(null);

  const scenes: ReadonlyArray<ReflectSceneNode> = design.pages
    .reduce((acc, page) => {
      return acc.concat(page.children);
    }, [])
    // query by name first, since it's more efficient
    .filter((s) => s.name.toLowerCase().includes(query?.toLowerCase() || ""))
    .filter(Boolean)
    .filter(
      (s: ReflectSceneNode) =>
        (s.origin === "FRAME" ||
          s.origin === "COMPONENT" ||
          s.origin === "COMPONENT_SET") &&
        s.visible &&
        s.children.length > 0
    );

  const components = Object.values(design.components)
    //
    // query by name first, since it's more efficient
    .filter((s) => s.name.toLowerCase().includes(query?.toLowerCase() || ""));

  const handleQuery = (query: string) => {
    setQuery(query);
  };

  return (
    <>
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
              <SceneCard
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
        <SectionLabel>Components</SectionLabel>
        <SceneGrid>
          {components.map((cmp) => (
            <SceneCard
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
                  type: "locate-node",
                  node: cmp.id,
                });
                dispatch({
                  type: "mode",
                  mode: "code",
                });
              }}
            />
          ))}
        </SceneGrid>
      </div>
    </>
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
