"use client";

import React, { useMemo, useEffect } from "react";
import { useCurrentEditor, useEditorState } from "@/grida-canvas-react";
import { Tree, TreeItem, TreeItemLabel } from "@/components/ui-editor/tree";
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
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/components/lib/utils";
import { toReversedCopy } from "./utils";
import { NameInput } from "./tree-item-name-input";
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
  const scenes_count = useEditorState(
    editor,
    (state) => state.document.scenes_ref.length
  );

  // a11y/bug prevent scene from being deleted if len === 1
  const is_last_scene = scenes_count === 1;

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
            editor.commands.duplicateScene(scene_id);
          }}
          className="text-xs"
        >
          Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            editor.commands.deleteScene(scene_id);
          }}
          disabled={is_last_scene}
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
  const { scenesmap, scenes_ref } = useEditorState(editor, (state) => {
    // Build scenes map from scenes_ref for backward compatibility
    const scenesmap: Record<string, grida.program.nodes.SceneNode> =
      state.document.scenes_ref.reduce(
        (acc: any, scene_id: string) => {
          const scene_node = state.document.nodes[
            scene_id
          ] as grida.program.nodes.SceneNode;
          const children_refs = state.document.links[scene_id] || [];
          acc[scene_id] = {
            ...scene_node,
            children_refs,
          };
          return acc;
        },
        {} as { [key: string]: grida.program.nodes.SceneNode }
      );

    return {
      scenesmap,
      scenes_ref: state.document.scenes_ref,
    };
  });
  const scene_id = useEditorState(editor, (state) => state.scene_id);

  const scenes = useMemo(() => {
    return Object.values(scenesmap).sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );
  }, [scenesmap]);

  const tree = useTree<grida.program.nodes.SceneNode>({
    rootItemId: "<document>",
    canReorder: true,
    initialState: {
      selectedItems: scene_id ? [scene_id] : [],
    },
    state: {
      selectedItems: scene_id ? [scene_id] : [],
    },
    setSelectedItems: (items) => {
      editor.commands.loadScene((items as string[])[0]);
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
          return toReversedCopy(scenes.map((s) => s.id));
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

  // Focus and scroll to selected scene when it changes
  useEffect(() => {
    if (!scene_id || !tree) return;

    const selectedItem = tree
      .getItems()
      .find((item) => item.getId() === scene_id);

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
  }, [scene_id, tree]);

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
              className="group/item h-7 max-h-7 w-full py-0.5"
              data-is-renaming={isRenaming}
            >
              <TreeItemLabel
                className={cn("h-full bg-transparent px-1!")}
                onDoubleClick={() => {
                  item.startRenaming();
                }}
              >
                <NameInput
                  isRenaming={isRenaming}
                  initialValue={scene.name}
                  onValueCommit={(name) => {
                    editor.commands.renameScene(scene.id, name);
                    tree.abortRenaming();
                  }}
                  className="px-1 py-0.5 text-[11px] font-normal"
                />
              </TreeItemLabel>
            </TreeItem>
          </SceneItemContextMenuWrapper>
        );
      })}
    </Tree>
  );
}
