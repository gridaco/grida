import React, { useCallback } from "react";
import styled from "@emotion/styled";
import {
  FolderCard as _FolderCard,
  SceneCard as _SceneCard,
  SectionHeaderAction,
  SectionHeader,
  DashboardItemCardProps,
} from "../components";
import { EditorHomeHeader } from "./editor-dashboard-header";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import {
  ContextMenuRoot as ContextMenu,
  MenuItem,
} from "@editor-ui/context-menu";
import * as Collapsible from "@radix-ui/react-collapsible";
import {
  useDashboard,
  DashboardItem,
  DashboardFolderItem,
  SceneItem,
} from "../core";

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
            <RootDirectory
              key={i}
              path={section.path}
              label={name}
              contents={contents}
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

        <RootDirectory
          label="Components"
          path={"/components"}
          contents={hierarchy.components}
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

function RootDirectory({
  label,
  contents,
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
  contents: ReadonlyArray<DashboardItem>;
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
      <RootDirectoryContextMenuProvider cwd={path}>
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
              {contents.map((i) => (
                <DashboardItemCard
                  key={i.id}
                  q={query}
                  {...i}
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
      </RootDirectoryContextMenuProvider>
    </div>
  );
}

function Providers({ children }: React.PropsWithChildren<{}>) {
  return <DndProvider backend={HTML5Backend}>{children}</DndProvider>;
}

function RootDirectoryContextMenuProvider({
  children,
  cwd,
}: React.PropsWithChildren<{
  cwd: string;
}>) {
  const { mkdir } = useDashboard();
  const items: MenuItem<string>[] = [
    { title: "New Folder", value: "new-folder" },
    // "separator",
    // { title: "Run", value: "run" },
    // { title: "Deploy", value: "deploy-to-vercel" },
    // { title: "Open in Figma", value: "open-in-figma" },
    // { title: "Get sharable link", value: "make-sharable-link" },
    // { title: "Copy CSS", value: "make-css" },
    // { title: "Refresh (fetch from origin)", value: "refresh" },
  ];

  const onselect = useCallback(
    (value: string) => {
      switch (value) {
        case "new-folder":
          mkdir(cwd);
          break;
      }
    },
    [mkdir]
  );

  return (
    <ContextMenu items={items} onSelect={onselect}>
      {children}
    </ContextMenu>
  );
}

type DndMetaItem<T = object> = T & {
  id: string;
  $type: DashboardItem["$type"];
};

function DashboardItemCard(
  props: DashboardItem &
    Omit<DashboardItemCardProps, "label" | "preview" | "icon">
) {
  switch (props.$type) {
    case "frame-scene":
    case "component": {
      return <SceneCard {...props} />;
    }
    case "folder": {
      return <FolderCard {...props} />;
    }
    default: {
      throw new Error(`Unknown item type ${props.$type}`);
    }
  }
}

function SceneCard(
  props: SceneItem & Omit<DashboardItemCardProps, "label" | "preview" | "icon">
) {
  const [{ isActive }, drop] = useDrop(() => ({
    accept: "scene",
    collect: (monitor) => ({
      isActive: monitor.canDrop() && monitor.isOver(),
    }),
    canDrop(item: DndMetaItem, monitor) {
      return item.id !== props.id;
    },
    drop(item, monitor) {
      console.log("drop", item, monitor);
      // todo:
    },
  }));

  const [{ opacity }, drag] = useDrag(() => {
    return {
      type: "scene",
      item: props.scene,
      collect: (monitor) => ({
        opacity: monitor.isDragging() ? 0.5 : 1,
      }),
    };
  }, []);

  function attachRef(el) {
    drag(el);
    drop(el);
  }

  const defaultprops = {
    isOver: isActive,
    style: { opacity },
  };

  return (
    <_SceneCard
      // @ts-ignore
      scene={props.scene as any}
      ref={attachRef}
      {...defaultprops}
      {...props}
    />
  );
}

function FolderCard(
  props: DashboardFolderItem &
    Omit<DashboardItemCardProps, "label" | "preview" | "icon">
) {
  const [{ isActive }, drop] = useDrop(() => ({
    accept: ["scene", "folder"],
    collect: (monitor) => ({
      isActive: monitor.canDrop() && monitor.isOver(),
    }),
    canDrop(item: DndMetaItem, monitor) {
      return item.id !== props.id;
    },
    drop(item, monitor) {
      console.log("drop", item, monitor);
      // todo:
    },
  }));

  const [{ opacity }, drag] = useDrag(() => {
    return {
      type: props.$type,
      item: props,
      collect: (monitor) => ({
        opacity: monitor.isDragging() ? 0.5 : 1,
      }),
    };
  }, []);

  function attachRef(el) {
    drag(el);
    drop(el);
  }

  const defaultprops = {
    isOver: isActive,
    style: { opacity },
  };

  return (
    <_FolderCard
      ref={attachRef}
      id={props.id}
      path={props.path}
      name={props.name}
      contents={props.contents}
      {...defaultprops}
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
