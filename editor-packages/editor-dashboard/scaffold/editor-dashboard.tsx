import React, { useCallback } from "react";
import styled from "@emotion/styled";
import {
  SceneCard,
  SceneCardProps,
  SectionHeaderAction,
  SectionHeader,
} from "../components";
import { EditorHomeHeader } from "./editor-dashboard-header";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import {
  ContextMenuRoot as ContextMenu,
  MenuItem,
} from "@editor-ui/context-menu";
import * as Collapsible from "@radix-ui/react-collapsible";
import { useDashboard } from "../core/provider";

export function Dashboard() {
  const {
    hierarchy,
    hierarchyFoldings,
    filter,
    dispatch,
    enterNode,
    selectNode,
    blurSelection,
    fold,
    unfold,
    foldAll,
    unfoldAll,
    selection,
  } = useDashboard();

  const handleQuery = (query: string) => {
    dispatch({
      type: "filter",
      query: query,
    });
  };

  const headerActions = [
    {
      id: "sections/unfold-all",
      label: "Unfold All Sections",
      handler: unfoldAll,
    },
    {
      id: "sections/fold-all",
      label: "Fold All Section",
      handler: foldAll,
    },
  ];

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
          const { name, contents } = section;
          return (
            <ScenesSector
              key={i}
              path={section.path}
              label={name}
              scenes={contents}
              query={filter.query}
              selections={selection}
              expanded={!hierarchyFoldings.includes(section.path)}
              onExpandChange={(expand) => {
                console.log("onExpandChange", expand, section.path);
                if (expand) {
                  unfold(section.path);
                } else {
                  fold(section.path);
                }
              }}
              onBlur={blurSelection}
              onSelect={selectNode}
              onEnter={enterNode}
              headerActions={headerActions}
            />
          );
        })}

        <ScenesSector
          label="Components"
          path={"/components"}
          scenes={hierarchy.components}
          query={filter.query}
          selections={selection}
          expanded
          onBlur={blurSelection}
          onSelect={selectNode}
          onEnter={enterNode}
          headerActions={headerActions}
        />
      </div>
    </Providers>
  );
}

interface SceneCardMeta {
  id: string;
  name: string;
  $type: unknown;
}

function ScenesSector({
  label,
  scenes,
  query,
  selections,
  path,
  expanded,
  onExpandChange,
  onBlur,
  onSelect,
  onEnter,
  headerActions,
}: {
  label: string;
  scenes: ReadonlyArray<SceneCardMeta>;
  query: string;
  selections: string[];
  path: string;
  expanded?: boolean;
  onExpandChange?: (expanded: boolean) => void;
  onBlur: () => void;
  onSelect: (id: string) => void;
  onEnter: (id: string) => void;
  headerActions?: SectionHeaderAction[];
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      <ContextMenuProvider>
        <Collapsible.Root open={expanded} onOpenChange={onExpandChange}>
          <SectionHeader
            id={path}
            expanded={expanded}
            label={label}
            q={query}
            actions={headerActions}
          />
          <Collapsible.Content>
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
          </Collapsible.Content>
        </Collapsible.Root>
      </ContextMenuProvider>
    </div>
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
