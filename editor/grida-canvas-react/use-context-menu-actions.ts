import { useCallback, useMemo } from "react";
import { useCurrentEditor, useEditorState } from "./use-editor";
import { useDataTransferEventTarget } from "./provider";
import { supportsFlatten } from "@/grida-canvas/reducers/methods/flatten";
import grida from "@grida/schema";

export interface ContextMenuAction {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onSelect: () => void;
}

type ContextMenuActionType =
  | "copy"
  | "paste"
  | "bringToFront"
  | "sendToBack"
  | "groupWithContainer"
  | "group"
  | "ungroup"
  | "autoLayout"
  | "flatten"
  | "planarize"
  | "toggleActive"
  | "zoomToFit"
  | "toggleLocked"
  | "delete";

export type ContextMenuActions = Record<
  ContextMenuActionType,
  ContextMenuAction
>;

export function useContextMenuActions(ids: string[]): ContextMenuActions {
  const editor = useCurrentEditor();
  const { insertText } = useDataTransferEventTarget();

  const nodes = useEditorState(editor, (s) => {
    const map: Record<string, { type: grida.program.nodes.NodeType }> = {};
    ids.forEach((id) => {
      map[id] = { type: s.document.nodes[id].type };
    });
    return map;
  });

  const hasSelection = ids.length > 0;
  const canFlatten =
    hasSelection && ids.every((id) => supportsFlatten(nodes[id]));

  const canUngroup =
    hasSelection &&
    ids.some(
      (id) => nodes[id].type === "group" || nodes[id].type === "boolean"
    );

  const canPlanarize =
    hasSelection && ids.every((id) => nodes[id].type === "vector");

  const targetSingleOrSelection =
    ids.length === 1 ? (ids[0] as string) : "selection";

  const handlePaste = useCallback(async () => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      if (clipboardItems.length > 0) {
        for (const clipboardItem of clipboardItems) {
          if (clipboardItem.types.includes("text/plain")) {
            const blob = await clipboardItem.getType("text/plain");
            const text = await blob.text();
            insertText(text, {
              clientX: window.innerWidth / 2,
              clientY: window.innerHeight / 2,
            });
            return;
          }
        }
      }
      editor.paste();
    } catch (e) {}
  }, [editor, insertText]);

  return useMemo<ContextMenuActions>(
    () => ({
      copy: {
        label: "Copy",
        disabled: !hasSelection,
        onSelect: () =>
          editor.copy(
            hasSelection && ids.length === 1 ? (ids[0] as string) : "selection"
          ),
      },
      paste: {
        label: "Paste",
        onSelect: handlePaste,
      },
      bringToFront: {
        label: "Bring to front",
        shortcut: "]",
        disabled: !hasSelection,
        onSelect: () => editor.order(targetSingleOrSelection, "front"),
      },
      sendToBack: {
        label: "Send to back",
        shortcut: "[",
        disabled: !hasSelection,
        onSelect: () => editor.order(targetSingleOrSelection, "back"),
      },
      groupWithContainer: {
        label: "Group with Container",
        shortcut: "⌥⌘G",
        disabled: !hasSelection,
        onSelect: () => editor.contain(ids),
      },
      group: {
        label: "Group",
        shortcut: "⌘G",
        disabled: !hasSelection,
        onSelect: () => editor.group(ids),
      },
      ungroup: {
        label: "Ungroup",
        shortcut: "⌘⇧G",
        disabled: !canUngroup,
        onSelect: () => editor.ungroup(ids),
      },
      autoLayout: {
        label: "Auto-Layout",
        shortcut: "⇧A",
        disabled: !hasSelection,
        onSelect: () => editor.autoLayout(ids),
      },
      flatten: {
        label: "Flatten",
        shortcut: "⌘E",
        disabled: !canFlatten,
        onSelect: () =>
          editor.flatten(
            hasSelection && ids.length === 1 ? (ids[0] as string) : "selection"
          ),
      },
      planarize: {
        label: "Planarize",
        disabled: !canPlanarize,
        onSelect: () => editor.planarize(ids),
      },
      toggleActive: {
        label: "Set Active/Inactive",
        shortcut: "⌘⇧H",
        disabled: !hasSelection,
        onSelect: () => {
          ids.forEach((id) => editor.toggleNodeActive(id));
        },
      },
      zoomToFit: {
        label: "Zoom to fit",
        shortcut: "⇧1",
        disabled: !hasSelection,
        onSelect: () => editor.fit(ids, { margin: 64, animate: true }),
      },
      toggleLocked: {
        label: "Lock/Unlock",
        shortcut: "⌘⇧L",
        disabled: !hasSelection,
        onSelect: () => {
          ids.forEach((id) => editor.toggleNodeLocked(id));
        },
      },
      delete: {
        label: "Delete",
        shortcut: "⌫",
        disabled: !hasSelection,
        onSelect: () =>
          editor.deleteNode(
            hasSelection && ids.length === 1 ? (ids[0] as string) : "selection"
          ),
      },
    }),
    [
      ids,
      editor,
      handlePaste,
      hasSelection,
      canFlatten,
      targetSingleOrSelection,
    ]
  );
}
