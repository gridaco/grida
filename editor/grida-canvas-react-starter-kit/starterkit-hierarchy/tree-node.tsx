"use client";

/**
 * Hierarchy UI Components for Grida Canvas Editor
 *
 * This module provides tree-based hierarchy components for managing scenes and nodes
 * in the Grida Canvas editor. It includes auto-expansion and focus functionality
 * similar to VSCode and Figma, where selecting an item automatically:
 *
 * 1. Expands all parent folders to make the selected item visible
 * 2. Focuses the selected item in the tree
 * 3. Scrolls the item into view with smooth animation
 *
 * Features:
 * - UX-friendly auto-expansion that preserves user's manual expansion state
 * - Automatic calculation of required expanded items based on selection
 * - Smooth scrolling to bring selected items into view
 * - Performance optimized with dependency-based updates
 * - Consistent behavior across both scenes and node hierarchies
 *
 * Implementation Approach:
 * - Uses useMemo to calculate which parent folders need to be expanded
 * - Preserves user's manual expansion/collapse actions
 * - Combines required expansions with user preferences
 * - Provides immediate, predictable expansion behavior without auto-collapse
 *
 * UX Design Principles:
 * - Auto-expand: Automatically expands parent folders to reveal selected items
 * - No auto-collapse: Never collapses folders that users have manually expanded
 * - State preservation: Maintains user's expansion preferences across selection changes
 * - Clean design: Simple, predictable behavior that feels natural
 *
 * The implementation uses the headless-tree library which provides:
 * - expandedItems state management for declarative expansion control
 * - setExpandedItems callback to track user actions
 * - item.setFocused() - focuses an item
 * - item.scrollTo() - scrolls an item into view
 * - Dependency-based state updates for optimal performance
 */

import React, { useState, useMemo, useEffect } from "react";
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
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  LockClosedIcon,
  EyeOpenIcon,
  EyeClosedIcon,
  LockOpen1Icon,
} from "@radix-ui/react-icons";
import { useCurrentSceneState } from "@/grida-canvas-react/provider";
import { NodeTypeIcon } from "@/grida-canvas-react-starter-kit/starterkit-icons/node-type-icon";
import { cn } from "@/components/lib/utils";
import grida from "@grida/schema";
import { resolveDropInsertionIndex, toReversedCopy } from "./utils";
import { NameInput } from "./tree-item-name-input";

function NodeHierarchyItemContextMenuWrapper({
  node_id,
  children,
  onStartRenaming,
}: React.PropsWithChildren<{
  node_id: string;
  onStartRenaming?: () => void;
}>) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        <__ContextMenuContent
          node_id={node_id}
          onStartRenaming={onStartRenaming}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function __ContextMenuContent({
  node_id,
  onStartRenaming,
}: {
  node_id: string;
  onStartRenaming?: () => void;
}) {
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
    <>
      <ActionItem action={actions.copy} />
      <ContextMenuSub>
        <ContextMenuSubTrigger className="text-xs">
          Copy/Paste as...
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ActionItem action={actions.copyAsSVG} />
          <ActionItem action={actions.copyAsPNG} />
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ActionItem
        action={{
          label: "Rename",
          onSelect: onStartRenaming || (() => {}),
          disabled: !onStartRenaming,
        }}
      />
      <ActionItem action={actions.flatten} />
      {actions.removeMask.disabled ? (
        <ActionItem action={actions.groupMask} />
      ) : (
        <ActionItem action={actions.removeMask} />
      )}
      <ContextMenuSeparator />
      <ActionItem action={actions.bringToFront} />
      <ActionItem action={actions.sendToBack} />
      <ContextMenuSeparator />
      <ActionItem action={actions.group} />
      <ActionItem action={actions.ungroup} />
      <ActionItem action={actions.groupWithContainer} />
      <ActionItem action={actions.autoLayout} />
      <ContextMenuSeparator />
      <ActionItem action={actions.zoomToFit} />
      <ContextMenuSeparator />
      <ActionItem action={actions.toggleActive} />
      <ActionItem action={actions.toggleLocked} />
      <ContextMenuSeparator />
      <ActionItem action={actions.delete} />
    </>
  );
}

export function NodeHierarchyList() {
  const editor = useCurrentEditor();
  const document_ctx = useEditorState(editor, (state) => state.document_ctx);

  const { id, name, children, selection, hovered_node_id } =
    useCurrentSceneState();

  // Track user's manual expansion state - preserve across selection changes
  const [userExpandedItems, setUserExpandedItems] = useState<string[]>([]);

  // Calculate which items need to be expanded to show the selected items
  const requiredExpandedItems = useMemo(() => {
    if (!selection.length) return [];

    const expandedItems = new Set<string>();

    // Helper function to get all parent IDs for a given node ID
    const getParentIds = (nodeId: string): string[] => {
      const parentIds: string[] = [];
      let currentId = nodeId;

      // Walk up the tree to find all parent IDs
      while (currentId) {
        const node = editor.state.document.nodes[currentId];
        if (!node) break;

        // Find the parent of this node
        const parentId = Object.keys(
          editor.state.document_ctx.__ctx_nid_to_children_ids
        ).find((parentId) =>
          editor.state.document_ctx.__ctx_nid_to_children_ids[
            parentId
          ]?.includes(currentId)
        );

        if (parentId && parentId !== "<root>") {
          parentIds.push(parentId);
          currentId = parentId;
        } else {
          break;
        }
      }

      return parentIds;
    };

    // For each selected item, add all its parent IDs to the expanded set
    selection.forEach((selectedId) => {
      const parentIds = getParentIds(selectedId);
      parentIds.forEach((parentId) => expandedItems.add(parentId));
    });

    return Array.from(expandedItems);
  }, [
    selection,
    editor.state.document.nodes,
    editor.state.document_ctx.__ctx_nid_to_children_ids,
  ]);

  // Combine user's manual expansions with required expansions
  const allExpandedItems = useMemo(() => {
    const combined = new Set([...userExpandedItems, ...requiredExpandedItems]);
    return Array.from(combined);
  }, [userExpandedItems, requiredExpandedItems]);

  // root item id must be "<root>"
  const tree = useTree<grida.program.nodes.Node>({
    rootItemId: "<root>",
    canReorder: true,
    initialState: {
      selectedItems: selection,
      expandedItems: allExpandedItems,
    },
    state: {
      selectedItems: selection,
      expandedItems: allExpandedItems,
    },
    setSelectedItems: (items) => {
      editor.select(items as string[]);
    },
    setExpandedItems: (items) => {
      // Track user's manual expansion/collapse actions
      setUserExpandedItems(items);
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
      const index = resolveDropInsertionIndex({
        target,
        draggedItemIds: ids,
        getActualChildren: (parentId) => {
          if (parentId === "<root>") {
            return children ?? [];
          }
          return editor.state.document_ctx.__ctx_nid_to_children_ids[parentId];
        },
        inversed: true,
      });
      editor.mv(ids, target_id, index);
    },
    indent: 6,
    dataLoader: {
      getItem(itemId) {
        return editor.state.document.nodes[itemId];
      },
      getChildren: (itemId) => {
        if (itemId === "<root>") {
          return toReversedCopy(children);
        }
        return toReversedCopy(
          editor.state.document_ctx.__ctx_nid_to_children_ids[itemId]
        );
      },
    },
    features: [
      syncDataLoaderFeature,
      selectionFeature,
      dragAndDropFeature,
      renamingFeature,
    ],
  });

  // Initialize user expanded items from the tree's current state when it's first available
  useEffect(() => {
    if (tree && userExpandedItems.length === 0) {
      // Get all currently expanded items from the tree
      const currentExpanded = tree
        .getItems()
        .filter((item) => item.isExpanded())
        .map((item) => item.getId());
      setUserExpandedItems(currentExpanded);
    }
  }, [tree, userExpandedItems.length]);

  // Focus and scroll to selected items when they become available
  useEffect(() => {
    if (!selection.length || !tree) return;

    // Get the first selected item
    const selectedItemId = selection[0];
    const selectedItem = tree
      .getItems()
      .find((item) => item.getId() === selectedItemId);

    if (selectedItem) {
      // Focus the selected item
      selectedItem.setFocused();

      // Scroll the item into view with smooth behavior
      selectedItem.scrollTo({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [selection, tree, allExpandedItems]);

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
