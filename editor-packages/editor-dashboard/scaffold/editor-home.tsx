import React, { useCallback, useState } from "react";
import styled from "@emotion/styled";
import type { ReflectSceneNode } from "@design-sdk/figma-node";
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

  const selectNode = useCallback(
    (node: string) => {
      dispatch({
        type: "select-node",
        node,
      });
    },
    [dispatch]
  );

  const enterNode = useCallback(
    (node: string) => {
      dispatch({
        type: "canvas/focus",
        node,
      });
      dispatch({
        type: "mode",
        mode: "design",
      });
    },
    [dispatch]
  );

  const blur = useCallback(() => {
    dispatch({
      type: "select-node",
      node: null,
    });
  }, [dispatch]);

  return (
    <Providers>
      <EditorHomeHeader onQueryChange={handleQuery} />
      <ContextMenuProvider>
        <div
          style={{
            marginTop: 80,
            padding: 40,
          }}
        >
          <ScenesSector
            label="Scenes"
            scenes={scenes}
            query={query}
            selections={selectedNodes}
            onBlur={blur}
            onSelect={selectNode}
            onEnter={enterNode}
          />
          <ScenesSector
            label="Components"
            scenes={components}
            query={query}
            selections={selectedNodes}
            onBlur={blur}
            onSelect={selectNode}
            onEnter={enterNode}
          />
        </div>
      </ContextMenuProvider>
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
