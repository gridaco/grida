import { useMemo, useEffect } from "react";
import {
  TreeController,
  applySelection,
  type SelectionAdapter,
  type TreeSource,
  type TreeNode as GTVTreeNode,
  type NodeId,
} from "@grida/tree-view";
import { useSvgEditor } from "@grida/svg-editor/react";
import type { SvgEditor } from "@grida/svg-editor";
import { tagLabel } from "./node-type-map";

const TAG_LABEL_RESOLVER = (tag: string) => tagLabel(tag);

export type SvgNodeMeta = {
  tag: string;
  /** Authored `id=` attribute (if any). */
  name?: string;
};

/**
 * Bridges the SVG editor to `@grida/tree-view`.
 *
 * - Topology + meta come straight off `editor.tree()` (already
 *   reference-stable across non-structural emits).
 * - `getVersion` returns `state.structure_version` so the controller's
 *   row cache is keyed on actual tree changes — drag-time attribute
 *   writes don't invalidate it.
 * - `subscribe` filters editor emissions down to structure changes for
 *   the same reason.
 * - `getLabel` reuses the editor's `display_label` (with our local
 *   `tagLabel` map for friendlier names).
 *
 * `getNode` adapts the editor's TreeNode shape (`{tag, name, parent,
 * children}`) into the tree-view shape (`{parent, children, meta}`)
 * with a WeakMap cache keyed on the underlying editor node — same
 * reference in / same reference out, so the React snapshot stays
 * `Object.is` stable.
 */
class SvgTreeSource implements TreeSource<SvgNodeMeta> {
  private editor: SvgEditor;
  private nodeCache = new WeakMap<object, GTVTreeNode<SvgNodeMeta>>();

  constructor(editor: SvgEditor) {
    this.editor = editor;
  }

  getRoot(): NodeId {
    return this.editor.tree().root;
  }

  getNode(id: NodeId): GTVTreeNode<SvgNodeMeta> {
    const en = this.editor.tree().nodes.get(id);
    if (!en) throw new Error(`[svg-tree] unknown node: ${id}`);
    const cached = this.nodeCache.get(en as unknown as object);
    if (cached) return cached;
    const node: GTVTreeNode<SvgNodeMeta> = {
      id: en.id,
      parent: en.parent,
      children: en.children,
      meta: { tag: en.tag, name: en.name },
    };
    this.nodeCache.set(en as unknown as object, node);
    return node;
  }

  getVersion(): number {
    return this.editor.state.structure_version;
  }

  subscribe(listener: () => void): () => void {
    let last = this.editor.state.structure_version;
    return this.editor.subscribe(() => {
      const next = this.editor.state.structure_version;
      if (next !== last) {
        last = next;
        listener();
      }
    });
  }

  getLabel(id: NodeId): string {
    return this.editor.display_label(id, { tagLabel: TAG_LABEL_RESOLVER });
  }

  showRoot(): boolean {
    // The `<svg>` root is part of the visible hierarchy in this editor.
    return true;
  }
}

/**
 * Selection adapter that routes through the SVG editor's commands.
 *
 * `tree-view` modes are richer than the editor's (`range` doesn't exist
 * on `cmd.select`), so we resolve `range`/`add`/`toggle`/`replace` with
 * the package's pure `applySelection` helper and commit the result with
 * a single `replace` — the editor stays the source of truth.
 */
function makeSvgSelectionAdapter(editor: SvgEditor): SelectionAdapter {
  return {
    get() {
      return editor.state.selection;
    },
    set(ids, mode) {
      const next = applySelection(editor.state.selection, ids, mode);
      editor.commands.select(next, { mode: "replace" });
    },
    subscribe(listener) {
      let last = editor.state.selection;
      return editor.subscribe(() => {
        const now = editor.state.selection;
        if (now !== last) {
          last = now;
          listener();
        }
      });
    },
  };
}

/**
 * Build a `TreeController` bound to the current `SvgEditor`. Rebuilt
 * whenever the editor instance changes (e.g. slides demo remounting
 * the provider per page); disposed on cleanup.
 */
export function useSvgTreeController(): TreeController<SvgNodeMeta> {
  const editor = useSvgEditor();
  const controller = useMemo(() => {
    const source = new SvgTreeSource(editor);
    const selection = makeSvgSelectionAdapter(editor);
    // Layer-panel convention: top-of-list = last in document order.
    return new TreeController<SvgNodeMeta>({
      source,
      selection,
      flatten: { reverseChildren: true },
    });
  }, [editor]);

  // Default to fully-expanded for the freshly loaded document.
  useEffect(() => {
    const ids: NodeId[] = [];
    const tree = editor.tree();
    for (const id of tree.nodes.keys()) ids.push(id);
    controller.setExpanded(ids);
    let lastLoad = editor.state.load_version;
    const unsub = editor.subscribe(() => {
      const v = editor.state.load_version;
      if (v !== lastLoad) {
        lastLoad = v;
        const next: NodeId[] = [];
        for (const id of editor.tree().nodes.keys()) next.push(id);
        controller.setExpanded(next);
      }
    });
    return unsub;
  }, [editor, controller]);

  useEffect(() => () => controller.dispose(), [controller]);

  return controller;
}
