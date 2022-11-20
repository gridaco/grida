import React from "react";
import styled from "@emotion/styled";
import { SceneCard, SceneCardProps } from "../components";
import { EditorHomeHeader } from "./editor-dashboard-header";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import {
  ContextMenuRoot as ContextMenu,
  MenuItem,
} from "@editor-ui/context-menu";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronRightIcon, ChevronDownIcon } from "@radix-ui/react-icons";
import { useDashboard } from "../core/provider";

export function Dashboard() {
  const {
    hierarchy,
    filter,
    dispatch,
    enterNode,
    selectNode,
    blurSelection,
    selection,
  } = useDashboard();

  const handleQuery = (query: string) => {
    dispatch({
      type: "filter",
      query: query,
    });
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
              onBlur={blurSelection}
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
  path,
  onBlur,
  onSelect,
  onEnter,
}: {
  label: string;
  scenes: ReadonlyArray<SceneCardMeta>;
  query: string;
  selections: string[];
  path: string;
  onBlur: () => void;
  onSelect: (id: string) => void;
  onEnter: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(true);

  return (
    <div style={{ marginBottom: 32 }}>
      <ContextMenuProvider>
        <Collapsible.Root open={open} onOpenChange={setOpen}>
          <SectionHeader id={path} expanded={open} label={label} q={query} />
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

import Highlighter from "react-highlight-words";

function SectionHeader({
  label,
  expanded = true,
  q,
  id,
}: {
  expanded?: boolean;
  label: string;
  q?: string;
  id: string;
}) {
  const iconprops = {
    color: "white",
  };

  const ToggleIcon = expanded ? ChevronDownIcon : ChevronRightIcon;

  return (
    <Collapsible.Trigger asChild>
      <SectionHeaderContainer id={id}>
        <div className="toggle">
          <ToggleIcon />
        </div>
        <Highlighter
          className="label"
          highlightClassName="label"
          searchWords={q ? [q] : []}
          textToHighlight={label}
          autoEscape // required to escape regex special characters, like, `+`, `(`, `)`, etc.
        />
      </SectionHeaderContainer>
    </Collapsible.Trigger>
  );
}

const SectionHeaderContainer = styled.div`
  padding: 16px;
  display: flex;
  align-items: center;
  flex-direction: row;
  margin-bottom: 16px;
  border-radius: 4px;
  cursor: pointer;

  background: transparent;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .toggle {
    margin-right: 16px;
    color: white;
  }

  .label {
    user-select: none;
    display: inline-block;
    opacity: 0.8;
    color: white;
    font-size: 18px;
    font-weight: 500;
    mark {
      background: white;
      color: black;
    }
  }
`;
