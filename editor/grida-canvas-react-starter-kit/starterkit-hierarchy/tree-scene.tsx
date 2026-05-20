"use client";

/**
 * Scenes list — flat, single-select, reorder-only. Driven by
 * `@grida/tree-view` (`TreeController`) over the editor's `scenes_ref`.
 * No nesting (scenes aren't containers) and no reversal, so the drag math
 * maps straight through; a `move` intent becomes `reorderScenes`.
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useCurrentEditor, useEditorState } from "@/grida-canvas-react";
import {
  Tree,
  TreeItem,
  TreeItemLabel,
  TreeDragLine,
} from "@/components/ui-editor/tree";
import {
  TreeController,
  passedDragThreshold,
  placementFromY,
  type DragHandle,
  type DropPlacement,
} from "@grida/tree-view";
import { TreeProvider, useTree, useTreeSnapshot } from "@grida/tree-view/react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/components/lib/utils";
import { NameInput } from "./tree-item-name-input";
import { EditorTreeSource } from "./tree-source";
import grida from "@grida/schema";

const DOCUMENT_ROOT = "<document>";

type SceneEntry = grida.program.nodes.SceneNode & {
  children_refs: string[];
};

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
  const { scenesmap } = useEditorState(editor, (state) => {
    const scenesmap: Record<string, SceneEntry> =
      state.document.scenes_ref.reduce(
        (acc: Record<string, SceneEntry>, scene_id: string) => {
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
        {} as Record<string, SceneEntry>
      );

    return {
      scenesmap,
      scenes_ref: state.document.scenes_ref,
    };
  });
  const scene_id = useEditorState(editor, (state) => state.scene_id);

  const source = useMemo(
    () =>
      new EditorTreeSource<grida.program.nodes.SceneNode>({
        root: DOCUMENT_ROOT,
        getChildIds: (id) =>
          id === DOCUMENT_ROOT ? editor.state.document.scenes_ref : [],
        getMeta: (id) =>
          id === DOCUMENT_ROOT
            ? undefined
            : (editor.state.document.nodes[id] as
                | grida.program.nodes.SceneNode
                | undefined),
        isContainer: () => false,
      }),
    [editor]
  );
  const controller = useMemo(
    () => new TreeController<grida.program.nodes.SceneNode>({ source }),
    [source]
  );
  useEffect(() => () => controller.dispose(), [controller]);

  // Drive the snapshot off the editor's change stream — the wasm backend
  // keeps `state.document` referentially stable, so a `useEditorState`-dep
  // effect would never re-fire on scene insert/reorder/rename.
  useEffect(() => {
    source.refresh();
    return editor.doc.subscribeWithSelector(
      (s) => s.document,
      () => source.refresh()
    );
  }, [editor, source]);

  // `move` intent → reorder. `to.index` is the post-removal document-order
  // index into `<document>`'s children, i.e. `scenes_ref` minus the
  // dragged scenes — exactly the old onDrop math.
  useEffect(() => {
    return controller.subscribe("intent", (intent) => {
      if (intent.kind !== "move" || intent.to.parent !== DOCUMENT_ROOT) return;
      const refs = editor.state.document.scenes_ref;
      const ids = intent.items.filter((i) => refs.includes(i));
      if (ids.length === 0) return;
      const draggedSet = new Set(ids);
      const remaining = refs.filter((rid) => !draggedSet.has(rid));
      const at = Math.max(0, Math.min(intent.to.index, remaining.length));
      editor.commands.reorderScenes([
        ...remaining.slice(0, at),
        ...ids,
        ...remaining.slice(at),
      ]);
    });
  }, [controller, editor]);

  return (
    <TreeProvider controller={controller}>
      <ScenesListInner scenesmap={scenesmap} sceneId={scene_id} />
    </TreeProvider>
  );
}

function ScenesListInner({
  scenesmap,
  sceneId,
}: {
  scenesmap: Record<string, SceneEntry>;
  sceneId: string | null | undefined;
}) {
  const editor = useCurrentEditor();
  const controller = useTree<grida.program.nodes.SceneNode>();
  const rows = useTreeSnapshot((c) => c.getRows());
  const isDragging = useTreeSnapshot((c) => c.getDrag() !== null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{
    overId: string;
    side: DropPlacement;
  } | null>(null);
  const [dragLineTop, setDragLineTop] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragHandle | null>(null);
  const pendingRef = useRef<{
    id: string;
    x: number;
    y: number;
    pointerId: number;
  } | null>(null);

  // Scroll the active scene into view.
  useEffect(() => {
    if (!sceneId) return;
    controller.focus(sceneId);
    requestAnimationFrame(() => {
      containerRef.current
        ?.querySelector<HTMLElement>(
          `[data-tree-row-id="${CSS.escape(sceneId)}"]`
        )
        ?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        });
    });
  }, [controller, sceneId]);

  const hitTest = useCallback(
    (clientY: number): { overId: string; side: DropPlacement } | null => {
      const container = containerRef.current;
      if (!container) return null;
      const els = Array.from(
        container.querySelectorAll<HTMLElement>("[data-tree-row-id]")
      );
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (clientY < r.top || clientY > r.bottom) continue;
        return {
          overId: el.dataset.treeRowId!,
          side: placementFromY(clientY - r.top, r.height, { into: false }),
        };
      }
      return null;
    },
    []
  );

  useEffect(() => {
    const THRESHOLD_PX = 4;
    const onMove = (e: PointerEvent) => {
      const pending = pendingRef.current;
      if (pending && pending.pointerId === e.pointerId && !dragRef.current) {
        if (
          !passedDragThreshold(
            pending.x,
            pending.y,
            e.clientX,
            e.clientY,
            THRESHOLD_PX
          )
        )
          return;
        dragRef.current = controller.startDrag([pending.id]);
      }
      const handle = dragRef.current;
      if (!handle) return;
      const hit = hitTest(e.clientY);
      if (!hit) {
        setDrop(null);
        return;
      }
      const resolved = handle.over(hit.overId, hit.side);
      setDrop(resolved ? hit : null);
    };
    const onUp = () => {
      if (dragRef.current) {
        controller.commitDrag();
        dragRef.current = null;
      }
      pendingRef.current = null;
      setDrop(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [controller, hitTest]);

  const onRowPointerDown = useCallback((id: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    pendingRef.current = {
      id,
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
    };
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !drop) {
      setDragLineTop(null);
      return;
    }
    const el = container.querySelector<HTMLElement>(
      `[data-tree-row-id="${CSS.escape(drop.overId)}"]`
    );
    if (!el) {
      setDragLineTop(null);
      return;
    }
    setDragLineTop(
      el.offsetTop + (drop.side === "after" ? el.offsetHeight : 0)
    );
  }, [drop]);

  return (
    <Tree
      ref={containerRef}
      indent={0}
      className="relative"
      data-dragging={isDragging ? "" : undefined}
    >
      {rows.map((row) => {
        const scene = scenesmap[row.id];
        if (!scene) return null;
        const isRenaming = renamingId === scene.id;
        return (
          <SceneItemContextMenuWrapper
            scene_id={scene.id}
            key={scene.id}
            onStartRenaming={() => {
              setTimeout(() => setRenamingId(scene.id), 200);
            }}
          >
            <TreeItem
              level={row.depth}
              selected={sceneId === scene.id}
              renaming={isRenaming}
              dragTarget={drop?.overId === scene.id}
              className="group/item h-7 max-h-7 w-full py-0.5"
              data-tree-row-id={scene.id}
              onClick={() => editor.commands.loadScene(scene.id)}
              onPointerDown={(e) => onRowPointerDown(scene.id, e)}
            >
              <TreeItemLabel
                className={cn(
                  "h-full bg-transparent px-1!",
                  "!outline-none !ring-0"
                )}
                onDoubleClick={() => setRenamingId(scene.id)}
              >
                <NameInput
                  isRenaming={isRenaming}
                  initialValue={scene.name}
                  onValueCommit={(name) => {
                    editor.commands.renameScene(scene.id, name);
                    setRenamingId(null);
                  }}
                  className="px-1 py-0.5 text-[11px] font-normal"
                />
              </TreeItemLabel>
            </TreeItem>
          </SceneItemContextMenuWrapper>
        );
      })}
      <TreeDragLine top={dragLineTop} />
    </Tree>
  );
}
