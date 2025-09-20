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
