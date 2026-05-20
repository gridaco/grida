"use client";

import {
  disallowDescendant,
  InMemoryTreeSource,
  passedDragThreshold,
  placementFromY,
  TreeController,
} from "@grida/tree-view";
import { TreeProvider, useTree, useTreeSnapshot } from "@grida/tree-view/react";
import { useMemo } from "react";

type Meta = { label?: string };

const source = new InMemoryTreeSource<Meta>({
  root: "<root>",
  showRoot: false,
  nodes: [
    { id: "<root>", parent: null, children: ["fruits"] },
    {
      id: "fruits",
      parent: "<root>",
      children: ["apple", "banana"],
      meta: { label: "🍎 Fruits" },
    },
    { id: "apple", parent: "fruits", children: [], meta: { label: "Apple" } },
    { id: "banana", parent: "fruits", children: [], meta: { label: "Banana" } },
  ],
});

function Row({ id, depth }: { id: string; depth: number }) {
  const c = useTree<Meta>();
  const sel = useTreeSnapshot((c) => c.getSelection().includes(id));
  const exp = useTreeSnapshot((c) => c.isExpanded(id));
  const drop = useTreeSnapshot((c) => {
    const p = c.getDrag()?.getPosition();
    return p?.over === id ? p.placement : "none";
  });
  const node = c.source.getNode(id);
  const folder = node.children.length > 0;
  const onPointerDown = (e: React.PointerEvent) => {
    const x0 = e.clientX,
      y0 = e.clientY;
    let drag: ReturnType<typeof c.startDrag> | null = null;
    const onMove = (ev: PointerEvent) => {
      if (!drag && passedDragThreshold(x0, y0, ev.clientX, ev.clientY, 4))
        drag = c.startDrag([id]);
      const row =
        drag &&
        (
          document.elementFromPoint(
            ev.clientX,
            ev.clientY
          ) as HTMLElement | null
        )?.closest<HTMLElement>("[data-tree-row]");
      if (!row || !drag) return;
      const r = row.getBoundingClientRect();
      drag.over(
        row.dataset.treeRow!,
        placementFromY(ev.clientY - r.top, r.height)
      );
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!drag) {
        c.select([id], "replace");
        if (folder) (exp ? c.collapse : c.expand).call(c, id);
        return;
      }
      const intent = c.commitDrag();
      if (intent) source.applyIntent(intent);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  return (
    <div
      data-tree-row={id}
      data-state={sel ? "selected" : "idle"}
      data-drop={drop}
      onPointerDown={onPointerDown}
      style={{ paddingLeft: depth * 16 + 8 }}
      className="relative cursor-pointer select-none touch-none rounded py-1 text-sm hover:bg-zinc-100 data-[state=selected]:bg-blue-100 data-[drop=into]:ring-2 data-[drop=into]:ring-inset data-[drop=into]:ring-blue-400"
    >
      {folder ? (exp ? "▾ " : "▸ ") : "  "}
      {node.meta?.label ?? id}
    </div>
  );
}

function Tree() {
  const rows = useTreeSnapshot((c) => c.getRows());
  return rows.map((r) => <Row key={r.id} id={r.id} depth={r.depth} />);
}

export default function QuickStartLite() {
  const controller = useMemo(
    () =>
      new TreeController({
        source,
        expanded: ["fruits"],
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
