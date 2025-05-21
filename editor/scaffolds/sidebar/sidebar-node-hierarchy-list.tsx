"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  createOnDropHandler,
  dragAndDropFeature,
  hotkeysCoreFeature,
  keyboardDragAndDropFeature,
  selectionFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core";
import { AssistiveTreeDescription, useTree } from "@headless-tree/react";
import { FolderIcon, FolderOpenIcon } from "lucide-react";

import {
  Tree,
  TreeDragLine,
  TreeItem,
  TreeItemLabel,
} from "@/components/ui-editor/tree";
import { useDocument } from "@/grida-react-canvas";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  SidebarMenuItem as Item,
  SidebarMenuItemAction,
  SidebarMenuItemActions,
  SidebarMenuItemLabel,
} from "@/components/sidebar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  LockClosedIcon,
  EyeOpenIcon,
  EyeClosedIcon,
  LockOpen1Icon,
  PlusIcon,
  FileIcon,
} from "@radix-ui/react-icons";
import {
  useCurrentScene,
  useNodeAction,
  useTransform,
} from "@/grida-react-canvas/provider";
import { document as dq } from "@/grida-react-canvas/document-query";
import { NodeTypeIcon } from "@/grida-react-canvas-starter-kit/starterkit-icons/node-type-icon";
import grida from "@grida/schema";
import { cn } from "@/components/lib/utils";

export function ScenesGroup() {
  const { createScene } = useDocument();

  return (
    <SidebarGroup onContextMenu={(e) => e.preventDefault()}>
      <SidebarGroupLabel>
        Scenes
        <SidebarGroupAction onClick={() => createScene()}>
          <PlusIcon />
          <span className="sr-only">New Scene</span>
        </SidebarGroupAction>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <ScenesList />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function ScenesList() {
  const { scenes: scenesmap, scene_id, loadScene } = useDocument();

  const scenes = useMemo(() => {
    return Object.values(scenesmap).sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );
  }, [scenesmap]);

  return (
    <SidebarMenu>
      {scenes.map((scene) => {
        const isActive = scene.id === scene_id;
        return (
          <SceneItemContextMenuWrapper scene_id={scene.id} key={scene.id}>
            <SidebarMenuItem key={scene.id}>
              <SidebarMenuButton
                isActive={isActive}
                size="sm"
                onClick={() => loadScene(scene.id)}
              >
                <FileIcon />
                {scene.name}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SceneItemContextMenuWrapper>
        );
      })}
    </SidebarMenu>
  );
}

function SceneItemContextMenuWrapper({
  scene_id,
  children,
}: React.PropsWithChildren<{
  scene_id: string;
}>) {
  const { deleteScene, duplicateScene, renameScene } = useDocument();

  return (
    <ContextMenu>
      <ContextMenuTrigger className="w-full h-full">
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        <ContextMenuItem
          onSelect={() => {
            const n = prompt("Rename");
            if (n) renameScene(scene_id, n);
          }}
          className="text-xs"
        >
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            duplicateScene(scene_id);
          }}
          className="text-xs"
        >
          Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            deleteScene(scene_id);
          }}
          className="text-xs"
        >
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function NodeHierarchyItemContextMenuWrapper({
  node_id,
  children,
}: React.PropsWithChildren<{
  node_id: string;
}>) {
  const { copy, deleteNode } = useDocument();
  const { fit } = useTransform();
  const change = useNodeAction(node_id)!;

  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        <ContextMenuItem
          onSelect={() => {
            copy(node_id);
          }}
          className="text-xs"
        >
          Copy
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            const n = prompt("Rename");
            if (n) change.name(n);
          }}
          className="text-xs"
        >
          Rename
        </ContextMenuItem>
        <ContextMenuSeparator />
        {/* <ContextMenuItem onSelect={() => {}}>Copy</ContextMenuItem> */}
        {/* <ContextMenuItem>Paste here</ContextMenuItem> */}
        <ContextMenuItem
          onSelect={() => change.order("front")}
          className="text-xs"
        >
          Bring to front
          <ContextMenuShortcut>{"]"}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => change.order("back")}
          className="text-xs"
        >
          Send to back
          <ContextMenuShortcut>{"["}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        {/* <ContextMenuItem>Add Container</ContextMenuItem> */}
        <ContextMenuItem onSelect={change.toggleActive} className="text-xs">
          Set Active/Inactive
          <ContextMenuShortcut>{"⌘⇧H"}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            fit([node_id], { margin: 64, animate: true });
          }}
          className="text-xs"
        >
          Zoom to fit
          <ContextMenuShortcut>{"⇧1"}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={change.toggleLocked} className="text-xs">
          Lock/Unlock
          <ContextMenuShortcut>{"⌘⇧L"}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            deleteNode(node_id);
          }}
          className="text-xs"
        >
          Delete
          <ContextMenuShortcut>{"⌫"}</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function NodeHierarchyGroup() {
  return (
    <SidebarGroup className="flex-1" onContextMenu={(e) => e.preventDefault()}>
      <SidebarGroupLabel>Layers</SidebarGroupLabel>
      <SidebarGroupContent>
        <NodeHierarchyList />
        {/* <NodeHierarchyListV1 /> */}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function NodeHierarchyListV1() {
  const {
    state: { document, document_ctx },
    select,
    hoverNode,
    toggleNodeLocked,
    toggleNodeActive,
  } = useDocument();
  const { children, selection, hovered_node_id } = useCurrentScene();

  const list = useMemo(() => {
    // TODO: need nested nodes for templates
    return children.map((top) => dq.hierarchy(top, document_ctx)).flat();
  }, [children, document_ctx]);

  // const ids = Object.keys(document.nodes);

  return (
    <>
      {list.map(({ id, depth }) => {
        const n = document.nodes[id];
        if (!n) return null;
        const selected = selection.includes(id);
        const hovered = hovered_node_id === id;
        return (
          <NodeHierarchyItemContextMenuWrapper key={id} node_id={id}>
            <Item
              muted
              hovered={hovered}
              level={depth}
              selected={selected}
              onPointerDown={(e) => {
                if (e.metaKey || e.ctrlKey) {
                  select("selection", [id]);
                } else {
                  select([id]);
                }
              }}
              icon={<NodeTypeIcon node={n} className="w-3.5 h-3.5" />}
              onPointerEnter={() => {
                hoverNode(id, "enter");
              }}
              onPointerLeave={() => {
                hoverNode(id, "leave");
              }}
            >
              <SidebarMenuItemLabel className="font-normal text-xs">
                {n.name}
              </SidebarMenuItemLabel>
              <SidebarMenuItemActions>
                <SidebarMenuItemAction
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleNodeLocked(id);
                  }}
                >
                  {n.locked ? <LockClosedIcon /> : <LockOpen1Icon />}
                </SidebarMenuItemAction>
                <SidebarMenuItemAction
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleNodeActive(id);
                  }}
                >
                  {n.active ? <EyeOpenIcon /> : <EyeClosedIcon />}
                </SidebarMenuItemAction>
              </SidebarMenuItemActions>
            </Item>
          </NodeHierarchyItemContextMenuWrapper>
        );
      })}
    </>
  );
}

export function NodeHierarchyList() {
  const {
    state: { document, document_ctx },
    select,
    hoverNode,
    toggleNodeLocked,
    toggleNodeActive,
  } = useDocument();
  const { id, name, children, selection, hovered_node_id } = useCurrentScene();

  const expandedItems = useMemo(() => {
    return children.filter(
      (id) => (document.nodes[id] as grida.program.nodes.UnknwonNode).expanded
    );
  }, [id]);

  const tree = useTree<grida.program.nodes.Node>({
    rootItemId: "<root>",
    initialState: {
      expandedItems: expandedItems,
      selectedItems: selection,
    },
    state: {
      selectedItems: selection,
    },
    setSelectedItems: (items) => {
      select(items as string[]);
    },
    getItemName: (item) => {
      if (item.getId() === "<root>") {
        return name;
      }
      return item.getItemData().name;
    },
    isItemFolder: (item) => {
      const node = item.getItemData();
      return "children" in node;
    },
    canReorder: false,
    dataLoader: {
      getItem(itemId) {
        return document.nodes[itemId];
      },
      getChildren: (itemId) => {
        if (itemId === "<root>") {
          return children;
        }
        const node = document.nodes[itemId];
        return (
          (node as grida.program.nodes.i.IChildrenReference)?.children || []
        );
      },
    },
    features: [
      syncDataLoaderFeature,
      selectionFeature,
      hotkeysCoreFeature,
      dragAndDropFeature,
      keyboardDragAndDropFeature,
    ],
  });

  useEffect(() => {
    tree.rebuildTree();
  }, [id]);

  return (
    <Tree tree={tree} indent={6} className="gap-y-1">
      <AssistiveTreeDescription tree={tree} />
      {tree.getItems().map((item) => {
        const node = item.getItemData();
        if (!node) return null;

        const hovered = hovered_node_id === node.id;

        return (
          <NodeHierarchyItemContextMenuWrapper key={node.id} node_id={node.id}>
            <TreeItem
              item={item}
              className="group/item w-full h-[25px] max-h-[25px]"
              onPointerEnter={() => {
                hoverNode(node.id, "enter");
              }}
              onPointerLeave={() => {
                hoverNode(node.id, "leave");
              }}
            >
              <TreeItemLabel
                className={cn(
                  "h-full px-1 py-1 bg-transparent",
                  hovered && "bg-accent"
                )}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <NodeTypeIcon node={node} className="size-3 shrink-0" />
                  <span className="text-start font-normal text-[11px] truncate min-w-0">
                    {node.name}
                  </span>
                </div>
                <div
                  aria-label="actions"
                  className="items-center gap-2 px-2 group-hover/item:flex hidden shrink-0"
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleNodeLocked(node.id);
                    }}
                  >
                    {node.locked ? (
                      <LockClosedIcon className="size-3" />
                    ) : (
                      <LockOpen1Icon className="size-3" />
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleNodeActive(node.id);
                    }}
                  >
                    {node.active ? (
                      <EyeOpenIcon className="size-3" />
                    ) : (
                      <EyeClosedIcon className="size-3" />
                    )}
                  </button>
                </div>
              </TreeItemLabel>
            </TreeItem>
          </NodeHierarchyItemContextMenuWrapper>
        );
      })}
      <TreeDragLine />
    </Tree>
  );
}
