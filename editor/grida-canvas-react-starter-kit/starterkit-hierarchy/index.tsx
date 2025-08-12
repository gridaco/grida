"use client";

import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  useCurrentEditor,
  useEditorState,
  useContextMenuActions,
  ContextMenuAction,
} from "@/grida-canvas-react";
import {
  Tree,
  TreeDragLine,
  TreeItem,
  TreeItemLabel,
} from "@/components/ui-editor/tree";
import {
  dragAndDropFeature,
  selectionFeature,
  renamingFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
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
} from "@radix-ui/react-icons";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { useCurrentSceneState } from "@/grida-canvas-react/provider";
import { NodeTypeIcon } from "@/grida-canvas-react-starter-kit/starterkit-icons/node-type-icon";
import { cn } from "@/components/lib/utils";
import grida from "@grida/schema";

function SceneItemContextMenuWrapper({
  scene_id,
  onStartRenaming,
  children,
}: React.PropsWithChildren<{
  scene_id: string;
  onStartRenaming?: () => void;
}>) {
  const editor = useCurrentEditor();

  return (
    <ContextMenu>
      <ContextMenuTrigger className="w-full h-full">
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        <ContextMenuItem
          onSelect={() => {
            onStartRenaming?.();
          }}
          disabled={!onStartRenaming}
          className="text-xs"
        >
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            editor.duplicateScene(scene_id);
          }}
          className="text-xs"
        >
          Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            editor.deleteScene(scene_id);
          }}
          className="text-xs"
        >
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function ScenesList() {
  const editor = useCurrentEditor();
  const scenesmap = useEditorState(editor, (state) => state.document.scenes);
  const scene_id = useEditorState(editor, (state) => state.scene_id);

  const scenes = useMemo(() => {
    return Object.values(scenesmap).sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );
  }, [scenesmap]);

  const tree = useTree<grida.program.document.Scene>({
    rootItemId: "<document>",
    canReorder: true,
    initialState: {
      selectedItems: scene_id ? [scene_id] : [],
    },
    state: {
      selectedItems: scene_id ? [scene_id] : [],
    },
    setSelectedItems: (items) => {
      editor.loadScene((items as string[])[0]);
    },
    getItemName: (item) => {
      if (item.getId() === "<document>") return "<document>";
      return item.getItemData().name;
    },
    isItemFolder: (item) => false,
    onDrop(items, target) {
      //
    },
    dataLoader: {
      getItem(itemId) {
        return scenesmap[itemId];
      },
      getChildren: (itemId) => {
        if (itemId === "<document>") {
          return scenes.map((s) => s.id);
        }
        return [];
      },
    },
    features: [
      syncDataLoaderFeature,
      selectionFeature,
      dragAndDropFeature,
      renamingFeature,
    ],
  });

  useEffect(() => {
    tree.rebuildTree();
  }, [scenes]);

  return (
    <Tree tree={tree} indent={0}>
      {tree.getItems().map((item) => {
        const scene = item.getItemData();
        if (!scene) return null;
        const isRenaming = item.isRenaming();
        return (
          <SceneItemContextMenuWrapper
            scene_id={scene.id}
            key={scene.id}
            onStartRenaming={() => {
              setTimeout(() => {
                item.startRenaming();
              }, 200);
            }}
          >
            <TreeItem
              item={item}
              className="group/item w-full py-0.5"
              data-is-renaming={isRenaming}
            >
              <TreeItemLabel
                className={cn("h-full bg-transparent p-0!")}
                onDoubleClick={() => {
                  item.startRenaming();
                }}
              >
                <NameInput
                  isRenaming={isRenaming}
                  initialValue={scene.name}
                  onValueCommit={(name) => {
                    editor.renameScene(scene.id, name);
                    tree.abortRenaming();
                  }}
                  className="font-normal h-8 text-xs! px-2! py-1.5!"
                />
              </TreeItemLabel>
            </TreeItem>
          </SceneItemContextMenuWrapper>
        );
      })}
    </Tree>
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
  const actions = useContextMenuActions([node_id]);

  const ActionItem = ({ action }: { action: ContextMenuAction }) => (
    <ContextMenuItem
      onSelect={action.onSelect}
      disabled={action.disabled}
      className="text-xs"
    >
      {action.label}
      {action.shortcut && (
        <ContextMenuShortcut>{action.shortcut}</ContextMenuShortcut>
      )}
    </ContextMenuItem>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        <ActionItem action={actions.copy} />
        <ActionItem
          action={{
            label: "Rename",
            onSelect: onStartRenaming || (() => {}),
            disabled: !onStartRenaming,
          }}
        />
        <ActionItem action={actions.flatten} />
        <ContextMenuSeparator />
        <ActionItem action={actions.bringToFront} />
        <ActionItem action={actions.sendToBack} />
        <ContextMenuSeparator />
        <ActionItem action={actions.groupWithContainer} />
        <ActionItem action={actions.group} />
        <ActionItem action={actions.autoLayout} />
        <ContextMenuSeparator />
        <ActionItem action={actions.zoomToFit} />
        <ContextMenuSeparator />
        <ActionItem action={actions.toggleActive} />
        <ActionItem action={actions.toggleLocked} />
        <ContextMenuSeparator />
        <ActionItem action={actions.delete} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function NodeHierarchyList() {
  const editor = useCurrentEditor();
  const document_ctx = useEditorState(editor, (state) => state.document_ctx);

  const { id, name, children, selection, hovered_node_id } =
    useCurrentSceneState();

  // root item id must be "<root>"
  const tree = useTree<grida.program.nodes.Node>({
    rootItemId: "<root>",
    canReorder: true,
    initialState: {
      selectedItems: selection,
    },
    state: {
      selectedItems: selection,
    },
    setSelectedItems: (items) => {
      editor.select(items as string[]);
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
    onDrop(items, target) {
      const ids = items.map((item) => item.getId());
      const target_id = target.item.getId();
      const index =
        "insertionIndex" in target ? target.insertionIndex : undefined;
      editor.mv(ids, target_id, index);
    },
    indent: 6,
    dataLoader: {
      getItem(itemId) {
        return editor.state.document.nodes[itemId];
      },
      getChildren: (itemId) => {
        if (itemId === "<root>") {
          return children;
        }
        return editor.state.document_ctx.__ctx_nid_to_children_ids[itemId];
      },
    },
    features: [
      syncDataLoaderFeature,
      selectionFeature,
      dragAndDropFeature,
      renamingFeature,
    ],
  });

  useEffect(() => {
    tree.rebuildTree();
  }, [document_ctx]);

  return (
    <Tree tree={tree} indent={6}>
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
              }, 200);
            }}
          >
            <TreeItem
              item={item}
              className="w-full h-7 max-h-7 py-0.5"
              onPointerEnter={() => {
                editor.hoverNode(node.id, "enter");
              }}
              onPointerLeave={() => {
                editor.hoverNode(node.id, "leave");
              }}
            >
              <TreeItemLabel
                className={cn(
                  "h-full px-1 py-1 bg-transparent",
                  isHovered && "bg-accent"
                )}
              >
                <div
                  className="flex items-center gap-2 min-w-0 flex-1"
                  onDoubleClick={() => {
                    item.startRenaming();
                  }}
                >
                  <NodeTypeIcon node={node} className="size-3 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <NameInput
                      isRenaming={isRenaming}
                      initialValue={node.name}
                      onValueCommit={(name) => {
                        editor.changeNodeName(node.id, name);
                        tree.abortRenaming();
                      }}
                      className="px-1 py-0.5 font-normal text-[11px]"
                    />
                  </div>
                </div>
                <div
                  aria-label="actions"
                  className="items-center gap-2 px-2 hidden shrink-0 group-hover/item:flex group-data-[renaming=true]/item:hidden"
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      editor.toggleNodeLocked(node.id);
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
                      editor.toggleNodeActive(node.id);
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

/**
 * A specialized input component for renaming nodes in the hierarchy tree.
 *
 * This component has complex event handling due to several requirements:
 * 1. It needs to handle Enter key submission while preventing other global handlers from intercepting it
 * 2. It needs to properly handle blur events for both clicking outside and pressing Enter
 * 3. It needs to prevent event bubbling that might trigger parent handlers
 *
 * The implementation uses multiple layers of event handling:
 * - A form wrapper to handle native form submission
 * - A capture-phase event listener to intercept events before they reach other handlers
 * - React's synthetic event handlers for standard input behavior
 *
 * This complexity is necessary because:
 * - The tree component might have its own keyboard handlers
 * - The application might have global keyboard shortcuts
 * - We need to ensure the rename operation completes properly in all scenarios
 */
function NameInput({
  isRenaming,
  initialValue,
  onValueChange,
  onValueCommit,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "ref" | "value"> & {
  isRenaming?: boolean;
  initialValue: string;
  onValueChange?: (name: string) => void;
  onValueCommit?: (name: string) => void;
}) {
  const isInitiallyFocused = useRef(false);
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);

  // Standard input change handler
  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      props.onChange?.(e);
      setValue(e.target.value);
      onValueChange?.(e.target.value);
    },
    [onValueChange, props.onChange]
  );

  // Handle blur events (clicking outside, tabbing out, etc.)
  const onBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      isInitiallyFocused.current = false;
      props.onBlur?.(e);
      onValueCommit?.(value);
    },
    [onValueCommit, value, props.onBlur]
  );

  // Handle keyboard events, particularly Enter and Escape
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        e.stopPropagation();
        onValueCommit?.(value);
        ref.current?.blur();
        return;
      }

      if (e.key === "Escape") {
        ref.current?.blur();
        return;
      }

      props.onKeyDown?.(e);
    },
    [onValueCommit, value, props.onKeyDown]
  );

  // Set up capture-phase event listener to intercept events before they reach other handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        e.stopPropagation();
        onValueCommit?.(value);
        ref.current?.blur();
      }
    };

    const input = ref.current;
    if (input) {
      // Using capture phase (true) to intercept events before they reach other handlers
      input.addEventListener("keydown", handleKeyDown, true);
    }

    return () => {
      if (input) {
        input.removeEventListener("keydown", handleKeyDown, true);
      }
    };
  }, [ref.current, initialValue, onValueCommit, value]);

  useEffect(() => {
    if (!isRenaming) return;
    const input = ref.current;
    if (input && !isInitiallyFocused.current) {
      input.focus();
      input.select();
      isInitiallyFocused.current = true;
    }
  }, [ref.current, isRenaming]);

  return (
    <div className="w-full min-w-0">
      {isRenaming ? (
        <input
          type="text"
          {...props}
          ref={ref}
          value={value}
          className={cn(
            "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex w-full min-w-0 rounded-md border bg-transparent px-3 py-1 shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            className
          )}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onClick={(e) => {
            e.stopPropagation();
            props.onClick?.(e);
          }}
        />
      ) : (
        <div className={cn("flex w-full min-w-0 items-center", className)}>
          <span className="truncate">{value}</span>
        </div>
      )}
    </div>
  );
}

//

export function ScenesGroup() {
  const editor = useCurrentEditor();

  return (
    <SidebarGroup
      onContextMenu={(e) => e.preventDefault()}
      className="min-h-16 max-h-56 overflow-y-auto"
    >
      <SidebarGroupLabel>
        Scenes
        <SidebarGroupAction onClick={() => editor.createScene()}>
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

export function NodeHierarchyGroup() {
  return (
    <SidebarGroup className="flex-1" onContextMenu={(e) => e.preventDefault()}>
      <SidebarGroupLabel>Layers</SidebarGroupLabel>
      <SidebarGroupContent>
        <NodeHierarchyList />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
