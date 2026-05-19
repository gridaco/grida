"use client";

import {
  disallowDescendant,
  type DropPlacement,
  InMemoryTreeSource,
  passedDragThreshold,
  placementFromY,
  TreeController,
} from "@grida/tree-view";
import { TreeProvider, useTree, useTreeSnapshot } from "@grida/tree-view/react";
import * as React from "react";

type Meta = { label?: string };

const source = new InMemoryTreeSource<Meta>({
  root: "<root>",
  showRoot: false,
  nodes: [
    { id: "<root>", parent: null, children: ["fruits", "veggies", "pantry"] },

    // 🍎 Fruits
    {
      id: "fruits",
      parent: "<root>",
      children: ["apple", "banana", "cherry", "mango"],
      meta: { label: "🍎 Fruits" },
    },
    { id: "apple", parent: "fruits", children: [], meta: { label: "Apple" } },
    { id: "banana", parent: "fruits", children: [], meta: { label: "Banana" } },
    { id: "cherry", parent: "fruits", children: [], meta: { label: "Cherry" } },
    { id: "mango", parent: "fruits", children: [], meta: { label: "Mango" } },

    // 🥕 Vegetables
    {
      id: "veggies",
      parent: "<root>",
      children: ["carrot", "broccoli", "spinach"],
      meta: { label: "🥕 Vegetables" },
    },
    {
      id: "carrot",
      parent: "veggies",
      children: [],
      meta: { label: "Carrot" },
    },
    {
      id: "broccoli",
      parent: "veggies",
      children: [],
      meta: { label: "Broccoli" },
    },
    {
      id: "spinach",
      parent: "veggies",
      children: [],
      meta: { label: "Spinach" },
    },

    // 🥖 Pantry — has a nested folder so the demo shows depth
    {
      id: "pantry",
      parent: "<root>",
      children: ["spices", "rice", "pasta"],
      meta: { label: "🥖 Pantry" },
    },
    {
      id: "spices",
      parent: "pantry",
      children: ["salt", "pepper", "cinnamon"],
      meta: { label: "🧂 Spices" },
    },
    { id: "salt", parent: "spices", children: [], meta: { label: "Salt" } },
    { id: "pepper", parent: "spices", children: [], meta: { label: "Pepper" } },
    {
      id: "cinnamon",
      parent: "spices",
      children: [],
      meta: { label: "Cinnamon" },
    },
    { id: "rice", parent: "pantry", children: [], meta: { label: "Rice" } },
    { id: "pasta", parent: "pantry", children: [], meta: { label: "Pasta" } },
  ],
});

function Row({ id, depth }: { id: string; depth: number }) {
  // Per-row snapshots return primitives → Object.is-stable → this row only
  // re-renders when its own slice changes.
  const c = useTree<Meta>();
  const selected = useTreeSnapshot<Meta, boolean>((c) =>
    c.getSelection().includes(id)
  );
  const expanded = useTreeSnapshot<Meta, boolean>((c) => c.isExpanded(id));
  const dropState = useTreeSnapshot<Meta, DropPlacement | "none">((c) => {
    const p = c.getDrag()?.getPosition();
    return p?.over === id ? p.placement : "none";
  });
  const node = c.source.getNode(id);
  const isFolder = node.children.length > 0;

  // Track the active pointer cleanup so unmount-mid-drag doesn't leave
  // listeners stuck on `window`.
  const cleanupRef = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => cleanupRef.current?.(), []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let drag: ReturnType<TreeController<Meta>["startDrag"]> | null = null;

    const onMove = (ev: PointerEvent) => {
      if (
        !drag &&
        passedDragThreshold(startX, startY, ev.clientX, ev.clientY, 4)
      ) {
        drag = c.startDrag([id]);
      }
      if (!drag) return;
      const rowEl = (
        document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      )?.closest<HTMLElement>("[data-tree-row]");
      if (!rowEl) return;
      const overId = rowEl.dataset.treeRow!;
      const rect = rowEl.getBoundingClientRect();
      drag.over(overId, placementFromY(ev.clientY - rect.top, rect.height));
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      cleanupRef.current = null;
    };

    const onUp = () => {
      cleanup();
      if (!drag) {
        c.select([id], "replace");
        if (isFolder) {
          if (expanded) c.collapse(id);
          else c.expand(id);
        }
        return;
      }
      // `commitDrag` (over the raw `drag.drop()`) clears the controller's
      // active drag and emits on the channel, so the row indicators clear
      // the moment we release.
      const intent = c.commitDrag();
      if (intent) source.applyIntent(intent);
    };

    cleanupRef.current = cleanup;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      data-tree-row={id}
      data-state={selected ? "selected" : "idle"}
      data-drop={dropState}
      onPointerDown={onPointerDown}
      style={{ paddingLeft: depth * 16 + 8 }}
      className={[
        "relative cursor-pointer select-none touch-none rounded py-1 text-sm text-zinc-800",
        "hover:bg-zinc-100 data-[state=selected]:bg-blue-100 data-[state=selected]:text-blue-900",
        // Drop indicator: 2px line at top/bottom edge, or a ring for "into".
        "data-[drop=before]:before:absolute data-[drop=before]:before:inset-x-0 data-[drop=before]:before:-top-px data-[drop=before]:before:h-0.5 data-[drop=before]:before:bg-blue-500",
        "data-[drop=after]:after:absolute data-[drop=after]:after:inset-x-0 data-[drop=after]:after:-bottom-px data-[drop=after]:after:h-0.5 data-[drop=after]:after:bg-blue-500",
        "data-[drop=into]:ring-2 data-[drop=into]:ring-inset data-[drop=into]:ring-blue-400",
      ].join(" ")}
    >
      <span className="mr-1 inline-block w-3 text-zinc-400">
        {isFolder ? (expanded ? "▾" : "▸") : ""}
      </span>
      {node.meta?.label ?? id}
    </div>
  );
}

function Tree() {
  const rows = useTreeSnapshot<
    Meta,
    ReturnType<TreeController<Meta>["getRows"]>
  >((c) => c.getRows());
  return rows.map((r) => <Row key={r.id} id={r.id} depth={r.depth} />);
}

export default function QuickStartExample() {
  const controller = React.useMemo(
    () =>
      new TreeController<Meta>({
        source,
        expanded: ["fruits", "pantry"],
        // Refuse drops that would create a cycle (folder into its own child).
        constraint: disallowDescendant(),
      }),
    []
  );
  return (
    <TreeProvider controller={controller}>
      <Tree />
    </TreeProvider>
  );
}
