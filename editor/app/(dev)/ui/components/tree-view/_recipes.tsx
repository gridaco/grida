"use client";

/**
 * Recipe panels — prototypes for FAQ / feature-request items raised in the
 * pedantic-review pass. Each panel demonstrates how an adopter would wire
 * the feature today *without* SDK changes. The verdict (stay consumer-side
 * vs. graduate to SDK) is recorded in the section copy on page.tsx.
 */

import {
  defaultKeymap,
  findByLabelPrefix,
  InMemoryTreeSource,
  modeFromEvent,
  nextFocusAfterRemove,
  TreeController,
  type DropPlacement,
  type NodeId,
  type TreeIntent,
  type TreeNode,
} from "@grida/tree-view";
import { useTree, useTreeSnapshot } from "@grida/tree-view/react";
import * as React from "react";
import { buildLayersFixture, type DemoMeta } from "./_fixtures";
import { DemoPanel, useDemoController, type RenderRowArgs } from "./_panel";

// ─── shared helpers ────────────────────────────────────────────────────────

function useLayersController(opts?: { expanded?: NodeId[] }) {
  return useDemoController(
    () =>
      new TreeController<DemoMeta>({
        source: buildLayersFixture(),
        expanded: opts?.expanded ?? ["frame-1", "frame-1-content", "group-1"],
      })
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. Inline rename
// ═══════════════════════════════════════════════════════════════════════════
//
// Wires `rename` intent → input overlay → commit/cancel.
//
// What the consumer owns:
//   - The `<input>` element (design-system-shaped).
//   - Mounting / focus / blur / Esc / Enter routing.
//   - Disabling the tree keymap while editing (Enter would re-emit `rename`,
//     ArrowUp would steal focus).
//   - Committing the new label to its own source.
//
// Pain points surfaced:
//   1. Keymap arbitration: need to pass `keymap={null}` while editing,
//      otherwise Enter inside the input bubbles to the tree handler and
//      re-fires `rename`. Trivial guard with React state, but every
//      consumer reinvents it.
//   2. Focus restoration on commit: after blur/Enter, focus must return
//      to the tree container (else Tab navigation breaks). `controller.
//      focus(id)` is the controller-side focus, but DOM focus belongs to
//      the consumer.
//
// Verdict (proposed): stay consumer-side. The recipe is ~30 lines. A
// helper like `controller.setKeymapEnabled(false)` would shave 3 lines
// but would also blur the responsibility line.
export function InlineRenamePanel() {
  const controller = useLayersController();
  const [editingId, setEditingId] = React.useState<NodeId | null>(null);

  // Subscribe to rename intents. The controller never mutates source —
  // it just tells you the user asked for it.
  React.useEffect(() => {
    return controller.subscribe("intent", (intent) => {
      if (intent.kind === "rename") setEditingId(intent.id);
    });
  }, [controller]);

  const commit = React.useCallback(
    (id: NodeId, nextLabel: string) => {
      const source = controller.source as InMemoryTreeSource<DemoMeta>;
      const prev = source.getNode(id).meta ?? ({ kind: "rect" } as DemoMeta);
      source.setMeta(id, { ...prev, label: nextLabel });
      setEditingId(null);
    },
    [controller]
  );

  const cancel = React.useCallback(() => setEditingId(null), []);

  return (
    <div className="w-full max-w-md space-y-2">
      <DemoPanel
        controller={controller}
        // Disable the tree keymap while an input is mounted — otherwise
        // Enter inside the input bubbles up and re-fires `rename`.
        keymap={editingId ? null : defaultKeymap}
        renderRow={(args) => (
          <RenameRow
            args={args}
            editing={args.row.id === editingId}
            onCommit={(label) => commit(args.row.id, label)}
            onCancel={cancel}
          />
        )}
      />
      <p className="text-xs text-gray-600">
        Focus a row, hit <kbd>Enter</kbd> (or <kbd>F2</kbd>) to rename. The
        package emits a <code>rename</code> intent; the consumer mounts the
        input.
      </p>
    </div>
  );
}

function RenameRow({
  args,
  editing,
  onCommit,
  onCancel,
}: {
  args: RenderRowArgs;
  editing: boolean;
  onCommit: (label: string) => void;
  onCancel: () => void;
}) {
  const controller = useTree<DemoMeta>();
  const meta = useTreeSnapshot<DemoMeta, DemoMeta | undefined>(
    (c) => c.source.getNode(args.row.id).meta
  );
  const label = meta?.label ?? args.row.id;
  const selected = useTreeSnapshot((c) =>
    c.getSelection().includes(args.row.id)
  );

  return (
    <div
      data-tree-row-id={args.row.id}
      data-row-depth={args.row.depth}
      role="treeitem"
      aria-selected={selected}
      onClick={(e) => {
        if (editing) return;
        controller.focus(args.row.id);
        controller.select([args.row.id], modeFromEvent(e));
      }}
      onDoubleClick={() => controller.emitRenameIntent(args.row.id)}
      className={[
        "relative flex h-7 items-center gap-1 px-1 text-xs select-none cursor-default",
        selected ? "bg-blue-100 text-blue-900" : "hover:bg-gray-50",
      ].join(" ")}
      style={{ paddingLeft: 4 + args.row.depth * 12 }}
    >
      <span className="inline-flex size-4 items-center justify-center text-muted-foreground">
        {args.row.isContainer ? "▾" : ""}
      </span>
      {editing ? (
        <RenameInput initial={label} onCommit={onCommit} onCancel={onCancel} />
      ) : (
        <span className="truncate">{label}</span>
      )}
    </div>
  );
}

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = React.useState(initial);
  const ref = React.useRef<HTMLInputElement | null>(null);
  React.useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        // Stop arrows from bubbling — otherwise the (now-disabled) tree
        // keymap is moot but other ancestors might grab them.
        e.stopPropagation();
        if (e.key === "Enter") onCommit(value.trim() || initial);
        else if (e.key === "Escape") onCancel();
      }}
      onBlur={() => onCommit(value.trim() || initial)}
      className="flex-1 min-w-0 h-5 px-1 text-xs bg-white border border-blue-400 rounded outline-none"
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 11. Multi-select drag rule
// ═══════════════════════════════════════════════════════════════════════════
//
// "If the grabbed row is part of the current selection, drag the whole
// selection; else drag just the grabbed row."
//
// This is the Figma / VS Code / Finder rule. The opposite rule (always
// drag just the grabbed row) is the Windows Explorer rule.
//
// The recipe is one line inside the pointer-down → startDrag bridge —
// see `_panel.tsx` line ~304:
//
//   const sel = controller.getSelection();
//   const items = sel.includes(pending.id) ? sel : [pending.id];
//   controller.startDrag(items, { mode });
//
// Verdict: already shipped as the demo's reference wiring. The SDK
// can't bake this in because the consumer owns the pointer-down handler
// and the selection adapter. Document the snippet in the README.
export function MultiSelectDragPanel() {
  const controller = useLayersController();
  const [lastIntent, setLastIntent] = React.useState<TreeIntent | null>(null);
  return (
    <div className="w-full max-w-md space-y-2">
      <DemoPanel
        controller={controller}
        keymap={defaultKeymap}
        enableDrag
        onIntent={setLastIntent}
      />
      <p className="text-xs text-gray-600">
        Cmd/Ctrl-click two or three rows, then drag any of them. The intent
        below shows <code>items</code> = full selection. Drag an unselected row
        — <code>items</code> = just that row.
      </p>
      <div className="text-xs font-mono text-gray-700">
        {lastIntent &&
        (lastIntent.kind === "move" || lastIntent.kind === "copy")
          ? `${lastIntent.kind}([${lastIntent.items.join(", ")}])`
          : "no drag yet"}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 12. Focus restoration after delete
// ═══════════════════════════════════════════════════════════════════════════
//
// When the user deletes the focused row(s), focus must move somewhere
// sensible — IDE convention is: next visible sibling → previous → parent.
//
// The package now ships `nextFocusAfterRemove(rows, removed)` as a pure
// helper. Snapshot the row order *before* mutating (the rows are gone
// after `source.remove`), call the helper, then re-focus.
//
// Verdict: graduated. Consumer recipe collapses to 5 lines.
export function FocusAfterDeletePanel() {
  const controller = useLayersController();

  React.useEffect(() => {
    return controller.subscribe("intent", (intent) => {
      if (intent.kind !== "delete") return;
      const source = controller.source as InMemoryTreeSource<DemoMeta>;
      const next = nextFocusAfterRemove(controller.getRows(), intent.ids);
      for (const id of intent.ids) if (source.has(id)) source.remove(id);
      controller.focus(next);
      controller.select(next ? [next] : [], "replace");
    });
  }, [controller]);

  return (
    <div className="w-full max-w-md space-y-2">
      <DemoPanel controller={controller} keymap={defaultKeymap} />
      <p className="text-xs text-gray-600">
        Click a row, then press <kbd>Delete</kbd>. Focus jumps to the next
        visible row (or previous if at the end). Multi-select with Shift then
        Delete to remove a range — focus lands on the row after the range.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 13. Type-ahead search
// ═══════════════════════════════════════════════════════════════════════════
//
// WAI-ARIA tree pattern: typing a letter (or a sequence within a short
// window) jumps focus to the first row whose label starts with the
// buffer. Re-typing the same first letter cycles through matches.
//
// The package now ships `findByLabelPrefix(rows, prefix, opts)` as a
// pure helper. The consumer owns the *buffer* (a short-lived string with
// a ~500 ms inactivity reset) — that's input state, not tree state.
//
// Verdict: graduated. Consumer recipe collapses to one helper call.
export function TypeAheadPanel() {
  const controller = useLayersController();
  const bufferRef = React.useRef("");
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const handled = controller.keyDown(e.nativeEvent, defaultKeymap);
    if (handled.handled) {
      e.preventDefault();
      return;
    }
    if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
    bufferRef.current += e.key;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => (bufferRef.current = ""), 500);

    // On a single-char buffer, advance past the current focus so repeated
    // presses cycle. On multi-char buffer, stay anchored.
    const focused = controller.getFocused();
    const startAfterId = bufferRef.current.length === 1 ? focused : null;
    const match = findByLabelPrefix(controller.getRows(), bufferRef.current, {
      startAfterId,
      getLabel: (id) =>
        controller.source.getLabel?.(id) ??
        (controller.source.getNode(id).meta as DemoMeta | undefined)?.label ??
        id,
    });
    if (match) {
      controller.focus(match);
      e.preventDefault();
    }
  };

  return (
    <div className="w-full max-w-md space-y-2">
      <div
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="outline-none focus:ring-2 focus:ring-blue-300 rounded"
      >
        <DemoPanel controller={controller} keymap={null} />
      </div>
      <p className="text-xs text-gray-600">
        Focus the panel (click on it), then type <code>he</code> to jump to
        "Heading", <code>m</code> to jump to "Mask group", etc. Re-typing the
        same first letter cycles matches.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 14. Reveal-in-tree
// ═══════════════════════════════════════════════════════════════════════════
//
// "Go to file" / "Find in selection" → expand ancestors → focus → scroll
// into view. The controller now ships `reveal(id, opts?)` for the first
// three; DOM `scrollIntoView` stays with the consumer.
//
// Verdict: graduated. Consumer recipe is the helper call + one DOM line.
export function RevealPanel() {
  const controller = useLayersController({ expanded: [] });

  const reveal = (id: NodeId) => {
    controller.reveal(id);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-tree-row-id="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  const targets: { id: NodeId; label: string }[] = [
    { id: "frame-1-title", label: "Hero / Heading" },
    { id: "group-1-b", label: "Mask group / Rectangle 2" },
    { id: "text-1", label: "Caption" },
  ];

  return (
    <div className="w-full max-w-md space-y-2">
      <div className="flex flex-wrap gap-2">
        {targets.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => reveal(t.id)}
            className="text-xs px-2 py-1 rounded border border-zinc-200 bg-white hover:bg-zinc-50"
          >
            Reveal {t.label}
          </button>
        ))}
      </div>
      <DemoPanel controller={controller} keymap={defaultKeymap} />
      <p className="text-xs text-gray-600">
        Click any button — the panel starts fully collapsed. The recipe is
        <code> expandTo(id) → focus(id) → scrollIntoView </code> in 4 lines.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 15. Drag from outside (palette → tree)
// ═══════════════════════════════════════════════════════════════════════════
//
// A side palette with draggable chips. The user drags a chip into the
// tree; on drop, the consumer inserts a new node at the resolved drop
// position.
//
// Today the SDK has no API for "drag whose source is external."
// `startDrag` requires `items: NodeId[]` — ids that must exist in the
// source. So the demo cannot reuse `controller.startDrag` for an
// external payload.
//
// Workaround the demo uses: a separate "external drag" state in the
// consumer; hit-test using the same DOM walker as the internal drag,
// then call `source.insertChild` on drop. The tree never enters its
// own drag state — there is no drop indicator from the SDK.
//
// Pain points:
//   1. No visual drop indicator — the consumer must render its own.
//   2. Cannot reuse `resolveDropPosition` cleanly because it takes
//      `items: NodeId[]` (for the cycle check) — passing `[]` works,
//      but the consumer has to know that's safe.
//   3. Constraints (onlyIntoContainers, intoNearestAncestor) cannot
//      reason about the external payload because they take `items` of
//      existing node ids.
//
// Verdict: real SDK gap. The right shape is a parallel API —
// `startExternalDrag(payload, opts)` that runs through the same
// hit-test / position-resolve path but skips item-existence checks and
// emits a `create` intent instead of `move`. Roadmap.
export function ExternalDragPanel() {
  const controller = useLayersController();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{
    payload: string;
    pointerId: number;
  } | null>(null);
  const [overInfo, setOverInfo] = React.useState<{
    over: NodeId;
    placement: DropPlacement;
  } | null>(null);

  const palette = ["New rect", "New text", "New folder"];

  const onPaletteDown = (payload: string) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { payload, pointerId: e.pointerId };
  };

  React.useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const treeEl = containerRef.current;
      if (!treeEl) return;
      const rowEls = treeEl.querySelectorAll<HTMLElement>("[data-tree-row-id]");
      let hit: { over: NodeId; placement: DropPlacement } | null = null;
      for (const rowEl of rowEls) {
        const rect = rowEl.getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          const id = rowEl.getAttribute("data-tree-row-id");
          if (!id) continue;
          const dy = e.clientY - rect.top;
          const placement: DropPlacement =
            dy < rect.height * 0.25
              ? "before"
              : dy > rect.height * 0.75
                ? "after"
                : "into";
          hit = { over: id, placement };
          break;
        }
      }
      setOverInfo(hit);
    };
    const onUp = () => {
      const drag = dragRef.current;
      const hit = overInfo;
      dragRef.current = null;
      setOverInfo(null);
      if (!drag || !hit) return;
      const source = controller.source as InMemoryTreeSource<DemoMeta>;
      const newId = `new-${Date.now().toString(36)}`;
      const node: TreeNode<DemoMeta> = {
        id: newId,
        parent:
          hit.placement === "into"
            ? hit.over
            : source.getNode(hit.over).parent!,
        children: [],
        meta: { kind: "rect", label: drag.payload },
      };
      if (hit.placement === "into") {
        source.insertChild(hit.over, node);
        controller.expand(hit.over);
      } else {
        const parent = source.getNode(hit.over).parent!;
        const siblings = source.getNode(parent).children;
        const overIdx = siblings.indexOf(hit.over);
        source.insertChild(
          parent,
          node,
          hit.placement === "before" ? overIdx : overIdx + 1
        );
      }
      controller.focus(newId);
      controller.select([newId], "replace");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [controller, overInfo]);

  const renderRow = React.useCallback(
    (args: RenderRowArgs) => {
      const isExternalDropTarget = overInfo?.over === args.row.id;
      return (
        <ExternalDropRow
          args={args}
          highlight={isExternalDropTarget}
          placement={isExternalDropTarget ? overInfo!.placement : null}
        />
      );
    },
    [overInfo]
  );

  return (
    <div className="w-full max-w-md space-y-2">
      <div className="flex gap-2">
        {palette.map((p) => (
          <button
            key={p}
            type="button"
            onPointerDown={onPaletteDown(p)}
            className="text-xs px-2 py-1 rounded border border-dashed border-zinc-300 bg-zinc-50 cursor-grab active:cursor-grabbing"
          >
            ⊕ {p}
          </button>
        ))}
      </div>
      <div ref={containerRef}>
        <DemoPanel
          controller={controller}
          keymap={defaultKeymap}
          renderRow={renderRow}
        />
      </div>
      <p className="text-xs text-gray-600">
        Drag a chip from the palette into the tree. Drop near the top of a row
        for <em>before</em>, the bottom for <em>after</em>, the middle of a
        container for <em>into</em>. The recipe rebuilds hit-test from scratch
        because <code>startDrag</code> requires existing node ids — that's the
        SDK gap.
      </p>
    </div>
  );
}

function ExternalDropRow({
  args,
  highlight,
  placement,
}: {
  args: RenderRowArgs;
  highlight: boolean;
  placement: DropPlacement | null;
}) {
  const meta = useTreeSnapshot<DemoMeta, DemoMeta | undefined>(
    (c) => c.source.getNode(args.row.id).meta
  );
  const label = meta?.label ?? args.row.id;
  return (
    <div
      data-tree-row-id={args.row.id}
      data-row-depth={args.row.depth}
      role="treeitem"
      className="relative flex h-7 items-center gap-1 px-1 text-xs select-none cursor-default hover:bg-gray-50"
      style={{ paddingLeft: 4 + args.row.depth * 12 }}
    >
      {highlight && placement === "into" && (
        <div className="absolute inset-0 rounded-sm ring-2 ring-emerald-500 pointer-events-none" />
      )}
      {highlight && placement === "before" && (
        <div className="absolute -top-px inset-x-1 h-0.5 bg-emerald-500 pointer-events-none" />
      )}
      {highlight && placement === "after" && (
        <div className="absolute -bottom-px inset-x-1 h-0.5 bg-emerald-500 pointer-events-none" />
      )}
      <span className="inline-flex size-4 items-center justify-center text-muted-foreground">
        {args.row.isContainer ? "▾" : ""}
      </span>
      <span className="truncate">{label}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 16. Decoration overlay (badges from out-of-band store)
// ═══════════════════════════════════════════════════════════════════════════
//
// Real IDE trees decorate rows with badges (git status, problem counts,
// dirty markers) that update independently of topology. Putting them in
// `meta` would force a `source.getVersion()` bump on every decoration
// change, which re-flattens the row list and trashes virtualizer
// memoization.
//
// The recipe: keep decorations in a separate React state / external
// store, key them by NodeId, read them in the row renderer. The tree
// has no idea decorations exist; only the row renderer re-renders.
//
// Verdict: trivial as consumer recipe. The argument for a SDK
// `decorations` channel would be "every consumer needs this exact shape"
// — but the shape (string? badge component? color?) is opinionated.
// Document the pattern.
export function DecorationsPanel() {
  const controller = useLayersController();
  const [decorations, setDecorations] = React.useState<
    Record<NodeId, { kind: "M" | "U" | "A"; color: string }>
  >({
    "frame-1-title": { kind: "M", color: "text-yellow-600" },
    "frame-1-cta": { kind: "U", color: "text-red-600" },
    "group-1-a": { kind: "A", color: "text-emerald-600" },
  });

  const shuffle = () => {
    const rows = controller.getRows();
    const pick = () => rows[Math.floor(Math.random() * rows.length)].id;
    setDecorations({
      [pick()]: { kind: "M", color: "text-yellow-600" },
      [pick()]: { kind: "U", color: "text-red-600" },
      [pick()]: { kind: "A", color: "text-emerald-600" },
    });
  };

  return (
    <div className="w-full max-w-md space-y-2">
      <button
        type="button"
        onClick={shuffle}
        className="text-xs px-2 py-1 rounded border border-zinc-200 bg-white hover:bg-zinc-50"
      >
        Shuffle decorations
      </button>
      <DemoPanel
        controller={controller}
        keymap={defaultKeymap}
        renderRow={(args) => (
          <DecorationRow args={args} badge={decorations[args.row.id]} />
        )}
      />
      <p className="text-xs text-gray-600">
        Decorations live in consumer React state — never touched by{" "}
        <code>TreeSource.getVersion()</code>. Shuffling badges does not
        invalidate the controller's row list.
      </p>
    </div>
  );
}

function DecorationRow({
  args,
  badge,
}: {
  args: RenderRowArgs;
  badge?: { kind: string; color: string };
}) {
  const controller = useTree<DemoMeta>();
  const meta = useTreeSnapshot<DemoMeta, DemoMeta | undefined>(
    (c) => c.source.getNode(args.row.id).meta
  );
  const selected = useTreeSnapshot((c) =>
    c.getSelection().includes(args.row.id)
  );
  return (
    <div
      data-tree-row-id={args.row.id}
      data-row-depth={args.row.depth}
      role="treeitem"
      aria-selected={selected}
      onClick={(e) => {
        controller.focus(args.row.id);
        controller.select([args.row.id], modeFromEvent(e));
      }}
      className={[
        "relative flex h-7 items-center gap-1 px-1 text-xs select-none cursor-default",
        selected ? "bg-blue-100 text-blue-900" : "hover:bg-gray-50",
      ].join(" ")}
      style={{ paddingLeft: 4 + args.row.depth * 12 }}
    >
      <span className="inline-flex size-4 items-center justify-center text-muted-foreground">
        {args.row.isContainer ? "▾" : ""}
      </span>
      <span className="truncate flex-1">{meta?.label ?? args.row.id}</span>
      {badge && (
        <span className={`font-mono text-[10px] ${badge.color}`}>
          {badge.kind}
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 17. Controlled expanded set (persist to localStorage)
// ═══════════════════════════════════════════════════════════════════════════
//
// Adopters often want expand/collapse state to survive reloads. The
// controller already exposes `getExpanded()` (read) and `setExpanded(ids)`
// (write) plus a subscription channel.
//
// The recipe: on mount, hydrate from storage; on every `expanded`
// channel notify, persist.
//
// Verdict: already supported. ~10 lines. Document.
export function PersistedExpandedPanel() {
  const STORAGE_KEY = "tree-view-demo:expanded";

  // Build the controller with the SSR-safe default — reading localStorage
  // here would diverge from the server-rendered HTML and trip React's
  // hydration mismatch warning. The persisted set is applied in the
  // useEffect below, after hydration.
  const controller = useDemoController(
    () =>
      new TreeController<DemoMeta>({
        source: buildLayersFixture(),
        expanded: ["frame-1"],
      })
  );

  // Hydrate from localStorage post-mount.
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) controller.setExpanded(JSON.parse(raw));
    } catch {
      // ignore parse errors
    }
  }, [controller]);

  React.useEffect(() => {
    return controller.subscribe("expanded", () => {
      const ids = Array.from(controller.getExpanded());
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
      } catch {
        // ignore quota errors
      }
    });
  }, [controller]);

  // Surface what we persisted, just for the demo. Subscribed outside the
  // provider — read from the controller directly.
  const [expandedStr, setExpandedStr] = React.useState("(none)");
  React.useEffect(() => {
    const update = () =>
      setExpandedStr(
        Array.from(controller.getExpanded()).sort().join(", ") || "(none)"
      );
    update();
    return controller.subscribe("expanded", update);
  }, [controller]);

  return (
    <div className="w-full max-w-md space-y-2">
      <DemoPanel controller={controller} keymap={defaultKeymap} />
      <p className="text-xs text-gray-600">
        Expand / collapse a few rows, then reload the page — state is persisted
        to <code>localStorage</code>. The controller already exposes{" "}
        <code>getExpanded()</code> /<code>setExpanded()</code> / the{" "}
        <code>expanded</code> channel; the recipe is two effects.
      </p>
      <div className="text-xs font-mono text-gray-700">
        Persisted: <span className="text-zinc-500">{expandedStr}</span>
      </div>
    </div>
  );
}
