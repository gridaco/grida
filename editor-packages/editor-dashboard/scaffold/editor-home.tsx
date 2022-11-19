import React, { useCallback, useMemo, useState } from "react";
import styled from "@emotion/styled";
import { useEditorState } from "editor/core/states";
import { useDispatch } from "editor/core/dispatch";
import { SceneCard, SceneCardProps } from "./scene-card";
import { EditorHomeHeader } from "./editor-home-header";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import {
  ContextMenuRoot as ContextMenu,
  MenuItem,
} from "@editor-ui/context-menu";
import { useDashboard } from "../core/provider";

export function EditorHomePageView() {
  const [__editorstate] = useEditorState();
  const { selectedNodes } = __editorstate;
  const _editor_dispatch = useDispatch();
  const { hierarchy, filter, dispatch } = useDashboard();

  const handleQuery = (query: string) => {
    dispatch({
      type: "filter",
      query: query,
    });
  };

  const selectNode = useCallback(
    (node: string) => {
      _editor_dispatch({
        type: "select-node",
        node,
      });
    },
    [_editor_dispatch]
  );

  const enterNode = useCallback(
    (node: string) => {
      _editor_dispatch({
        type: "canvas/focus",
        node,
      });
      _editor_dispatch({
        type: "mode",
        mode: "design",
      });
    },
    [_editor_dispatch]
  );

  const blur = useCallback(() => {
    _editor_dispatch({
      type: "select-node",
      node: null,
    });
  }, [_editor_dispatch]);

  return (
    <Providers>
      <EditorHomeHeader onQueryChange={handleQuery} />

      <div
        style={{
          marginTop: 80,
          padding: 40,
        }}
      >
        {hierarchy.sections.map((section, i) => {
          const { name, items } = section;
          return (
            <ScenesSector
              key={i}
              label={name}
              scenes={items}
              query={filter.query}
              selections={selectedNodes}
              onBlur={blur}
              onSelect={selectNode}
              onEnter={enterNode}
            />
          );
        })}

        {/* <ScenesSector
          label="Components"
          scenes={components}
          query={filter.query}
          selections={selectedNodes}
          onBlur={blur}
          onSelect={selectNode}
          onEnter={enterNode}
        /> */}
      </div>
    </Providers>
  );
}

interface SceneCardMeta {
  id: string;
  name: string;
  type: unknown;
}

function ScenesSector({
  label,
  scenes,
  query,
  selections,
  onBlur,
  onSelect,
  onEnter,
}: {
  label: string;
  scenes: ReadonlyArray<SceneCardMeta>;
  query: string;
  selections: string[];
  onBlur: () => void;
  onSelect: (id: string) => void;
  onEnter: (id: string) => void;
}) {
  return (
    <>
      <ContextMenuProvider>
        <div>
          <SectionLabel>{label}</SectionLabel>
          <SceneGrid onClick={onBlur}>
            {scenes.map((i) => (
              <DraggableSceneCard
                key={i.id}
                // @ts-ignore // todo
                scene={i}
                q={query}
                selected={selections.includes(i.id)}
                onClick={(e) => {
                  onSelect(i.id);
                  e.stopPropagation();
                }}
                onDoubleClick={() => {
                  onEnter(i.id);
                }}
              />
            ))}
          </SceneGrid>
        </div>
      </ContextMenuProvider>
    </>
  );
}

function Providers({ children }: React.PropsWithChildren<{}>) {
  return <DndProvider backend={HTML5Backend}>{children}</DndProvider>;
}

function ContextMenuProvider({ children }: React.PropsWithChildren<{}>) {
  const items: MenuItem<string>[] = [
    { title: "New Folder", value: "new-folder" },
    "separator",
    { title: "Run", value: "run" },
    { title: "Deploy", value: "deploy-to-vercel" },
    { title: "Open in Figma", value: "open-in-figma" },
    { title: "Get sharable link", value: "make-sharable-link" },
    { title: "Copy CSS", value: "make-css" },
    { title: "Refresh (fetch from origin)", value: "refresh" },
  ];

  return (
    <ContextMenu
      items={items}
      onSelect={(v) => {
        console.log("exec canvas cmd", v);
      }}
    >
      {children}
    </ContextMenu>
  );
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
