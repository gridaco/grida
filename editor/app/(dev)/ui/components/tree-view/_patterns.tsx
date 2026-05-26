"use client";

// Pattern panels — one minimal worked example per controller capability.
// Each panel is the smallest demo that exercises a single primitive: selection,
// keyboard, drag constraints, virtualization, custom data sources.

import {
  TreeController,
  allOf,
  defaultKeymap,
  disallowDescendant,
  modeFromEvent,
  onlyIntoContainers,
  type Keymap,
  type Row,
  type TreeIntent,
} from "@grida/tree-view";
import { useTree, useTreeSnapshot } from "@grida/tree-view/react";
import { BoxIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import * as React from "react";
import {
  buildDeepFixture,
  buildLargeFixture,
  buildLayersFixture,
  type DemoMeta,
} from "./_fixtures";
import { DemoPanel, useDemoController } from "./_panel";
import { VirtualPanel } from "./_virtual-panel";

function useControllerForLayers(opts?: {
  constraint?: Parameters<typeof allOf>[0];
}) {
  return useDemoController(
    () =>
      new TreeController<DemoMeta>({
        source: buildLayersFixture(),
        constraint: opts?.constraint ? allOf(opts.constraint) : undefined,
        flatten: { reverseChildren: false },
        expanded: ["frame-1", "frame-1-content", "group-1"],
      })
  );
}

// Graphics-tool subset: arrow keys nudge on the canvas in the real editor,
// so the tree view leaves left/right and up/down alone.
const graphicsKeymap: Keymap = {
  ...defaultKeymap,
  ArrowUp: undefined,
  ArrowDown: undefined,
  ArrowLeft: undefined,
  ArrowRight: undefined,
};

export function PlainHierarchy() {
  const controller = useControllerForLayers();
  return (
    <div className="w-full max-w-md">
      <DemoPanel controller={controller} keymap={defaultKeymap} />
    </div>
  );
}

export function MultiSelect() {
  const controller = useControllerForLayers();
  const selection = useSelectionStr(controller);
  return (
    <div className="w-full max-w-md space-y-2">
      <DemoPanel controller={controller} keymap={defaultKeymap} />
      <div className="text-xs text-gray-600">
        <span className="font-mono">{selection}</span>
      </div>
    </div>
  );
}

export function KeyboardNav() {
  const leftController = useControllerForLayers();
  const rightController = useControllerForLayers();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
      <Labelled label="defaultKeymap">
        <DemoPanel controller={leftController} keymap={defaultKeymap} />
      </Labelled>
      <Labelled label="graphics-tool subset (no arrows)">
        <DemoPanel controller={rightController} keymap={graphicsKeymap} />
      </Labelled>
    </div>
  );
}

export function ConstraintsPanel() {
  const controller = useControllerForLayers({
    constraint: allOf(onlyIntoContainers(), disallowDescendant()),
  });
  const [lastIntent, setLastIntent] = React.useState<TreeIntent | null>(null);
  return (
    <div className="w-full max-w-md space-y-2">
      <DemoPanel
        controller={controller}
        keymap={defaultKeymap}
        enableDrag
        onIntent={setLastIntent}
      />
      <IntentLog intent={lastIntent} />
    </div>
  );
}

export function MoveCopyPanel() {
  const controller = useControllerForLayers();
  const [intents, setIntents] = React.useState<TreeIntent[]>([]);
  return (
    <div className="w-full max-w-md space-y-2">
      <DemoPanel
        controller={controller}
        keymap={defaultKeymap}
        enableDrag
        onIntent={(i) => setIntents((prev) => [i, ...prev].slice(0, 5))}
      />
      <div className="text-xs text-gray-600">
        Last intents (newest first). Hold `Alt`/`Option` while dragging to flip
        to `copy`.
      </div>
      <ul className="text-xs font-mono space-y-1">
        {intents.map((i, idx) => (
          <li key={idx} className="text-gray-700">
            {summarizeIntent(i)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VirtualizedPanel() {
  const { controller, count } = React.useMemo(() => {
    const fix = buildLargeFixture(10000);
    const ctrl = new TreeController<DemoMeta>({
      source: fix.source as unknown as TreeController<DemoMeta>["source"],
      expanded: fix.rootChildren,
    });
    return { controller: ctrl, count: 10000 };
  }, []);
  React.useEffect(() => () => controller.dispose(), [controller]);
  return (
    <div className="w-full max-w-md space-y-2">
      <VirtualPanel controller={controller} />
      <div className="text-xs text-gray-600">
        ~{count.toLocaleString()} rows total, every group pre-expanded.
        Scrolling renders only the visible window.
      </div>
    </div>
  );
}

export function DeepVirtualizedPanel() {
  const { controller, count, maxDepth, minInnerWidth } = React.useMemo(() => {
    const fix = buildDeepFixture({ groups: 100, depth: 100 });
    const ctrl = new TreeController<DemoMeta>({
      source: fix.source as unknown as TreeController<DemoMeta>["source"],
      expanded: fix.expanded,
    });
    // Spacer width = 4 + depth × 12. Reserve another ~220 px for the sticky
    // content cluster. With depth 99 the deepest row reaches ≈ 1412 px.
    const inner = 4 + fix.maxDepth * 12 + 220;
    return {
      controller: ctrl,
      count: fix.total,
      maxDepth: fix.maxDepth,
      minInnerWidth: inner,
    };
  }, []);
  React.useEffect(() => () => controller.dispose(), [controller]);
  return (
    <div className="w-full max-w-md space-y-2">
      <VirtualPanel
        controller={controller}
        minInnerWidth={minInnerWidth}
        renderRow={(row, meta) => <FigmaDeepRow row={row} meta={meta} />}
      />
      <div className="text-xs text-gray-600">
        {count.toLocaleString()} rows, max depth {maxDepth}. The row is split
        into an indent <em>spacer</em> and a <code>position: sticky</code>{" "}
        content cluster — the cluster floats at the right edge of the visible
        viewport until the indent scrolls far enough that the natural position
        catches up (Figma layers-panel pattern).
      </div>
    </div>
  );
}

export function GuidesPanel() {
  const controller = useControllerForLayers();
  return (
    <div className="w-full max-w-md">
      <DemoPanel controller={controller} keymap={defaultKeymap} guides />
    </div>
  );
}

// ─── Local helpers ──────────────────────────────────────────────────────────

/**
 * Figma-style deep row: an indent *spacer* defines the natural row width, and
 * a `position: sticky; right: 0` *content cluster* keeps the chevron + icon +
 * label visible even when the natural position is scrolled off the right
 * edge. Pure CSS — the SDK ships no row components.
 */
function FigmaDeepRow({ row, meta }: { row: Row; meta: DemoMeta | undefined }) {
  const controller = useTree<DemoMeta>();
  const selected = useTreeSnapshot((c) => c.getSelection().includes(row.id));
  const label = meta?.label ?? row.id;
  const indentPx = 4 + row.depth * 12;
  return (
    <div
      data-tree-row-id={row.id}
      data-row-depth={row.depth}
      data-state={selected ? "selected" : "idle"}
      role="treeitem"
      aria-selected={selected}
      onClick={(e) => {
        controller.focus(row.id);
        controller.select([row.id], modeFromEvent(e));
      }}
      className="relative flex h-7 items-center text-xs select-none cursor-default data-[state=selected]:bg-blue-100 data-[state=idle]:hover:bg-zinc-50"
    >
      <span aria-hidden style={{ width: indentPx, flexShrink: 0 }} />
      <span className="sticky right-0 inline-flex items-center gap-1 pr-2 pl-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (row.isContainer) controller.toggle(row.id);
          }}
          aria-hidden={!row.isContainer}
          className="inline-flex size-4 items-center justify-center text-zinc-400 hover:text-zinc-700"
        >
          {row.isContainer ? (
            row.isExpanded ? (
              <ChevronDownIcon className="size-3" />
            ) : (
              <ChevronRightIcon className="size-3" />
            )
          ) : null}
        </button>
        <BoxIcon className="size-3.5 text-zinc-500" />
        <span className="truncate whitespace-nowrap">{label}</span>
      </span>
    </div>
  );
}

function Labelled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-500">{label}</div>
      {children}
    </div>
  );
}

function useSelectionStr(controller: TreeController<DemoMeta>) {
  const [str, setStr] = React.useState("(none)");
  React.useEffect(() => {
    const update = () => {
      const s = controller.getSelection();
      setStr(s.length === 0 ? "(none)" : `[${s.join(", ")}]`);
    };
    update();
    return controller.subscribe("selection", update);
  }, [controller]);
  return str;
}

function IntentLog({ intent }: { intent: TreeIntent | null }) {
  return (
    <div className="text-xs font-mono text-gray-700">
      {intent ? summarizeIntent(intent) : "no intent yet"}
    </div>
  );
}

function summarizeIntent(i: TreeIntent): string {
  switch (i.kind) {
    case "move":
    case "copy":
      return `${i.kind}([${i.items.join(", ")}]) → ${i.to.placement} ${i.to.over} (parent=${i.to.parent}, index=${i.to.index})`;
    case "rename":
      return `rename(${i.id})`;
    case "delete":
      return `delete([${i.ids.join(", ")}])`;
    case "activate":
      return `activate(${i.id})`;
  }
}
