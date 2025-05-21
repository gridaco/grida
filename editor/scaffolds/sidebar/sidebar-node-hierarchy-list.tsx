"use client";

import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useDocument } from "@/grida-react-canvas";
import {
  Tree,
  TreeDragLine,
  TreeItem,
  TreeItemLabel,
} from "@/components/ui-editor/tree";
import {
  createOnDropHandler,
  dragAndDropFeature,
  hotkeysCoreFeature,
  keyboardDragAndDropFeature,
  selectionFeature,
  renamingFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core";
import { AssistiveTreeDescription, useTree } from "@headless-tree/react";
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
import { NodeTypeIcon } from "@/grida-react-canvas-starter-kit/starterkit-icons/node-type-icon";
import { cn } from "@/components/lib/utils";
import grida from "@grida/schema";

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
  onStartRenaming,
}: React.PropsWithChildren<{
  node_id: string;
  onStartRenaming?: () => void;
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
          disabled={!onStartRenaming}
          onSelect={() => {
            onStartRenaming?.();
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

export function NodeHierarchyList() {
  const {
    state: { document },
    select,
    hoverNode,
    toggleNodeLocked,
    toggleNodeActive,
    changeNodeName,
  } = useDocument();
  const { id, name, children, selection, hovered_node_id } = useCurrentScene();

  const expandedItems = useMemo(() => {
    return children.filter(
      (id) => (document.nodes[id] as grida.program.nodes.UnknwonNode).expanded
    );
  }, [id]);

  const tree = useTree<grida.program.nodes.Node>({
    rootItemId: "<scene-root>",
    canReorder: true,
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
      if (item.getId() === "<scene-root>") {
        return name;
      }
      return item.getItemData().name;
    },
    isItemFolder: (item) => {
      const node = item.getItemData();
      return "children" in node;
    },
    onDrop(items, target) {
      const ids = items.map((item) => item.getId());
      const target_id = target.item.getId();
      const index = "insertionIndex" in target ? target.insertionIndex : 0;
      console.log("drop", ids, target_id, index);
    },
    dataLoader: {
      getItem(itemId) {
        return document.nodes[itemId];
      },
      getChildren: (itemId) => {
        if (itemId === "<scene-root>") {
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
      renamingFeature,
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

        const isRenaming = item.isRenaming();
        const isHovered = hovered_node_id === node.id;

        return (
          <NodeHierarchyItemContextMenuWrapper
            key={node.id}
            node_id={node.id}
            onStartRenaming={() => {
              // prevent from input blurring caused by the context menu closing
              setTimeout(() => {
                item.startRenaming();
              }, 100);
            }}
          >
            <TreeItem
              item={item}
              className="group/item w-full h-[25px] max-h-[25px]"
              data-is-renaming={isRenaming}
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
                  isHovered && "bg-accent"
                )}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <NodeTypeIcon node={node} className="size-3 shrink-0" />
                  {isRenaming ? (
                    <>
                      <NameInput
                        onBlur={item.getRenameInputProps().onBlur}
                        initialValue={node.name}
                        onValueCommit={(name) => {
                          changeNodeName(node.id, name);
                        }}
                        className="px-1 py-0.5 font-normal text-[11px]"
                      />
                    </>
                  ) : (
                    <>
                      <span
                        className="px-1 py-0.5 text-start font-normal text-[11px] truncate min-w-0 w-full"
                        onDoubleClick={() => {
                          item.startRenaming();
                        }}
                      >
                        {node.name}
                      </span>
                    </>
                  )}
                </div>
                <div
                  aria-label="actions"
                  className="items-center gap-2 px-2 hidden shrink-0 group-hover/item:flex group-data-[is-renaming=true]/item:hidden"
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

function NameInput({
  initialValue,
  onValueChange,
  onValueCommit,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "ref" | "value"> & {
  initialValue: string;
  onValueChange?: (name: string) => void;
  onValueCommit?: (name: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      props.onChange?.(e);
      setValue(e.target.value);
      onValueChange?.(e.target.value);
    },
    [onValueChange, props.onChange]
  );

  const onBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      props.onBlur?.(e);
      onValueCommit?.(value);
    },
    [onValueCommit, value, props.onBlur]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      props.onKeyDown?.(e);

      if (e.defaultPrevented) return;

      if (e.key === "Escape") {
        ref.current?.blur();
      }
      if (e.key === "Enter") {
        onValueCommit?.(value);
        ref.current?.blur();
      }
    },
    [onValueCommit, value, props.onKeyDown]
  );

  useEffect(() => {
    setTimeout(() => {
      if (ref.current) {
        ref.current.focus();
        ref.current.select();
      }
    }, 100);
  }, [ref.current]);

  return (
    <input
      {...props}
      ref={ref}
      type="text"
      value={value}
      className={cn("w-full", className)}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        props.onClick?.(e);
        if (e.defaultPrevented) return;
        e.stopPropagation();
        e.preventDefault();
      }}
    />
  );
}
