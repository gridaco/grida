"use client";

import {
  InMemoryTreeSource,
  intoNearestAncestor,
  modeFromEvent,
  onlyIntoContainers,
  subtreeMembership,
  TreeController,
  type MoveConstraint,
  type NodeId,
  type TreeSource,
} from "@grida/tree-view";
import { useTreeSnapshot } from "@grida/tree-view/react";
import {
  BoxIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleDotIcon,
  Component as ComponentIcon,
  EyeIcon,
  EyeOffIcon,
  FileIcon,
  FileJsonIcon,
  FileTextIcon,
  FileTypeIcon,
  FilmIcon,
  FolderIcon,
  FolderOpenIcon,
  FrameIcon,
  HashIcon,
  ImageIcon,
  LayersIcon,
  LockIcon,
  LockOpenIcon,
  PackageIcon,
  ShapesIcon,
  SquareIcon,
  StarIcon,
  TerminalIcon,
  TypeIcon,
} from "lucide-react";
import * as React from "react";
import {
  buildFigmaFixture,
  buildFinderFixture,
  buildGridaFixture,
  buildVSCodeFixture,
  CONTAINER_KINDS,
  type DemoKind,
  type DemoMeta,
} from "./_fixtures";
import {
  DemoPanel,
  useDemoController,
  useRowSnapshot,
  type RenderRowArgs,
} from "./_panel";

// ───────────────────────────────────────────────────────────────────────────
// Cross-surface hover. The package owns rows / selection / drag — it
// deliberately has no "hover" channel (hover is presentational, per-frame,
// and consumer-specific). The synced-editor showcase needs a tree row and
// its canvas shape to light up together, so the *consumer* lifts one piece
// of hover state and shares it. Default is a no-op: panels rendered without
// a provider (e.g. the dev gallery) behave exactly as before.
// ───────────────────────────────────────────────────────────────────────────

export interface HoverState {
  hovered: NodeId | null;
  setHovered: (id: NodeId | null) => void;
}
export const HoverContext = React.createContext<HoverState>({
  hovered: null,
  setHovered: () => {},
});
export const useHover = (): HoverState => React.useContext(HoverContext);

// ───────────────────────────────────────────────────────────────────────────
// Grouping highlight — see the README "Grouping highlight" section.
//
// Two consumer-side recipes, both built on the package's pure
// `subtreeMembership(source, anchors)` helper:
//
//  1. Selection-aware (Grida / Figma): when a *container* row is selected,
//     its descendants get a faint background so the group's vertical
//     extent is visually obvious. The selected row itself keeps its
//     normal selection style — the highlight is exclusive of the anchor.
//
//  2. Drag-over (VS Code / Finder): while the user drags onto a folder,
//     the folder *and* all visible descendants light up together, so the
//     drop target's reach is unambiguous. Inclusive of the anchor.
//
// Both selectors are memoized per-controller against the relevant inputs
// (source version + selection / drag state). Rows then test membership
// with `set.has(row.id)` — O(1) per row instead of an ancestor walk per
// row per render.
// ───────────────────────────────────────────────────────────────────────────

interface HighlightCacheEntry {
  selectionKey: string;
  selectionSet: ReadonlySet<NodeId>;
  dragKey: string;
  dragSet: ReadonlySet<NodeId>;
}
const EMPTY_SET: ReadonlySet<NodeId> = new Set();
const highlightCache = new WeakMap<
  TreeController<DemoMeta>,
  HighlightCacheEntry
>();

const isContainerKind = (kind: DemoKind | undefined): boolean =>
  !!kind && CONTAINER_KINDS.has(kind);

function selectionSubtree(
  controller: TreeController<DemoMeta>
): ReadonlySet<NodeId> {
  const source = controller.source;
  const sel = controller.getSelection();
  const containerAnchors = sel.filter((id) => {
    try {
      return isContainerKind(source.getNode(id).meta?.kind);
    } catch {
      // Selection can briefly hold ids the source already removed.
      return false;
    }
  });
  const key = `${source.getVersion()}|${containerAnchors.join(",")}`;
  const cached = highlightCache.get(controller);
  if (cached && cached.selectionKey === key) return cached.selectionSet;
  const set = subtreeMembership(source, containerAnchors, {
    inclusive: false,
  });
  highlightCache.set(controller, {
    selectionKey: key,
    selectionSet: set,
    dragKey: cached?.dragKey ?? "",
    dragSet: cached?.dragSet ?? EMPTY_SET,
  });
  return set;
}

function dragOverSubtree(
  controller: TreeController<DemoMeta>
): ReadonlySet<NodeId> {
  const drag = controller.getDrag();
  const pos = drag?.getPosition() ?? null;
  const source = controller.source;
  let key: string;
  let anchor: NodeId | null = null;
  if (!pos) {
    key = `${source.getVersion()}|none`;
  } else {
    // Highlight the resolved drop *parent*, not the over-row. With the
    // `intoFolderOnly` constraint that's already the nearest folder
    // ancestor of whatever the cursor is over.
    if (isContainerKind(source.getNode(pos.parent).meta?.kind)) {
      anchor = pos.parent;
    }
    key = `${source.getVersion()}|${anchor ?? "none"}`;
  }
  const cached = highlightCache.get(controller);
  if (cached && cached.dragKey === key) return cached.dragSet;
  const set: ReadonlySet<NodeId> = anchor
    ? subtreeMembership(source, [anchor], { inclusive: true })
    : EMPTY_SET;
  highlightCache.set(controller, {
    selectionKey: cached?.selectionKey ?? "",
    selectionSet: cached?.selectionSet ?? EMPTY_SET,
    dragKey: key,
    dragSet: set,
  });
  return set;
}

// ───────────────────────────────────────────────────────────────────────────
// Row state machine — drives the `data-state` attribute on each row so the
// per-theme stylesheet can use `data-[state=X]:bg-...` Tailwind variants
// instead of long nested ternaries inside the row component. The states
// are mutually exclusive and listed in priority order:
//
//   drop-target    drag is hovering this container — highest priority,
//                  wins over selection (the user is mid-action)
//   in-drop-group  this row is inside the resolved drop-target subtree
//                  (FS themes only — Grida/Figma intentionally skip)
//   selected       this row is in the selection adapter
//   in-group       this row is inside a selected container's subtree
//                  (Grida/Figma only — the FS themes have no analog)
//   focused        keyboard cursor lives on this row
//   drag           any drag is active and none of the above apply —
//                  suppresses hover so it doesn't fight the drop indicator
//   idle           default
//
// Each theme picks the subset of states that applies to it; the helper
// just resolves the priority chain.
// ───────────────────────────────────────────────────────────────────────────

type RowState =
  | "drop-target"
  | "in-drop-group"
  | "selected"
  | "in-group"
  | "focused"
  | "drag"
  | "idle";

interface RowStateInputs {
  isDropTargetFolder?: boolean;
  inDropGroup?: boolean;
  selected: boolean;
  inSelectionGroup?: boolean;
  focused: boolean;
  isDragActive: boolean;
}

function rowState(s: RowStateInputs): RowState {
  if (s.isDropTargetFolder) return "drop-target";
  if (s.inDropGroup) return "in-drop-group";
  if (s.selected) return "selected";
  if (s.inSelectionGroup) return "in-group";
  if (s.focused) return "focused";
  if (s.isDragActive) return "drag";
  return "idle";
}

export function useThemeController(
  build: () => ReturnType<typeof buildGridaFixture>,
  opts: { expanded: NodeId[]; constraint?: MoveConstraint }
): TreeController<DemoMeta> {
  return useDemoController(
    () =>
      new TreeController<DemoMeta>({
        source: build(),
        flatten: { reverseChildren: false },
        expanded: opts.expanded,
        constraint: opts.constraint,
      })
  );
}

/**
 * Bridge controller intents to the in-memory source's mutators. In a
 * real editor this would route into the editor's own state — for the
 * demo we own the `InMemoryTreeSource` and just delegate to its
 * `applyIntent` helper.
 */
export function applyIntent(
  controller: TreeController<DemoMeta>,
  intent: Parameters<InMemoryTreeSource<DemoMeta>["applyIntent"]>[0]
): void {
  const source = controller.source;
  if (source instanceof InMemoryTreeSource) source.applyIntent(intent);
}

/**
 * Local UI state for per-row toggles (visibility, lock). The package owns
 * tree/selection/drag — the demo owns "what this row's checkbox is set to".
 * In a real editor these would round-trip through the source.
 */
export function useRowFlags(
  initial: (id: NodeId) => { visible: boolean; locked: boolean }
) {
  const [map, setMap] = React.useState<
    Record<NodeId, { visible: boolean; locked: boolean }>
  >({});
  const get = (id: NodeId) => map[id] ?? initial(id);
  const toggle = (id: NodeId, key: "visible" | "locked") => {
    setMap((prev) => {
      const cur = prev[id] ?? initial(id);
      return { ...prev, [id]: { ...cur, [key]: !cur[key] } };
    });
  };
  return { get, toggle };
}

// ───────────────────────────────────────────────────────────────────────────
// Grida — monochrome, neutral, zinc accent (Grida brand is monochrome)
// ───────────────────────────────────────────────────────────────────────────

const gridaIcon = (kind?: DemoKind, selected?: boolean) => {
  const cls = selected ? "size-3.5 text-white" : "size-3.5 text-zinc-500";
  switch (kind) {
    case "frame":
      return <FrameIcon className={cls} />;
    case "group":
      return <LayersIcon className={cls} />;
    case "rect":
      return <SquareIcon className={cls} />;
    case "text":
      return <TypeIcon className={cls} />;
    case "image":
      return <ImageIcon className={cls} />;
    default:
      return <ShapesIcon className={cls} />;
  }
};

export function GridaRow({
  args,
  flags,
}: {
  args: RenderRowArgs;
  flags: ReturnType<typeof useRowFlags>;
}) {
  const {
    row,
    isDropTarget,
    dropPlacement,
    dropDepth,
    isDropParent,
    isDragActive,
    onDragStart,
  } = args;
  const { controller, meta, selected, focused, isDragging } = useRowSnapshot(
    row.id
  );
  // Grouping highlight: when a container ancestor is selected, this row
  // shows a subtle background so the group's vertical extent reads at a
  // glance. The membership Set is panel-level memoized, so this is O(1)
  // per row.
  const inSelectionGroup = useTreeSnapshot<DemoMeta, boolean>((c) =>
    selectionSubtree(c).has(row.id)
  );
  const { hovered, setHovered } = useHover();
  const label = meta?.label ?? row.id;
  const { visible, locked } = flags.get(row.id);
  const dDepth = dropDepth ?? row.depth;
  // Drop-target folder fill: the row gets a backdrop when the resolved
  // drop is happening *inside* it — whether the cursor is on the folder
  // header itself (placement=into) or on one of its descendants
  // (placement=before/after with parent = this folder). The ring
  // overlay below remains tied to a literal `into` hit so it stays a
  // strong "you're about to add to this container" hint.
  const isDropTargetFolder = isDropParent && row.isContainer;
  const state = rowState({
    isDropTargetFolder,
    selected,
    inSelectionGroup,
    focused,
    isDragActive,
  });
  return (
    <div
      data-tree-row-id={row.id}
      data-row-depth={row.depth}
      data-state={state}
      data-dragging={isDragging || undefined}
      data-hidden={!visible || undefined}
      data-hovered={hovered === row.id || undefined}
      role="treeitem"
      aria-selected={selected}
      tabIndex={-1}
      onClick={(e) => {
        controller.focus(row.id);
        controller.select([row.id], modeFromEvent(e));
      }}
      onPointerEnter={() => setHovered(row.id)}
      onPointerLeave={() => setHovered(null)}
      onPointerDown={(e) => {
        if (e.button !== 0 || locked) return;
        onDragStart?.(row.id, e);
      }}
      className="group/row relative flex h-7 items-center gap-1.5 px-2 text-[12px] select-none cursor-default rounded-sm transition-colors data-[state=drop-target]:bg-zinc-100 data-[state=selected]:bg-zinc-900 data-[state=selected]:text-white data-[state=in-group]:bg-zinc-100/80 data-[state=focused]:bg-zinc-100 data-[state=idle]:hover:bg-zinc-50 data-[state=idle]:data-[hovered]:bg-zinc-100 data-[hidden]:opacity-45 data-[state=selected]:opacity-100 data-[dragging]:opacity-40"
      style={{ paddingLeft: 6 + row.depth * 14 }}
    >
      {isDropTarget && dropPlacement === "before" && (
        <DropBar side="top" left={6 + dDepth * 14} color="zinc" />
      )}
      {isDropTarget && dropPlacement === "after" && (
        <DropBar side="bottom" left={6 + dDepth * 14} color="zinc" />
      )}
      {isDropTarget && dropPlacement === "into" && row.isContainer && (
        <div className="absolute inset-0 rounded-sm ring-2 ring-zinc-900 pointer-events-none" />
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (row.isContainer) controller.toggle(row.id);
        }}
        className={`inline-flex size-4 items-center justify-center ${
          selected ? "text-white/80" : "text-zinc-400 hover:text-zinc-700"
        }`}
        aria-hidden={!row.isContainer}
      >
        {row.isContainer ? (
          row.isExpanded ? (
            <ChevronDownIcon className="size-3" />
          ) : (
            <ChevronRightIcon className="size-3" />
          )
        ) : null}
      </button>
      {gridaIcon(meta?.kind, selected)}
      <span className="truncate flex-1">{label}</span>
      <RowFlagButton
        selected={selected}
        onClick={() => flags.toggle(row.id, "visible")}
        title={visible ? "Hide" : "Show"}
        alwaysVisible={!visible}
        theme="grida"
      >
        {visible ? (
          <EyeIcon className="size-3" />
        ) : (
          <EyeOffIcon className="size-3" />
        )}
      </RowFlagButton>
      <RowFlagButton
        selected={selected}
        onClick={() => flags.toggle(row.id, "locked")}
        title={locked ? "Unlock" : "Lock"}
        alwaysVisible={locked}
        theme="grida"
      >
        {locked ? (
          <LockIcon className="size-3" />
        ) : (
          <LockOpenIcon className="size-3" />
        )}
      </RowFlagButton>
    </div>
  );
}

export function GridaThemePanel() {
  const controller = useThemeController(buildGridaFixture, {
    expanded: ["page-home", "hero", "features", "assets"],
    constraint: onlyIntoContainers(),
  });
  const flags = useRowFlags(() => ({ visible: true, locked: false }));
  return (
    <div className="w-full">
      <div className="rounded-lg border border-zinc-200 bg-white p-1 shadow-sm">
        <DemoPanel
          controller={controller}
          enableDrag
          indentBase={6}
          indentStep={14}
          className="h-80 !border-0"
          renderRow={(args) => <GridaRow args={args} flags={flags} />}
          onIntent={(intent) => applyIntent(controller, intent)}
        />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Figma — dark sidebar, blue selection, component purple, eye + lock
// ───────────────────────────────────────────────────────────────────────────

const figmaIcon = (kind?: DemoKind, selected?: boolean) => {
  const base = selected ? "text-white" : "text-neutral-300";
  const purple = selected ? "text-white" : "text-purple-400";
  switch (kind) {
    case "frame":
      return <FrameIcon className={`size-3.5 ${base}`} />;
    case "group":
      return <BoxIcon className={`size-3.5 ${base}`} />;
    case "rect":
      return <SquareIcon className={`size-3.5 ${base}`} />;
    case "text":
      return <TypeIcon className={`size-3.5 ${base}`} />;
    case "image":
      return <ImageIcon className={`size-3.5 ${base}`} />;
    case "component":
      return <ComponentIcon className={`size-3.5 ${purple}`} />;
    case "instance":
      return <ComponentIcon className={`size-3.5 ${purple} opacity-80`} />;
    case "vector":
      return <StarIcon className={`size-3.5 ${base}`} />;
    case "boolean":
      return <ShapesIcon className={`size-3.5 ${base}`} />;
    default:
      return <ShapesIcon className={`size-3.5 ${base}`} />;
  }
};

export function FigmaRow({
  args,
  flags,
}: {
  args: RenderRowArgs;
  flags: ReturnType<typeof useRowFlags>;
}) {
  const {
    row,
    isDropTarget,
    dropPlacement,
    dropDepth,
    isDropParent,
    isDragActive,
    onDragStart,
  } = args;
  const { controller, meta, selected, focused, isDragging } = useRowSnapshot(
    row.id
  );
  // Selection-aware grouping highlight: descendants of a selected
  // container get a faint backdrop so the group's extent is visible.
  const inSelectionGroup = useTreeSnapshot<DemoMeta, boolean>((c) =>
    selectionSubtree(c).has(row.id)
  );
  const { hovered, setHovered } = useHover();
  const label = meta?.label ?? row.id;
  const { visible, locked } = flags.get(row.id);
  const isComponentish =
    meta?.kind === "component" || meta?.kind === "instance";
  const dDepth = dropDepth ?? row.depth;
  // Drop-target folder fill: see GridaRow for the rationale — the row
  // is the resolved drop's parent (a container), so the cursor is
  // landing inside it whether they're hovering the folder itself or
  // one of its children.
  const isDropTargetFolder = isDropParent && row.isContainer;
  const state = rowState({
    isDropTargetFolder,
    selected,
    inSelectionGroup,
    focused,
    isDragActive,
  });
  return (
    <div
      data-tree-row-id={row.id}
      data-row-depth={row.depth}
      data-state={state}
      data-dragging={isDragging || undefined}
      data-hidden={!visible || undefined}
      data-hovered={hovered === row.id || undefined}
      role="treeitem"
      aria-selected={selected}
      tabIndex={-1}
      onClick={(e) => {
        controller.focus(row.id);
        controller.select([row.id], modeFromEvent(e));
      }}
      onPointerEnter={() => setHovered(row.id)}
      onPointerLeave={() => setHovered(null)}
      onPointerDown={(e) => {
        if (e.button !== 0 || locked) return;
        onDragStart?.(row.id, e);
      }}
      className="group/row relative flex h-6 items-center gap-1.5 px-2 text-[11px] select-none cursor-default text-neutral-200 data-[state=drop-target]:bg-[#0D99FF]/30 data-[state=drop-target]:text-neutral-100 data-[state=selected]:bg-[#0D99FF] data-[state=selected]:text-white data-[state=in-group]:bg-[#0D99FF]/15 data-[state=in-group]:text-neutral-100 data-[state=focused]:bg-white/10 data-[state=focused]:text-neutral-100 data-[state=idle]:hover:bg-white/5 data-[state=idle]:data-[hovered]:bg-white/5 data-[hidden]:opacity-50 data-[state=selected]:opacity-100 data-[dragging]:opacity-40"
      style={{ paddingLeft: 8 + row.depth * 16 }}
    >
      {isDropTarget && dropPlacement === "before" && (
        <DropBar side="top" left={8 + dDepth * 16} color="figma" />
      )}
      {isDropTarget && dropPlacement === "after" && (
        <DropBar side="bottom" left={8 + dDepth * 16} color="figma" />
      )}
      {isDropTarget && dropPlacement === "into" && row.isContainer && (
        <div className="absolute inset-0 ring-2 ring-inset ring-[#0D99FF] pointer-events-none" />
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (row.isContainer) controller.toggle(row.id);
        }}
        className={`inline-flex size-3 items-center justify-center ${
          selected ? "text-white/90" : "text-neutral-400 hover:text-neutral-100"
        }`}
      >
        {row.isContainer ? (
          row.isExpanded ? (
            <ChevronDownIcon className="size-3" />
          ) : (
            <ChevronRightIcon className="size-3" />
          )
        ) : null}
      </button>
      {figmaIcon(meta?.kind, selected)}
      <span
        className={`truncate flex-1 ${
          isComponentish && !selected ? "text-purple-300" : ""
        }`}
      >
        {label}
      </span>
      <RowFlagButton
        selected={selected}
        onClick={() => flags.toggle(row.id, "visible")}
        title={visible ? "Hide" : "Show"}
        alwaysVisible={!visible}
        theme="figma"
      >
        {visible ? (
          <EyeIcon className="size-3" />
        ) : (
          <EyeOffIcon className="size-3" />
        )}
      </RowFlagButton>
      <RowFlagButton
        selected={selected}
        onClick={() => flags.toggle(row.id, "locked")}
        title={locked ? "Unlock" : "Lock"}
        alwaysVisible={locked}
        theme="figma"
      >
        {locked ? (
          <LockIcon className="size-3" />
        ) : (
          <LockOpenIcon className="size-3" />
        )}
      </RowFlagButton>
    </div>
  );
}

export function FigmaThemePanel() {
  const controller = useThemeController(buildFigmaFixture, {
    expanded: ["page-1", "frame-iphone", "content", "card-1", "comp-button"],
    constraint: onlyIntoContainers(),
  });
  const flags = useRowFlags((id) => ({
    visible: true,
    locked: id === "tab-bar",
  }));
  return (
    <div className="w-full">
      <div className="rounded-md border border-neutral-700 bg-[#2C2C2C] overflow-hidden shadow-lg">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-neutral-700/60 text-[11px] text-neutral-400 uppercase tracking-wider font-medium">
          <span>Layers</span>
          <span className="text-neutral-500">Page 1</span>
        </div>
        <DemoPanel
          controller={controller}
          enableDrag
          indentBase={8}
          indentStep={16}
          className="h-80 !border-0 !bg-[#2C2C2C]"
          renderRow={(args) => <FigmaRow args={args} flags={flags} />}
          onIntent={(intent) => applyIntent(controller, intent)}
        />
      </div>
    </div>
  );
}

// FS-style drag constraint — files live inside folders, ordering is by
// sort, not user-driven. The package ships `intoNearestAncestor`; we
// just supply the per-demo "is this id a folder?" predicate.

const isFsFolder = (source: TreeSource<DemoMeta>, id: NodeId): boolean =>
  source.getNode(id).meta?.kind === "folder";
export const fsConstraint: MoveConstraint = intoNearestAncestor(
  isFsFolder as never
);

// ───────────────────────────────────────────────────────────────────────────
// VSCode — dark explorer, ext-colored file icons, indent guides
// ───────────────────────────────────────────────────────────────────────────

const vscodeIcon = (meta: DemoMeta | undefined, isExpanded?: boolean) => {
  if (meta?.kind === "folder") {
    return isExpanded ? (
      <FolderOpenIcon className="size-3.5 text-[#DCB67A]" />
    ) : (
      <FolderIcon className="size-3.5 text-[#DCB67A]" />
    );
  }
  const ext = meta?.ext;
  switch (ext) {
    case "ts":
      return <FileTypeIcon className="size-3.5 text-[#3178C6]" />;
    case "tsx":
      return <FileTypeIcon className="size-3.5 text-[#61DAFB]" />;
    case "json":
      return <FileJsonIcon className="size-3.5 text-[#CBCB41]" />;
    case "md":
      return <FileTextIcon className="size-3.5 text-[#519ABA]" />;
    case "css":
      return <HashIcon className="size-3.5 text-[#519ABA]" />;
    case "svg":
      return <ImageIcon className="size-3.5 text-[#E37933]" />;
    case "ico":
      return <ImageIcon className="size-3.5 text-[#CBCB41]" />;
    default:
      return <FileIcon className="size-3.5 text-[#6D6D6D]" />;
  }
};

export function VSCodeRow({ args }: { args: RenderRowArgs }) {
  const { row, isDropTarget, dropPlacement, isDragActive, onDragStart } = args;
  const { controller, meta, selected, focused, isDragging } = useRowSnapshot(
    row.id
  );
  // Drag-over grouping highlight: while dragging onto a folder, the
  // folder *and* every descendant get the highlight, so the drop
  // target's reach is visible at a glance — not just the folder header.
  const inDropGroup = useTreeSnapshot<DemoMeta, boolean>((c) =>
    dragOverSubtree(c).has(row.id)
  );
  const label = meta?.label ?? row.id;
  const isFolder = meta?.kind === "folder";
  // FS drag: the only meaningful drop is `into` a folder. The row that
  // gets highlighted is the resolved target folder, which the constraint
  // walked up from the over-row.
  const isDropTargetFolder =
    isDropTarget && dropPlacement === "into" && isFolder;
  const state = rowState({
    isDropTargetFolder,
    inDropGroup,
    selected,
    focused,
    isDragActive,
  });
  return (
    <div
      data-tree-row-id={row.id}
      data-row-depth={row.depth}
      data-state={state}
      data-dragging={isDragging || undefined}
      role="treeitem"
      aria-selected={selected}
      tabIndex={-1}
      onClick={(e) => {
        controller.focus(row.id);
        controller.select([row.id], modeFromEvent(e));
        if (isFolder) controller.toggle(row.id);
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        onDragStart?.(row.id, e);
      }}
      className="relative flex h-[22px] items-center gap-1 px-1 text-[13px] leading-none select-none cursor-pointer font-normal text-[#CCCCCC] data-[state=drop-target]:bg-[#062F4A] data-[state=drop-target]:ring-1 data-[state=drop-target]:ring-inset data-[state=drop-target]:ring-[#007ACC] data-[state=in-drop-group]:bg-[#062F4A]/55 data-[state=selected]:bg-[#04395E] data-[state=selected]:text-white data-[state=focused]:bg-[#2A2D2E] data-[state=idle]:hover:bg-[#2A2D2E] data-[dragging]:opacity-50"
      style={{ paddingLeft: 8 + row.depth * 14 }}
    >
      {/* indent guides */}
      {Array.from({ length: row.depth }).map((_, i) => (
        <span
          key={i}
          className="absolute top-0 bottom-0 w-px bg-[#404040]"
          style={{ left: 8 + i * 14 + 6 }}
        />
      ))}
      <span className="inline-flex size-3 items-center justify-center text-[#CCCCCC]">
        {isFolder ? (
          row.isExpanded ? (
            <ChevronDownIcon className="size-3" />
          ) : (
            <ChevronRightIcon className="size-3" />
          )
        ) : null}
      </span>
      {vscodeIcon(meta, row.isExpanded)}
      <span className="truncate flex-1">
        {label}
        {meta?.dirty && (
          <CircleDotIcon className="size-2 inline ml-1 text-[#CCCCCC]/60" />
        )}
      </span>
    </div>
  );
}

export function VSCodeThemePanel() {
  const controller = useThemeController(buildVSCodeFixture, {
    expanded: ["src", "src-components", "src-app", "src-lib", "public"],
    constraint: fsConstraint,
  });
  return (
    <div className="w-full">
      <div className="rounded-md border border-[#3C3C3C] bg-[#252526] overflow-hidden shadow-lg font-mono">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#3C3C3C] text-[11px] text-[#CCCCCC] uppercase tracking-wider font-medium bg-[#333333]">
          <TerminalIcon className="size-3" />
          <span>Explorer</span>
        </div>
        <DemoPanel
          controller={controller}
          enableDrag
          indentBase={8}
          indentStep={14}
          className="h-80 !border-0 !bg-[#252526]"
          renderRow={(args) => <VSCodeRow args={args} />}
          onIntent={(intent) => applyIntent(controller, intent)}
        />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Finder — multi-column list view, zebra stripes, macOS aesthetic
// ───────────────────────────────────────────────────────────────────────────

const finderIcon = (kind?: DemoKind, expanded?: boolean) => {
  switch (kind) {
    case "folder":
      return expanded ? (
        <FolderOpenIcon className="size-4 text-[#5BA9F4]" />
      ) : (
        <FolderIcon className="size-4 text-[#5BA9F4]" />
      );
    case "app":
      return <PackageIcon className="size-4 text-zinc-600" />;
    case "doc":
      return <FileTextIcon className="size-4 text-zinc-500" />;
    case "media":
      return <FilmIcon className="size-4 text-rose-500" />;
    default:
      return <FileIcon className="size-4 text-zinc-500" />;
  }
};

export function FinderRow({ args }: { args: RenderRowArgs }) {
  const { row, index, isDropTarget, dropPlacement, isDragActive, onDragStart } =
    args;
  const { controller, meta, selected, focused, isDragging } = useRowSnapshot(
    row.id
  );
  // Drag-over grouping highlight: folder + all descendants light up
  // together while the user drags onto the folder.
  const inDropGroup = useTreeSnapshot<DemoMeta, boolean>((c) =>
    dragOverSubtree(c).has(row.id)
  );
  const label = meta?.label ?? row.id;
  const isFolder = meta?.kind === "folder";
  const isDropTargetFolder =
    isDropTarget && dropPlacement === "into" && isFolder;
  const state = rowState({
    isDropTargetFolder,
    inDropGroup,
    selected,
    focused,
    isDragActive,
  });
  // Zebra striping is a row-position concern, not a state — keep it on a
  // separate `data-zebra` attribute and combine with `data-state=idle`
  // for the alternating hover behavior.
  const zebra = index % 2 === 1;
  return (
    <div
      data-tree-row-id={row.id}
      data-row-depth={row.depth}
      data-state={state}
      data-zebra={zebra || undefined}
      data-dragging={isDragging || undefined}
      role="treeitem"
      aria-selected={selected}
      tabIndex={-1}
      onClick={(e) => {
        controller.focus(row.id);
        controller.select([row.id], modeFromEvent(e));
      }}
      onDoubleClick={() => {
        if (isFolder) controller.toggle(row.id);
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        onDragStart?.(row.id, e);
      }}
      className="group/row relative grid items-center h-[22px] text-[12px] select-none cursor-default grid-cols-[1fr] md:grid-cols-[1fr_90px_160px_140px] bg-white data-[state=idle]:data-[zebra]:bg-zinc-50/70 data-[state=drop-target]:bg-[#D8E6F8] data-[state=drop-target]:ring-1 data-[state=drop-target]:ring-inset data-[state=drop-target]:ring-[#0F62FE] data-[state=in-drop-group]:bg-[#E6EFFC] data-[state=selected]:bg-[#0F62FE] data-[state=selected]:text-white data-[state=focused]:bg-zinc-100 data-[state=idle]:hover:bg-zinc-50 data-[state=idle]:data-[zebra]:hover:bg-zinc-100/70 data-[dragging]:opacity-40"
    >
      <div
        className="flex items-center gap-1.5 min-w-0 px-2"
        style={{ paddingLeft: 16 + row.depth * 16 }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (isFolder) controller.toggle(row.id);
          }}
          aria-hidden={!isFolder}
          data-expanded={row.isExpanded || undefined}
          className="inline-flex size-3 items-center justify-center transition-transform text-zinc-500 hover:text-zinc-900 data-[expanded]:rotate-90 group-data-[state=selected]:text-white/90"
        >
          {isFolder ? (
            <svg
              viewBox="0 0 8 8"
              className="size-2 fill-current"
              aria-hidden="true"
            >
              <path d="M2 1 L6 4 L2 7 Z" />
            </svg>
          ) : null}
        </button>
        {finderIcon(meta?.kind, row.isExpanded)}
        <span className="truncate">{label}</span>
      </div>
      <div className="hidden md:block text-right pr-3 tabular-nums text-zinc-500 group-data-[state=selected]:text-white/90">
        {meta?.size ?? ""}
      </div>
      <div className="hidden md:block truncate pr-3 text-zinc-500 group-data-[state=selected]:text-white/90">
        {meta?.kindLabel ?? (isFolder ? "Folder" : "")}
      </div>
      <div className="hidden md:block truncate pr-3 text-zinc-500 group-data-[state=selected]:text-white/90">
        {meta?.modifiedAt ?? ""}
      </div>
    </div>
  );
}

export function FinderThemePanel() {
  const controller = useThemeController(buildFinderFixture, {
    expanded: ["documents", "proj-grida", "downloads", "apps"],
    constraint: fsConstraint,
  });
  return (
    <div className="w-full">
      <div className="rounded-lg border border-zinc-300 bg-white overflow-hidden shadow-sm">
        {/* macOS-style titlebar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-200 bg-gradient-to-b from-zinc-100 to-zinc-50">
          <span className="size-3 rounded-full bg-[#FF5F57]" />
          <span className="size-3 rounded-full bg-[#FEBC2E]" />
          <span className="size-3 rounded-full bg-[#28C840]" />
          <span className="ml-3 text-[12px] text-zinc-700 font-medium">
            softmarshmallow
          </span>
        </div>
        {/* column header — hide the metadata columns below md (mobile),
            same as the row cells, so the layouts line up. */}
        <div className="grid items-center h-7 text-[11px] text-zinc-500 uppercase tracking-wider border-b border-zinc-200 bg-zinc-50 grid-cols-[1fr] md:grid-cols-[1fr_90px_160px_140px]">
          <div className="px-3">Name</div>
          <div className="hidden md:block text-right pr-3">Size</div>
          <div className="hidden md:block px-1">Kind</div>
          <div className="hidden md:flex items-center gap-1">
            <CalendarIcon className="size-3" />
            <span>Modified</span>
          </div>
        </div>
        <DemoPanel
          controller={controller}
          enableDrag
          indentBase={16}
          indentStep={16}
          className="h-80 !border-0"
          renderRow={(args) => <FinderRow args={args} />}
          onIntent={(intent) => applyIntent(controller, intent)}
        />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Shared bits
// ───────────────────────────────────────────────────────────────────────────

function DropBar({
  side,
  left,
  color,
}: {
  side: "top" | "bottom";
  left: number;
  color: "zinc" | "figma";
}) {
  const colorClass = color === "zinc" ? "bg-zinc-900" : "bg-[#0D99FF]";
  const y = side === "top" ? "-top-px" : "-bottom-px";
  return (
    <div
      className={`absolute ${y} right-1 h-0.5 pointer-events-none`}
      style={{ left }}
    >
      <div
        className={`absolute -left-1 -top-[3px] size-2 rounded-full ${colorClass}`}
      />
      <div className={`absolute inset-x-0 inset-y-0 rounded ${colorClass}`} />
    </div>
  );
}

function RowFlagButton({
  selected,
  onClick,
  title,
  alwaysVisible,
  theme,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  alwaysVisible: boolean;
  theme: "grida" | "figma";
  children: React.ReactNode;
}) {
  const base = selected
    ? "text-white/90 hover:bg-white/10"
    : theme === "grida"
      ? "text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100"
      : "text-neutral-500 hover:text-neutral-200 hover:bg-white/5";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      aria-label={title}
      className={[
        "size-5 inline-flex items-center justify-center rounded transition-opacity",
        base,
        alwaysVisible ? "opacity-100" : "opacity-0 group-hover/row:opacity-100",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
