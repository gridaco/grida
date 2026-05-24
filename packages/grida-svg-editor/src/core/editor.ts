// Headless editor — `createSvgEditor`.
//
// No DOM imports. No `window` / `document` / `HTMLElement`. The editor parses
// SVG, owns an in-memory IR, accepts commands, and emits state. Surfaces
// (DOM, headless test) attach later via `editor.attach(surface)`.

import { HistoryImpl } from "@grida/history";
import type { SelectMode } from "@grida/hud";
import {
  CommandRegistry,
  type CommandHandler,
  type CommandId,
} from "../commands/registry";
import { registerDefaultCommands } from "../commands/defaults";
import { Keymap } from "../keymap/keymap";
import { applyDefaultBindings } from "../keymap/defaults";
import cmath from "@grida/cmath";
import { create_defs } from "./defs";
import { SvgDocument } from "./document";
import type { GeometryProvider } from "./geometry";
import type { SurfaceBridge } from "./surface-bridge";
import { group as group_policy } from "./group";
import {
  translate_pipeline,
  type TranslateBaseline,
  type TranslateStage,
} from "./translate-pipeline";
import { rotate_pipeline } from "./rotate-pipeline";
import { transform, type TransformOp } from "./transform";
import { resize_pipeline, type ResizeBaseline } from "./resize-pipeline";
import { compute_align_deltas, type AlignDirection } from "./align";
import { paint } from "./paint";
import { properties } from "./properties";
import type {
  EditorState,
  EditorStyle,
  GradientDefinition,
  InsertPreviewSession,
  InvalidComputedValue,
  Mode,
  NodeId,
  Paint,
  PaintPreviewSession,
  PaintValue,
  PreviewSession,
  Providers,
  ReorderDirection,
  Tool,
  Unsubscribe,
} from "../types";
import { DEFAULT_STYLE, TOOL_CURSOR } from "../types";
import { array_shallow_equal } from "../util/equal";
import { insertions } from "./insertions";

/** Resolved paint from the DOM-attached cascade. `resolved_paint` mirrors the
 *  shape of `PaintValue.computed` so consumers can treat it uniformly with
 *  the headless cascade. */
export type DomComputedPaint = {
  computed: string;
  resolved_paint: Paint | InvalidComputedValue | null;
};

/** Contract the DOM surface implements to delegate cascade resolution to
 *  `getComputedStyle()`. Registered via `editor._internal.set_computed_resolver`
 *  on attach. */
export type DomComputedResolver = {
  computed_property(id: NodeId, name: string): string | null;
  computed_paint(
    id: NodeId,
    channel: "fill" | "stroke"
  ): DomComputedPaint | null;
};

// Re-export the camera + gestures types from the main entry. These are
// DOM-free (Camera is pure math; Gestures is a thin orchestrator) — the
// schemas live here so callers importing from `@grida/svg-editor` get
// types alongside the editor, even if the actual surface instance is
// only constructible via `@grida/svg-editor/dom`.
export type {
  Camera,
  BoundsResolver,
  CameraConstraints,
  CameraOptions,
} from "./camera";
export type {
  GestureBinding,
  GestureContext,
  GestureId,
  Gestures,
} from "../gestures";

const PROVIDER_ID = "svg-editor";
/** Max characters in a synthesized display label before truncation. */
const DISPLAY_LABEL_MAX_LEN = 40;

export type CreateSvgEditorOptions = {
  svg: string;
  providers?: Providers;
  style?: Partial<EditorStyle>;
};

/**
 * Internal-only members the package's own surfaces reach for. NOT part of
 * the published API — `_internal` is the surface↔editor bridge, `keymap`
 * is the keymap dispatcher the DOM surface forwards keyboard events to.
 * Lives on the runtime object for in-package callers; stripped from the
 * public `SvgEditor` type so the published `.d.ts` doesn't advertise them.
 */
type SvgEditorInternalMembers = "_internal" | "keymap";

/** Internal handle. Use only inside `@grida/svg-editor`. */
export type SvgEditorInternal = ReturnType<typeof _create_svg_editor_internal>;

/**
 * The published editor type. `Omit`s the in-package-only surfaces (see
 * `SvgEditorInternalMembers`) so consumers don't see them in IntelliSense
 * or the dist `.d.ts`. They still exist on the runtime object — casting
 * to `SvgEditorInternal` reaches them, but the contract is clear: stay
 * inside the package.
 */
export type SvgEditor = Omit<SvgEditorInternal, SvgEditorInternalMembers>;

/**
 * Host-provided rendering and input boundary. v0 contract is pure
 * lifecycle: the editor calls `dispose()` on `editor.detach()` /
 * `editor.dispose()`; the surface owns its own teardown there (event
 * listeners, DOM nodes, retained refs).
 *
 * **Why so narrow?** The cross-surface vocabulary — paint push, input
 * routing, hit-testing — isn't pinned yet. The DOM surface re-serializes
 * the document via `editor.subscribe`, attaches its own listeners, and
 * owns its own pick. The editor reaches into the DOM surface through
 * the in-package `_internal` channel (`SurfaceBridge` in
 * `core/surface-bridge.ts`), not through the public `Surface` type. A
 * cross-surface paint / input / hit-test contract is deferred until a
 * second surface implementation arrives and pins each shape (P6 —
 * public only after dogfooding).
 */
export type Surface = {
  dispose(): void;
};

export type SurfaceHandle = {
  detach(): void;
};

export type { SelectMode };

export type Commands = {
  // selection
  select(
    target: NodeId | ReadonlyArray<NodeId>,
    opts?: { mode?: SelectMode }
  ): void;
  deselect(): void;
  /**
   * Replace the selection with every element-child of the current scope
   * (or `doc.root` when no scope is entered). Returns `false` when the
   * scope has no element children — letting the keymap chain fall through
   * unchanged.
   */
  select_all(): boolean;
  /**
   * Rotate the selection to the next or previous sibling within the
   * current single-selection's parent. Wraps at both ends. With an empty
   * or multi-selection, falls back to selecting the first / last child of
   * the current scope (so Tab from "nothing selected" picks something).
   * Returns `false` when no candidate exists (empty scope).
   */
  select_sibling(direction: "next" | "prev"): boolean;
  enter_scope(group: NodeId): void;
  exit_scope(): void;
  // mode
  set_mode(mode: Mode): void;
  // generic property
  set_property(name: string, value: string | null): void;
  preview_property(name: string): PreviewSession;
  // paint
  set_paint(channel: "fill" | "stroke", paint: Paint): void;
  preview_paint(channel: "fill" | "stroke"): PaintPreviewSession;
  set_paint_from_gradient(
    channel: "fill" | "stroke",
    definition: GradientDefinition,
    opts?: { reuse_existing?: boolean }
  ): { gradient_id: string };
  // transforms
  translate(delta: { dx: number; dy: number }): void;
  nudge(delta: { dx: number; dy: number }): void;
  /**
   * Map the selection's current union-bbox to `target` as a single atomic
   * step. Maps width/height/x/y simultaneously — each member scales
   * around the union NW anchor, then the result is translated so the
   * union NW lands at `target.{x, y}`. Per-tag constraints (circle
   * uniform, text edge no-op) execute inside `apply_resize` for each
   * member.
   *
   * The default selection is `state.selection`. Pass `opts.ids` to
   * override. Members whose tag is not resizable
   * (e.g. `<g>`) are skipped silently; the gesture is a no-op when no
   * resizable member remains. Returns `true` when a history step was
   * pushed.
   */
  resize_to(
    target: { x: number; y: number; width: number; height: number },
    opts?: { ids?: ReadonlyArray<NodeId> }
  ): boolean;
  /**
   * Rotate the selection by `angle` radians around the union-bbox center
   * (or `opts.pivot` if provided). One atomic history step. Returns
   * `false` and a no-op when any member's transform isn't rotatable (see
   * `is_rotatable` — refuses non-trivial transforms, `<text rotate>`,
   * CSS-property transforms, animated transforms).
   *
   * Pivot defaults to bbox-center of the live selection via the attached
   * surface's `geometry_provider`. With no surface attached, the function
   * uses local-attribute bbox approximations (less precise for transformed
   * ancestors, but correct for flat docs).
   */
  rotate(
    angle: number,
    opts?: {
      ids?: ReadonlyArray<NodeId>;
      pivot?: { x: number; y: number };
    }
  ): boolean;
  /**
   * Set the absolute rotation of each member to `angle` radians. Computes
   * the per-member delta from each baseline's current rotation. Pivot
   * defaults to union-bbox center. Same refusal semantics as `rotate`.
   * One atomic history step.
   */
  rotate_to(
    angle: number,
    opts?: {
      ids?: ReadonlyArray<NodeId>;
      pivot?: { x: number; y: number };
    }
  ): boolean;
  /**
   * Collapse each selected member's `transform=` to a single `matrix(...)`
   * token, baking accumulated translates / rotates / scales / skews into
   * the equivalent affine. After flatten, the element's transform list
   * classifies as `mixed` from the parser's view — but `rotate` will then
   * refuse it. The point isn't to enable further rotation; it's to give
   * the user an explicit pre-rotation reset path so accumulated trig
   * drift has a recovery option.
   *
   * Returns `false` when nothing was changed (selection empty or every
   * member already has no transform / a single matrix).
   */
  flatten_transform(opts?: { ids?: ReadonlyArray<NodeId> }): boolean;
  /**
   * Translate each member so its bbox aligns with the requested edge or
   * center of the selection's union bbox. Single atomic history step.
   * Refuses (returns `false`) when fewer than two members have a world-
   * bbox available — alignment with a single reference is undefined here
   * (target-to-canvas / target-to-parent semantics are not yet designed).
   */
  align(
    direction: AlignDirection,
    opts?: { ids?: ReadonlyArray<NodeId> }
  ): boolean;
  // structure
  reorder(direction: ReorderDirection): void;
  remove(): void;
  /**
   * Wrap the current selection in a new plain `<g>`. Returns `true` if
   * the wrap was performed (a history step was pushed and the new group
   * is the active selection); `false` if the policy in `GROUPING.md`
   * rejected the call.
   */
  group(): boolean;
  /**
   * Atomic one-shot insertion. Creates a new element of the given SVG
   * tag with the supplied attributes (merged on top of the package's
   * default paint attrs for `rect` / `ellipse` / `line`), inserts it at
   * the given parent (default: root), and selects it. One undo step.
   * Returns the new node id.
   *
   * Use this for paste, programmatic creation, and any non-pointer
   * insertion path. The DOM surface's drag-to-size gesture uses
   * `insert_preview` instead so it can bracket per-frame attr writes.
   */
  insert(
    tag: string,
    attrs: Readonly<Record<string, string>>,
    opts?: { parent?: NodeId; index?: number; select?: boolean }
  ): NodeId;
  /**
   * Preview-bracketed insertion for drag-to-size gestures. Creates and
   * inserts the node immediately (so HUD selection chrome renders);
   * per-frame `update(attrs)` writes geometry; `commit()` collapses the
   * gesture into one undo step; `discard()` rolls back as if the gesture
   * never happened.
   */
  insert_preview(
    tag: string,
    initial: Readonly<Record<string, string>>,
    opts?: { parent?: NodeId; index?: number }
  ): InsertPreviewSession;
  // content
  set_text(value: string): void;
  // file
  load_svg(svg: string): void;
  serialize_svg(): string;
  // history
  undo(): void;
  redo(): void;
  // ─── registry (id-keyed; for keymap and consumer plugins) ──────────────
  /**
   * Register a command handler under a stable id. Returns an unregister
   * function. Re-registering the same id replaces the previous handler.
   *
   * Handlers return `true` if they consumed the invocation; `false` or
   * `undefined` signal "did not apply" — the keymap dispatcher will try
   * the next candidate in the chain.
   */
  register(id: CommandId, handler: CommandHandler): () => void;
  /**
   * Invoke a registered command by id. Returns `true` if a handler
   * consumed the invocation, `false` otherwise (including unknown ids).
   */
  invoke(id: CommandId, args?: unknown): boolean;
  /** Whether an id has a registered handler. */
  has(id: CommandId): boolean;
};

/**
 * Wide internal factory — returns the full object including the
 * `_internal` / `keymap` surfaces in its inferred type. Stays private.
 * The public `createSvgEditor` below wraps this and narrows the return
 * to `SvgEditor` so the published `.d.ts` doesn't advertise internals.
 */
function _create_svg_editor_internal(opts: CreateSvgEditorOptions) {
  const doc = new SvgDocument(opts.svg);
  const history = new HistoryImpl();
  const defs = create_defs(doc);

  let selection: ReadonlyArray<NodeId> = [];
  let scope: NodeId | null = null;
  let mode: Mode = "select";
  let tool: Tool = TOOL_CURSOR;
  let version = 0;
  /** Document-edit counter — only bumps on actual mutations, not selection. */
  let doc_version = 0;
  /** doc_version at the last load()/serialize(); compared to derive `dirty`. */
  let baseline_doc_version = 0;
  /**
   * Bumps once per `editor.load(svg)` call. The constructor's initial parse
   * does NOT count — it's the "factory" state. Hosts subscribe via
   * `subscribe_with_selector(s => s.load_version, ...)` to react to fresh
   * document loads without firing on every edit.
   */
  let load_version = 0;
  let style: EditorStyle = { ...DEFAULT_STYLE, ...opts.style };
  const providers = opts.providers ?? {};
  const listeners = new Set<(state: EditorState) => void>();
  let attached_surface: Surface | null = null;
  /**
   * World-space geometry query provider. Set by the DOM surface on
   * attach (`editor._internal.set_geometry`); cleared on detach. Null
   * means no renderer is attached — bounds queries cannot be answered.
   */
  let geometry_provider: GeometryProvider | null = null;

  const modes: ReadonlyArray<Mode> = ["select", "edit-content"];

  // ─── State ───────────────────────────────────────────────────────────────

  function snapshot(): EditorState {
    return Object.freeze({
      selection,
      scope,
      mode,
      tool,
      dirty: doc_version !== baseline_doc_version,
      can_undo: history.stack.canUndo,
      can_redo: history.stack.canRedo,
      version,
      content_version: doc_version,
      structure_version: doc.structure_version,
      geometry_version: doc.geometry_version,
      load_version,
    });
  }

  function emit() {
    version++;
    const s = snapshot();
    for (const fn of listeners) fn(s);
  }

  history.on("onChange", () => emit());
  history.on("onUndo", () => emit());
  history.on("onRedo", () => emit());

  let last_emitted_geometry_version = doc.geometry_version;
  const geometry_listeners = new Set<() => void>();
  // Distinct from `geometry_listeners` (firehose of any geometry mutation):
  // the nudge-dwell watcher needs the *outcome* of a translate intent, not
  // raw geometry events from undo, set_text, etc.
  const translate_commit_listeners = new Set<() => void>();
  const notify_translate_commit = () => {
    for (const cb of translate_commit_listeners) cb();
  };
  doc.on_change(() => {
    // Every doc mutation bumps doc_version; load()/serialize() snapshots it
    // as the baseline for `dirty`.
    doc_version++;
    // Fire the geometry channel only when the doc's geometry_version
    // advanced — pure presentation writes don't reach the geometry cache.
    if (doc.geometry_version !== last_emitted_geometry_version) {
      last_emitted_geometry_version = doc.geometry_version;
      for (const cb of geometry_listeners) cb();
    }
  });

  function subscribe(fn: (state: EditorState) => void): Unsubscribe {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }

  function subscribe_with_selector<T>(
    selector: (s: EditorState) => T,
    fn: (value: T, prev: T) => void,
    equals: (a: T, b: T) => boolean = Object.is
  ): Unsubscribe {
    let prev = selector(snapshot());
    return subscribe((state) => {
      const next = selector(state);
      if (!equals(prev, next)) {
        const p = prev;
        prev = next;
        fn(next, p);
      }
    });
  }

  // ─── Selection ───────────────────────────────────────────────────────────

  function set_selection(next: ReadonlyArray<NodeId>) {
    // No-op when membership and order are unchanged. Skips emit on
    // re-selecting the current selection (clicking an already-selected node
    // with no shift, etc.) — listeners on the hot path don't re-run.
    if (next.length === selection.length) {
      let same = true;
      for (let i = 0; i < next.length; i++) {
        if (next[i] !== selection[i]) {
          same = false;
          break;
        }
      }
      if (same) return;
    }
    selection = Object.freeze([...next]);
    emit();
  }

  function select(
    target: NodeId | ReadonlyArray<NodeId>,
    opts?: { mode?: SelectMode }
  ) {
    const ids = typeof target === "string" ? [target] : [...target];
    const mode = opts?.mode ?? "replace";
    if (mode === "replace") {
      set_selection(ids);
      return;
    }
    const next = new Set(selection);
    if (mode === "add") {
      for (const id of ids) next.add(id);
    } else {
      // toggle: flip each id's membership
      for (const id of ids) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
    }
    set_selection([...next]);
  }

  function deselect() {
    set_selection([]);
  }

  function enter_scope(group: NodeId) {
    scope = group;
    emit();
  }

  function exit_scope() {
    if (scope === null) return;
    const parent = doc.parent_of(scope);
    scope = parent && parent !== doc.root ? parent : null;
    emit();
  }

  function set_mode(next: Mode) {
    if (mode === next) return;
    mode = next;
    emit();
  }

  function tools_equal(a: Tool, b: Tool): boolean {
    if (a.type !== b.type) return false;
    if (a.type === "cursor" || a.type === "lasso" || a.type === "bend")
      return true;
    return b.type === "insert" && a.tag === b.tag;
  }

  function set_tool(next: Tool) {
    if (tools_equal(tool, next)) return;
    tool = next;
    emit();
  }

  // ─── Properties API ──────────────────────────────────────────────────────
  //
  // `node_paint` and `node_properties` return reference-stable snapshots:
  // repeated reads at the same `doc_version` are O(1) cache hits; reads
  // across mutations rebuild and structurally diff against the last
  // snapshot, returning the prior reference when the underlying values
  // didn't change.

  type ReadProperty = ReturnType<typeof properties.read>;
  type PropertyMap = { readonly [name: string]: ReadProperty };

  const paint_cache = new Map<
    string,
    { doc_version: number; value: PaintValue }
  >();
  const property_cache = new Map<
    string,
    { doc_version: number; value: ReadProperty }
  >();
  const properties_cache = new Map<
    string,
    { doc_version: number; value: PropertyMap }
  >();

  // Tree snapshot cache — invalidated by `structure_version` only.
  // Individual TreeNode entries are also pooled so node references stay
  // stable across emits when their fields didn't change.
  type TreeNode = {
    id: NodeId;
    tag: string;
    name?: string;
    parent: NodeId | null;
    children: ReadonlyArray<NodeId>;
  };
  type TreeSnapshot = {
    root: NodeId;
    nodes: ReadonlyMap<NodeId, TreeNode>;
  };
  let tree_cache: { structure_version: number; value: TreeSnapshot } | null =
    null;
  const tree_node_pool = new Map<NodeId, TreeNode>();

  function tree_snapshot(): TreeSnapshot {
    const sv = doc.structure_version;
    if (tree_cache && tree_cache.structure_version === sv) {
      return tree_cache.value;
    }
    const map = new Map<NodeId, TreeNode>();
    let any_change = !tree_cache;
    for (const id of doc.all_elements()) {
      const tag = doc.tag_of(id);
      const name = doc.get_attr(id, "id") ?? undefined;
      const parent = doc.parent_of(id);
      const children = doc.element_children_of(id);
      const pooled = tree_node_pool.get(id);
      if (
        pooled &&
        pooled.tag === tag &&
        pooled.name === name &&
        pooled.parent === parent &&
        array_shallow_equal(pooled.children, children)
      ) {
        map.set(id, pooled);
        continue;
      }
      const node: TreeNode = { id, tag, name, parent, children };
      tree_node_pool.set(id, node);
      map.set(id, node);
      any_change = true;
    }
    // Drop pooled nodes that no longer exist in the doc.
    for (const id of tree_node_pool.keys()) {
      if (!map.has(id)) {
        tree_node_pool.delete(id);
        any_change = true;
      }
    }
    if (!any_change && tree_cache) {
      tree_cache.structure_version = sv;
      return tree_cache.value;
    }
    const snap: TreeSnapshot = { root: doc.root, nodes: map };
    tree_cache = { structure_version: sv, value: snap };
    return snap;
  }

  function node_property_cached(id: NodeId, name: string): ReadProperty {
    const key = `${id} ${name}`;
    const cached = property_cache.get(key);
    if (cached && cached.doc_version === doc_version) return cached.value;
    const next = properties.read(doc, id, name);
    if (cached && properties.value_equals(cached.value, next)) {
      cached.doc_version = doc_version;
      return cached.value;
    }
    property_cache.set(key, { doc_version, value: next });
    return next;
  }

  function node_properties(
    id: NodeId,
    names: ReadonlyArray<string>
  ): PropertyMap {
    const key = `${id} ${names.join("")}`;
    const cached = properties_cache.get(key);
    if (cached && cached.doc_version === doc_version) return cached.value;
    // Build via the per-(id,name) cache so the inner values are reference
    // stable too, not just the outer object.
    const next: { [name: string]: ReadProperty } = {};
    let changed = !cached;
    for (const name of names) {
      const v = node_property_cached(id, name);
      next[name] = v;
      if (cached && cached.value[name] !== v) changed = true;
    }
    if (cached && !changed) {
      cached.doc_version = doc_version;
      return cached.value;
    }
    const frozen = Object.freeze(next) as PropertyMap;
    properties_cache.set(key, { doc_version, value: frozen });
    return frozen;
  }

  function node_paint(id: NodeId, channel: "fill" | "stroke"): PaintValue {
    const key = `${id} ${channel}`;
    const cached = paint_cache.get(key);
    if (cached && cached.doc_version === doc_version) return cached.value;
    const { declared, provenance } = properties.resolve_declared(
      doc,
      id,
      channel
    );
    const computed = paint.parse(declared);
    const next: PaintValue = { declared, computed, provenance };
    if (cached && paint.value_equals(cached.value, next)) {
      cached.doc_version = doc_version;
      return cached.value;
    }
    paint_cache.set(key, { doc_version, value: next });
    return next;
  }

  // ─── Commands ────────────────────────────────────────────────────────────

  function write_property(id: NodeId, name: string, value: string | null) {
    const carrier = properties.choose_write_carrier(doc, id, name);
    if (carrier === "inline_style") {
      doc.set_style(id, name, value);
    } else {
      doc.set_attr(id, name, value);
    }
  }

  function set_property(name: string, value: string | null) {
    if (selection.length === 0) return;
    const before: Array<{
      id: NodeId;
      attr: string | null;
      style: string | null;
    }> = [];
    for (const id of selection) {
      before.push({
        id,
        attr: doc.get_attr(id, name),
        style: doc.get_style(id, name),
      });
    }
    const targets = [...selection];

    const apply = () => {
      for (const id of targets) write_property(id, name, value);
      emit();
    };
    const revert = () => {
      for (const b of before) {
        if (b.style !== null) doc.set_style(b.id, name, b.style);
        else doc.set_style(b.id, name, null);
        doc.set_attr(b.id, name, b.attr);
      }
      emit();
    };

    // Apply immediately, then record for undo/redo. Per @grida/history
    // semantics, `tx.push` does NOT execute the delta — callers mutate
    // first and push a (apply, revert) pair that history can replay.
    apply();
    history.atomic(`set ${name}`, (tx) => {
      tx.push({ providerId: PROVIDER_ID, apply, revert });
    });
  }

  function preview_property(name: string): PreviewSession {
    const before: Array<{
      id: NodeId;
      attr: string | null;
      style: string | null;
    }> = [];
    for (const id of selection) {
      before.push({
        id,
        attr: doc.get_attr(id, name),
        style: doc.get_style(id, name),
      });
    }
    const preview = history.preview(`change ${name}`);
    return {
      update(value: string) {
        preview.set({
          providerId: PROVIDER_ID,
          apply: () => {
            for (const id of selection) write_property(id, name, value);
            emit();
          },
          revert: () => {
            for (const b of before) {
              if (b.style !== null) doc.set_style(b.id, name, b.style);
              else doc.set_style(b.id, name, null);
              doc.set_attr(b.id, name, b.attr);
            }
            emit();
          },
        });
      },
      commit: () => preview.commit(),
      discard: () => preview.discard(),
    };
  }

  function set_paint(channel: "fill" | "stroke", p: Paint) {
    if (selection.length === 0) return;
    const value = paint.serialize(p);
    set_property(channel, value);
  }

  function preview_paint(channel: "fill" | "stroke"): PaintPreviewSession {
    const session = preview_property(channel);
    return {
      update: (p: Paint) => session.update(paint.serialize(p)),
      commit: () => session.commit(),
      discard: () => session.discard(),
    };
  }

  function set_paint_from_gradient(
    channel: "fill" | "stroke",
    definition: GradientDefinition,
    _opts?: { reuse_existing?: boolean }
  ): { gradient_id: string } {
    const gradient_id = defs.gradients.upsert(definition);
    set_paint(channel, { kind: "ref", id: gradient_id });
    return { gradient_id };
  }

  /** Shared one-shot translate runner. `stages` selects semantics — see
   *  `core/translate-pipeline/README.md`'s "Stage lists per entry point". */
  function do_translate_oneshot(
    delta: { dx: number; dy: number },
    stages: ReadonlyArray<TranslateStage> | undefined,
    label: string
  ): boolean {
    if (selection.length === 0) return false;
    if (delta.dx === 0 && delta.dy === 0) return false;
    const { apply, revert } = translate_pipeline.prepare_rpc({
      doc,
      ids: selection,
      delta: { x: delta.dx, y: delta.dy },
      options: {
        pixel_grid_quantum: style.snap_to_pixel_grid
          ? style.pixel_grid_size
          : null,
        snap_enabled: style.snap_enabled,
        snap_threshold_px: style.snap_threshold_px,
      },
      emit,
      stages,
    });
    apply();
    history.atomic(label, (tx) => {
      tx.push({ providerId: PROVIDER_ID, apply, revert });
    });
    return true;
  }

  function translate(delta: { dx: number; dy: number }) {
    if (do_translate_oneshot(delta, undefined, "translate")) {
      notify_translate_commit();
    }
  }

  function nudge(delta: { dx: number; dy: number }) {
    if (do_translate_oneshot(delta, translate_pipeline.stages.NUDGE, "nudge")) {
      notify_translate_commit();
    }
  }

  /**
   * One-shot multi-member resize to an explicit target rect. Mirrors a
   * drag-resize gesture in mechanics — capture per-member baselines,
   * scale around the union's NW corner, translate the result so the
   * union NW lands at the requested position — but as a single
   * atomic step rather than a preview session.
   *
   * The function does its own geometry lookup via the
   * `geometry_provider` registered by the DOM surface. When no surface
   * is attached, the call is a no-op (returns `false`). Members whose
   * tag is not resizable are silently filtered.
   *
   * Revert restores the captured `transform` attribute and all
   * geometry attrs the apply step wrote — so a `<rect>` with an
   * existing `transform` round-trips cleanly. See `apply_translate`'s
   * `viaTransform` arm for why this matters.
   */
  function resize_to(
    target: { x: number; y: number; width: number; height: number },
    opts?: { ids?: ReadonlyArray<NodeId> }
  ): boolean {
    const ids = opts?.ids ?? selection;
    if (ids.length === 0) return false;
    if (!geometry_provider) return false;

    type Member = {
      id: NodeId;
      rz: ResizeBaseline;
      tx_pre: TranslateBaseline;
      transform_pre: string | null;
      bbox: { x: number; y: number; width: number; height: number };
    };
    const members: Member[] = [];
    for (const id of ids) {
      if (!resize_pipeline.intent.is_resizable(doc.tag_of(id))) continue;
      const bbox = geometry_provider.bounds_of(id);
      if (!bbox) continue;
      members.push({
        id,
        rz: resize_pipeline.intent.capture_baseline(doc, id, bbox),
        tx_pre: translate_pipeline.intent.capture_baseline(doc, id),
        transform_pre: doc.get_attr(id, "transform"),
        bbox,
      });
    }
    if (members.length === 0) return false;

    const union = cmath.rect.union(members.map((m) => m.bbox));
    const sx = union.width === 0 ? 1 : target.width / union.width;
    const sy = union.height === 0 ? 1 : target.height / union.height;
    // Origin = union NW: scale keeps NW fixed; we follow with an explicit
    // translate so NW lands at target NW. Decoupling scale-anchor from
    // target-anchor sidesteps the `(1 - sx) === 0` degenerate case in the
    // single-step origin formula.
    const origin = { x: union.x, y: union.y };
    const dx = target.x - union.x;
    const dy = target.y - union.y;

    const apply = () => {
      for (const m of members) {
        resize_pipeline.intent.apply(doc, m.id, m.rz, sx, sy, origin);
      }
      if (dx !== 0 || dy !== 0) {
        // Re-capture translate baselines after scale wrote new attrs —
        // otherwise `apply_translate` would offset the pre-scale values
        // and double-account or back-step.
        for (const m of members) {
          const tx_after = translate_pipeline.intent.capture_baseline(
            doc,
            m.id
          );
          translate_pipeline.intent.apply(doc, m.id, tx_after, dx, dy);
        }
      }
      emit();
    };
    const revert = () => {
      for (const m of members) {
        // apply_resize at sx=sy=1 writes attrs as `origin + (a - origin) * 1
        // = a` for every per-tag arm — restores resize baseline exactly.
        resize_pipeline.intent.apply(doc, m.id, m.rz, 1, 1, origin);
        // Restore `transform` directly — `apply_translate.viaTransform`
        // may have rewritten it during apply; `apply_resize` never
        // touches it.
        doc.set_attr(m.id, "transform", m.transform_pre);
      }
      emit();
    };
    apply();
    history.atomic("resize-to", (tx) => {
      tx.push({ providerId: PROVIDER_ID, apply, revert });
    });
    return true;
  }

  /** Shared helper: compute a default rotation pivot from the live
   *  geometry_provider when the caller omitted one. Falls back to (0,0)
   *  if no surface is attached. */
  function default_rotate_pivot(ids: ReadonlyArray<NodeId>): {
    x: number;
    y: number;
  } {
    if (!geometry_provider || ids.length === 0) return { x: 0, y: 0 };
    const rects: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];
    for (const id of ids) {
      const b = geometry_provider.bounds_of(id);
      if (b) rects.push(b);
    }
    if (rects.length === 0) return { x: 0, y: 0 };
    const u = cmath.rect.union(rects);
    return { x: u.x + u.width / 2, y: u.y + u.height / 2 };
  }

  function rotate(
    angle: number,
    opts?: {
      ids?: ReadonlyArray<NodeId>;
      pivot?: { x: number; y: number };
    }
  ): boolean {
    const ids = opts?.ids ?? selection;
    if (ids.length === 0) return false;
    const pivot = opts?.pivot ?? default_rotate_pivot(ids);
    const prepared = rotate_pipeline.prepare_rpc({
      doc,
      ids,
      pivot,
      angle_radians: angle,
      options: { angle_snap_step_radians: style.angle_snap_step_radians },
      emit,
    });
    // Any refusal verdict aborts the command — no IR mutation, no
    // history entry. Caller is the programmatic API surface; surface a
    // refusal signal to it (return false) rather than silently writing
    // a partial rotation.
    for (const v of prepared.verdicts.values()) {
      if (v.kind === "refuse") return false;
    }
    prepared.apply();
    history.atomic("rotate", (tx) => {
      tx.push({
        providerId: PROVIDER_ID,
        apply: prepared.apply,
        revert: prepared.revert,
      });
    });
    return true;
  }

  function rotate_to(
    angle: number,
    opts?: {
      ids?: ReadonlyArray<NodeId>;
      pivot?: { x: number; y: number };
    }
  ): boolean {
    // `rotate_to(θ)` = rotate each member by (θ - current_rotation). We
    // capture baselines once via prepare_rotate_rpc with delta=0 to read
    // current_rotation_deg per member, then call apply_rotate with the
    // computed deltas. Single atomic step.
    const ids = opts?.ids ?? selection;
    if (ids.length === 0) return false;
    const pivot = opts?.pivot ?? default_rotate_pivot(ids);
    // Probe baselines (delta=0 doesn't mutate; revert restores byte-equal).
    const probe = rotate_pipeline.prepare_rpc({
      doc,
      ids,
      pivot,
      angle_radians: 0,
      options: { angle_snap_step_radians: style.angle_snap_step_radians },
      emit: () => {},
    });
    for (const v of probe.verdicts.values()) {
      if (v.kind === "refuse") return false;
    }
    // Compute per-member angle deltas from each baseline's current
    // rotation. Members may disagree on current rotation; each gets its
    // own delta to land all of them at the same absolute angle.
    const DEG_TO_RAD = Math.PI / 180;
    const apply = () => {
      for (const m of probe.plan.members) {
        const delta = angle - m.baseline.current_rotation_deg * DEG_TO_RAD;
        rotate_pipeline.intent.apply(doc, m.id, m.baseline, delta);
      }
      emit();
    };
    const revert = () => {
      for (const m of probe.plan.members) {
        rotate_pipeline.intent.apply(doc, m.id, m.baseline, 0);
      }
      emit();
    };
    apply();
    history.atomic("rotate-to", (tx) => {
      tx.push({ providerId: PROVIDER_ID, apply, revert });
    });
    return true;
  }

  function flatten_transform(opts?: { ids?: ReadonlyArray<NodeId> }): boolean {
    const ids = opts?.ids ?? selection;
    if (ids.length === 0) return false;
    type Member = {
      id: NodeId;
      transform_pre: string | null;
      ops: TransformOp[];
    };
    const members: Member[] = [];
    for (const id of ids) {
      const pre = doc.get_attr(id, "transform");
      if (pre === null) continue;
      const ops = transform.parse(pre);
      if (ops === null) continue;
      // Already a single matrix? Leave it — flatten would no-op.
      if (ops.length === 1 && ops[0].type === "matrix") continue;
      members.push({ id, transform_pre: pre, ops });
    }
    if (members.length === 0) return false;
    const apply = () => {
      for (const m of members) {
        let mat: FlattenMat = FLATTEN_IDENT;
        for (const op of m.ops) mat = flatten_mul(mat, flatten_op_to_mat(op));
        doc.set_attr(
          m.id,
          "transform",
          transform.emit([
            {
              type: "matrix",
              a: mat[0],
              b: mat[1],
              c: mat[2],
              d: mat[3],
              e: mat[4],
              f: mat[5],
            },
          ])
        );
      }
      emit();
    };
    const revert = () => {
      for (const m of members) doc.set_attr(m.id, "transform", m.transform_pre);
      emit();
    };
    apply();
    history.atomic("flatten-transform", (tx) => {
      tx.push({ providerId: PROVIDER_ID, apply, revert });
    });
    return true;
  }

  /**
   * Translate selected members so they line up along the requested edge or
   * center of a reference rect. Same mechanics as `resize_to`: per-member
   * translate baselines (so `<g>`, transformed, and natively-attributed
   * nodes all write the cleanest in-place representation), one atomic
   * history step.
   *
   * Reference rect is selection-size dependent:
   *   - multi-selection: union of member bboxes
   *   - single selection: the parent's bbox (root → `<svg>` viewport,
   *     inside a `<g>` → that group's bbox). Refuses when the selected
   *     node IS the root (no container to align against).
   *
   * Refuses when `geometry_provider` is null (no surface attached) or when
   * no member has a resolvable bbox.
   */
  function align(
    direction: AlignDirection,
    opts?: { ids?: ReadonlyArray<NodeId> }
  ): boolean {
    const ids = opts?.ids ?? selection;
    if (ids.length === 0) return false;
    if (!geometry_provider) return false;

    type Member = {
      id: NodeId;
      bbox: { x: number; y: number; width: number; height: number };
      baseline: TranslateBaseline;
    };
    const members: Member[] = [];
    for (const id of ids) {
      const bbox = geometry_provider.bounds_of(id);
      if (!bbox) continue;
      const baseline = translate_pipeline.intent.capture_baseline(doc, id);
      if (baseline.type === "unsupported") continue;
      members.push({ id, bbox, baseline });
    }
    if (members.length === 0) return false;

    // Pick the reference rect: union of selection for multi-target, parent
    // for single. Single-target refuses when there's no parent (the
    // selected node IS the document root — there's nothing to align to).
    let target: { x: number; y: number; width: number; height: number };
    if (members.length === 1) {
      const parent_id = doc.parent_of(members[0].id);
      if (parent_id === null) return false;
      const parent_bbox = geometry_provider.bounds_of(parent_id);
      if (!parent_bbox) return false;
      target = parent_bbox;
    } else {
      target = cmath.rect.union(members.map((m) => m.bbox));
    }

    // `compute_align_deltas` omits zero-deltas — every entry in `deltas`
    // is a member that actually moves. No need to filter again.
    const deltas = compute_align_deltas(members, target, direction);
    if (deltas.size === 0) return false;

    const apply = () => {
      for (const m of members) {
        const d = deltas.get(m.id);
        if (d) translate_pipeline.intent.apply(doc, m.id, m.baseline, d.x, d.y);
      }
      emit();
    };
    const revert = () => {
      // apply_translate at (0,0) restores baseline attrs exactly; the
      // `viaTransform` arm rewrites `transform` from the captured pre-
      // value via `compose_leading_translate(_, 0, 0)`, which yields
      // the original string when delta is zero.
      for (const m of members) {
        if (deltas.has(m.id))
          translate_pipeline.intent.apply(doc, m.id, m.baseline, 0, 0);
      }
      emit();
    };
    apply();
    history.atomic(`align ${direction}`, (tx) => {
      tx.push({ providerId: PROVIDER_ID, apply, revert });
    });
    return true;
  }

  function select_all(): boolean {
    const parent = scope ?? doc.root;
    const children = doc.element_children_of(parent);
    if (children.length === 0) return false;
    set_selection(children);
    return true;
  }

  /**
   * Cycle the selection to the next / previous sibling. Single-selection
   * path uses the selected node's parent; empty / multi-selection falls
   * back to the current scope's first / last child. Wraps at edges.
   */
  function select_sibling(direction: "next" | "prev"): boolean {
    let parent: NodeId | null;
    let anchor_index: number;
    let siblings: ReadonlyArray<NodeId>;
    if (selection.length === 1) {
      const current = selection[0];
      parent = doc.parent_of(current);
      if (parent === null) return false;
      siblings = doc.element_children_of(parent);
      anchor_index = siblings.indexOf(current);
      if (anchor_index < 0) return false;
    } else {
      parent = scope ?? doc.root;
      siblings = doc.element_children_of(parent);
      if (siblings.length === 0) return false;
      // Tab from no selection → first child; Shift+Tab → last.
      anchor_index = direction === "next" ? -1 : siblings.length;
    }
    const n = siblings.length;
    const next =
      direction === "next"
        ? (anchor_index + 1) % n
        : (anchor_index - 1 + n) % n;
    set_selection([siblings[next]]);
    return true;
  }

  function reorder(direction: ReorderDirection) {
    if (selection.length !== 1) return;
    const target = selection[0];
    const parent = doc.parent_of(target);
    if (parent === null) return;
    const siblings = doc.element_children_of(parent);
    const i = siblings.indexOf(target);
    if (i < 0) return;
    const original_before = siblings[i + 1] ?? null;
    let new_before: NodeId | null;
    switch (direction) {
      case "bring_forward":
        if (i >= siblings.length - 1) return;
        new_before = siblings[i + 2] ?? null;
        break;
      case "send_backward":
        if (i <= 0) return;
        new_before = siblings[i - 1];
        break;
      case "bring_to_front":
        if (i === siblings.length - 1) return;
        new_before = null;
        break;
      case "send_to_back":
        if (i === 0) return;
        new_before = siblings[0];
        break;
    }
    const apply = () => {
      doc.insert(target, parent, new_before);
      emit();
    };
    const revert = () => {
      doc.insert(target, parent, original_before);
      emit();
    };
    apply();
    history.atomic(`reorder: ${direction}`, (tx) => {
      tx.push({ providerId: PROVIDER_ID, apply, revert });
    });
  }

  function remove() {
    if (selection.length === 0) return;

    // Compact selection to subtree roots first — `doc.remove` detaches
    // the whole subtree, so a descendant entry is redundant on apply
    // AND would break revert (its parent has already been detached
    // from the doc when we try to re-insert it). Then drop any orphan
    // / root entries (parent === null), since the document root isn't
    // removable. Filtering silently lets a mixed valid+invalid
    // selection still remove the valid members.
    const filtered = doc
      .prune_nested_nodes(selection)
      .filter((id) => doc.parent_of(id) !== null);
    if (filtered.length === 0) return;

    // Sort by document order — apply removes top-to-bottom; revert
    // reinserts bottom-to-top so each captured `next_element_sibling`
    // anchor is still present in the parent when its predecessor
    // re-attaches above it.
    const doc_order = doc.all_elements();
    const index_of = new Map<NodeId, number>();
    for (let i = 0; i < doc_order.length; i++) index_of.set(doc_order[i], i);
    const targets = [...filtered].sort(
      (a, b) => (index_of.get(a) ?? 0) - (index_of.get(b) ?? 0)
    );

    type Capture = {
      id: NodeId;
      parent: NodeId;
      next_sibling: NodeId | null;
    };
    const captures: Capture[] = targets.map((id) => ({
      id,
      parent: doc.parent_of(id) as NodeId,
      next_sibling: doc.next_element_sibling_of(id),
    }));

    const old_selection = selection;
    const apply = () => {
      for (const c of captures) doc.remove(c.id);
      set_selection([]);
    };
    const revert = () => {
      for (let i = captures.length - 1; i >= 0; i--) {
        const c = captures[i];
        doc.insert(c.id, c.parent, c.next_sibling);
      }
      set_selection(old_selection);
    };
    apply();
    history.atomic(
      captures.length === 1 ? "remove" : `remove ${captures.length}`,
      (tx) => {
        tx.push({ providerId: PROVIDER_ID, apply, revert });
      }
    );
  }

  function group(): boolean {
    const plan = group_policy.plan(doc, selection);
    if (!plan) return false;
    // create_element registers the node in doc.nodes but does not insert
    // it. Re-runs of apply / revert reattach / detach the same id —
    // history.redo finds it via closure.
    const group_id = doc.create_element("g");
    const original_selection = selection;
    const apply = () => {
      doc.insert(group_id, plan.parent, plan.insert_before);
      for (const child of plan.children) {
        doc.insert(child, group_id, null);
      }
      set_selection([group_id]);
    };
    const revert = () => {
      // Reverse iteration so each child's captured `next_element_sibling`
      // anchor is still present in the parent when re-inserted.
      for (let i = plan.children.length - 1; i >= 0; i--) {
        const child = plan.children[i];
        doc.insert(
          child,
          plan.parent,
          plan.original_positions.get(child) ?? null
        );
      }
      doc.remove(group_id);
      set_selection(original_selection);
    };
    apply();
    history.atomic("group", (tx) => {
      tx.push({ providerId: PROVIDER_ID, apply, revert });
    });
    return true;
  }

  /**
   * Atomic one-shot insertion. Used by paste, programmatic RPC, and the
   * click-no-drag commit path inside the insertion gesture driver. One
   * undo step. Returns the new node id.
   *
   * `attrs` are merged on top of `default_paint_attrs(tag)` — caller attrs
   * win. `opts.parent` defaults to root; `opts.index` (insert-before
   * sibling index) defaults to append; `opts.select` defaults to `true`.
   */
  function insert(
    tag: string,
    attrs: Readonly<Record<string, string>>,
    opts?: { parent?: NodeId; index?: number; select?: boolean }
  ): NodeId {
    const parent = opts?.parent ?? doc.root;
    const select_after = opts?.select !== false;
    // Resolve insert-before from the optional `index`. `index` is the
    // position in the parent's element-children list to insert AT —
    // anything at or after that index gets shifted. `undefined` appends.
    let insert_before: NodeId | null = null;
    if (opts?.index !== undefined) {
      const siblings = doc.element_children_of(parent);
      insert_before = siblings[opts.index] ?? null;
    }
    const id = doc.create_element(tag);
    const merged_attrs: Record<string, string> = {
      ...default_paint_attrs_for(tag),
      ...attrs,
    };
    const attr_pairs = Object.entries(merged_attrs);
    const previous_selection = selection;
    const apply = () => {
      for (const [name, value] of attr_pairs) doc.set_attr(id, name, value);
      doc.insert(id, parent, insert_before);
      if (select_after) set_selection([id]);
    };
    const revert = () => {
      doc.remove(id);
      if (select_after) set_selection(previous_selection);
    };
    apply();
    history.atomic(`insert ${tag}`, (tx) => {
      tx.push({ providerId: PROVIDER_ID, apply, revert });
    });
    return id;
  }

  /**
   * Preview-bracketed insertion. Used by the pointer-driven drag gesture
   * in the DOM surface. Per-frame attr writes call `update(attrs)`; one
   * undo step on `commit()`; clean rollback on `discard()`.
   *
   * The node is created and inserted on open so the HUD selection chrome
   * can render the in-progress shape immediately. On `discard()` the
   * preview's revert removes the node entirely.
   */
  function insert_preview(
    tag: string,
    initial: Readonly<Record<string, string>>,
    opts?: { parent?: NodeId; index?: number }
  ): InsertPreviewSession {
    const parent = opts?.parent ?? doc.root;
    let insert_before: NodeId | null = null;
    if (opts?.index !== undefined) {
      const siblings = doc.element_children_of(parent);
      insert_before = siblings[opts.index] ?? null;
    }
    const id = doc.create_element(tag);
    const previous_selection = selection;

    // Live attr state — last write wins. Mutated in place by `update()`
    // so the per-frame call path stays allocation-free; both apply and
    // revert close over it by reference.
    const live_attrs: Record<string, string> = {
      ...default_paint_attrs_for(tag),
      ...initial,
    };

    // First apply: insert + write initial attrs + select.
    for (const name in live_attrs) doc.set_attr(id, name, live_attrs[name]);
    doc.insert(id, parent, insert_before);
    set_selection([id]);

    const preview = history.preview(`insert ${tag}`);
    let active = true;

    // Reused across every `update()` — closures capture `live_attrs` by
    // reference. The redo path replays the latest committed state; the
    // undo path detaches the node entirely.
    const apply = () => {
      for (const name in live_attrs) doc.set_attr(id, name, live_attrs[name]);
      if (doc.parent_of(id) === null) doc.insert(id, parent, insert_before);
      set_selection([id]);
    };
    const revert = () => {
      doc.remove(id);
      set_selection(previous_selection);
    };
    const entry = { providerId: PROVIDER_ID, apply, revert };
    preview.set(entry);

    return {
      id,
      update(attrs) {
        if (!active) return;
        for (const name in attrs) {
          live_attrs[name] = attrs[name];
          doc.set_attr(id, name, attrs[name]);
        }
        preview.set(entry);
      },
      commit() {
        if (!active) return;
        active = false;
        preview.commit();
      },
      discard() {
        if (!active) return;
        active = false;
        preview.discard();
      },
    };
  }

  /** Per-tag default paint attrs. Wrapped so callers don't need to depend
   *  on the InsertableTag type — `insert()` accepts arbitrary string tags
   *  (so `commands.insert("path", ...)` works for paste / RPC) but only
   *  the closed insertable set gets default paint. */
  function default_paint_attrs_for(tag: string): Record<string, string> {
    if (tag === "rect" || tag === "ellipse" || tag === "line") {
      return insertions.default_paint_attrs(tag);
    }
    return {};
  }

  function set_text(value: string) {
    if (selection.length !== 1) return;
    const target = selection[0];
    if (!doc.is_text_edit_target(target)) return;
    const original = doc.text_of(target);
    if (original === value) return;
    const apply = () => {
      doc.set_text(target, value);
      emit();
    };
    const revert = () => {
      doc.set_text(target, original);
      emit();
    };
    apply();
    history.atomic("edit text", (tx) => {
      tx.push({ providerId: PROVIDER_ID, apply, revert });
    });
  }

  let content_edit_driver: ((target: NodeId) => boolean) | null = null;
  let computed_resolver: DomComputedResolver | null = null;

  function dom_computed_property(id: NodeId, name: string): string | null {
    return computed_resolver?.computed_property(id, name) ?? null;
  }

  function dom_computed_paint(
    id: NodeId,
    channel: "fill" | "stroke"
  ): DomComputedPaint | null {
    return computed_resolver?.computed_paint(id, channel) ?? null;
  }

  // Surface hover channel — kept out of EditorState so it doesn't bump
  // `version` and trigger full snapshot re-renders at pointer rate.
  let current_surface_hover: NodeId | null = null;
  let surface_hover_override: NodeId | null = null;
  const surface_hover_listeners = new Set<() => void>();
  let surface_hover_override_driver: ((id: NodeId | null) => void) | null =
    null;

  function notify_surface_hover() {
    for (const cb of surface_hover_listeners) cb();
  }

  function _set_current_surface_hover(id: NodeId | null) {
    if (current_surface_hover === id) return;
    current_surface_hover = id;
    notify_surface_hover();
  }

  function enter_content_edit(target?: NodeId): boolean {
    const id = target ?? (selection.length === 1 ? selection[0] : null);
    if (!id) return false;
    // Accept text (`<text>`/`<tspan>` leaf) OR path (`<path>` with a `d`).
    // The driver (DOM surface) routes by tag.
    if (!doc.is_text_edit_target(id) && !doc.is_path_edit_target(id))
      return false;
    if (!content_edit_driver) return false;
    return content_edit_driver(id);
  }

  function load_svg(svg: string) {
    doc.load(svg);
    selection = [];
    scope = null;
    mode = "select";
    tool = TOOL_CURSOR;
    history.clear();
    baseline_doc_version = doc_version;
    load_version++;
    emit();
  }

  function serialize_svg(): string {
    return doc.serialize();
  }

  function undo(): void {
    history.undo();
  }
  function redo(): void {
    history.redo();
  }

  const registry = new CommandRegistry();
  const keymap = new Keymap(registry);

  const commands: Commands = {
    select,
    deselect,
    select_all,
    select_sibling,
    enter_scope,
    exit_scope,
    set_mode,
    set_property,
    preview_property,
    set_paint,
    preview_paint,
    set_paint_from_gradient,
    translate,
    nudge,
    resize_to,
    rotate,
    rotate_to,
    flatten_transform,
    align,
    reorder,
    remove,
    group,
    insert,
    insert_preview,
    set_text,
    load_svg,
    serialize_svg,
    undo,
    redo,
    // registry pass-through
    register: (id, handler) => registry.register(id, handler),
    invoke: (id, args) => registry.invoke(id, args),
    has: (id) => registry.has(id),
  };

  // ─── External control ────────────────────────────────────────────────────

  function load(svg: string) {
    load_svg(svg);
  }

  function serialize(): string {
    return doc.serialize();
  }

  function reset() {
    history.clear();
    doc.reset_to_original();
    selection = [];
    scope = null;
    mode = "select";
    tool = TOOL_CURSOR;
    baseline_doc_version = doc_version;
    emit();
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  function attach(surface: Surface): SurfaceHandle {
    if (attached_surface) attached_surface.dispose();
    attached_surface = surface;
    return {
      detach() {
        if (attached_surface === surface) {
          attached_surface.dispose();
          attached_surface = null;
        }
      },
    };
  }

  function detach() {
    if (attached_surface) {
      attached_surface.dispose();
      attached_surface = null;
    }
  }

  function dispose() {
    detach();
    listeners.clear();
  }

  function set_style(partial: Partial<EditorStyle>) {
    style = { ...style, ...partial };
    emit();
  }

  // ─── Public object ───────────────────────────────────────────────────────

  const public_editor = {
    /**
     * Low-level IR handle. Mutating directly bypasses history; prefer
     * `editor.commands` for app code.
     */
    document: doc,

    // observation
    get state(): EditorState {
      return snapshot();
    },
    subscribe,
    subscribe_with_selector,

    // observation — properties
    node_properties,
    node_paint,

    // observation — DOM-computed cascade (null when no DOM surface attached)
    dom_computed_property,
    dom_computed_paint,

    /**
     * Enter content-edit mode on a `<text>` node. Returns `false` (no-op)
     * when no DOM surface is attached.
     */
    enter_content_edit,

    // defs
    defs,

    // commands
    commands,

    /**
     * Human-readable label for hierarchy panels. SVG has no native "name";
     * this is the package's single source of truth so panels don't reinvent
     * the rule.
     *
     * Rule:
     *   - `<text>` → text content, whitespace-collapsed and truncated at
     *     ~40 chars (falls back to `"text"` for empty content).
     *   - Otherwise → tag name, suffixed with `#id` when the `id` attribute
     *     is present (e.g. `"rect #sun"`).
     *
     * `opts.tagLabel` lets callers substitute a friendlier or localized
     * term for the raw tag (e.g. `"rect"` → `"Rectangle"`). Only invoked
     * on the non-text branch.
     */
    display_label(
      id: NodeId,
      opts?: { tagLabel?: (tag: string) => string }
    ): string {
      const tag = doc.tag_of(id);
      if (tag === "text") {
        const raw = doc.text_of(id);
        const collapsed = raw.replace(/\s+/g, " ").trim();
        if (collapsed.length === 0) return "text";
        return collapsed.length > DISPLAY_LABEL_MAX_LEN
          ? `${collapsed.slice(0, DISPLAY_LABEL_MAX_LEN)}…`
          : collapsed;
      }
      const elem_id = doc.get_attr(id, "id");
      const head = opts?.tagLabel ? opts.tagLabel(tag) : tag;
      return elem_id && elem_id.length > 0 ? `${head} #${elem_id}` : head;
    },

    // tree (snapshot helper per README)
    //
    // Memoized: the snapshot is rebuilt only when `structure_version` or
    // an authored `id=` attribute changes. Both the outer object and each
    // `TreeNode` keep referential identity across emits when their fields
    // didn't change. Safe to feed straight into `useSyncExternalStore`.
    tree() {
      return tree_snapshot();
    },

    // ─── Surface hover (transient, not in EditorState) ──────────────────────

    /**
     * The effective hover from the attached HUD surface — what's under the
     * pointer, OR whatever `set_surface_hover_override` last pushed. Used
     * by out-of-canvas UI (layers panel, breadcrumbs) to mirror the canvas
     * highlight. Returns `null` when nothing is hovered.
     */
    surface_hover(): NodeId | null {
      return current_surface_hover;
    },

    /**
     * Push a hover override into the HUD surface — e.g. when the user
     * hovers a row in a layers panel. The HUD will render the override's
     * outline and (when applicable) drive measurement to that node.
     * Pass `null` to clear and let the pointer pick take over again.
     */
    set_surface_hover_override(id: NodeId | null): void {
      if (surface_hover_override === id) return;
      surface_hover_override = id;
      if (surface_hover_override_driver) {
        surface_hover_override_driver(id);
      }
    },

    /**
     * Subscribe to changes in the effective surface hover. Fires when the
     * HUD reports a new pointer pick AND when an override is set/cleared.
     * Cheap channel — does NOT bump `state.version`.
     */
    subscribe_surface_hover(cb: () => void): () => void {
      surface_hover_listeners.add(cb);
      return () => {
        surface_hover_listeners.delete(cb);
      };
    },

    /**
     * Subscribe to bounds-affecting changes. Fires when any document
     * mutation advances `state.geometry_version` — drag, resize, text
     * edit, structural insert/remove. Skips presentation-only writes
     * (fill, opacity, stroke-color).
     */
    subscribe_geometry(cb: () => void): () => void {
      geometry_listeners.add(cb);
      return () => {
        geometry_listeners.delete(cb);
      };
    },

    /**
     * World-space geometry queries. Non-null when a DOM surface is
     * attached; null otherwise (queries need a renderer to read bbox
     * from). Read-only — never mutates document state.
     */
    get geometry(): GeometryProvider | null {
      return geometry_provider;
    },

    modes,
    /** Switch the active tool. No history entry; bumps `state.version`. */
    set_tool,
    get style(): Readonly<EditorStyle> {
      return style;
    },
    set_style,

    // external control
    load,
    serialize,
    reset,

    // lifecycle
    attach,
    detach,
    dispose,

    // providers (read-only; for surface / consumers to grab)
    providers,

    // Surface bridge — see `core/surface-bridge.ts` for the typed contract.
    // The `satisfies SurfaceBridge` annotation makes drift a type error
    // (add/rename/remove a member here and the interface refuses).
    _internal: {
      doc,
      history: {
        preview: (label: string) => history.preview(label),
      },
      emit,
      subscribe_translate_commit(cb: () => void): () => void {
        translate_commit_listeners.add(cb);
        return () => {
          translate_commit_listeners.delete(cb);
        };
      },
      notify_translate_commit,
      set_content_edit_driver(fn: ((target: NodeId) => boolean) | null) {
        content_edit_driver = fn;
      },
      set_surface_hover_override_driver(
        fn: ((id: NodeId | null) => void) | null
      ) {
        surface_hover_override_driver = fn;
        if (fn) fn(surface_hover_override);
      },
      push_surface_hover(id: NodeId | null) {
        _set_current_surface_hover(id);
      },
      set_computed_resolver(fn: DomComputedResolver | null) {
        computed_resolver = fn;
      },
      set_geometry(p: GeometryProvider | null) {
        geometry_provider = p;
      },
    } satisfies SurfaceBridge,

    keymap,
  };

  registerDefaultCommands(registry, public_editor);
  applyDefaultBindings(keymap);

  return public_editor;
}

/**
 * Construct a headless SVG editor. The returned object is the public
 * editor surface — observation (`state`, `subscribe`), commands
 * (`commands.*`), lifecycle (`attach` / `dispose`), and the typed-read
 * caches (`node_paint`, `node_properties`). Surfaces (DOM, headless)
 * attach later via `editor.attach(surface)`.
 */
export function createSvgEditor(opts: CreateSvgEditorOptions): SvgEditor {
  return _create_svg_editor_internal(opts);
}

// ─── flatten_transform helpers ────────────────────────────────────────────
// Module-scoped so the per-invocation closure cost (3 trig calls + a fresh
// `mul`/`op_to_mat` pair per redo) doesn't reallocate on every undo/redo.
// Row-major SVG matrix: [a, b, c, d, e, f].

type FlattenMat = [number, number, number, number, number, number];
const FLATTEN_IDENT: FlattenMat = [1, 0, 0, 1, 0, 0];

function flatten_mul(m1: FlattenMat, m2: FlattenMat): FlattenMat {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function flatten_op_to_mat(op: TransformOp): FlattenMat {
  switch (op.type) {
    case "matrix":
      return [op.a, op.b, op.c, op.d, op.e, op.f];
    case "translate":
      return [1, 0, 0, 1, op.tx, op.ty];
    case "rotate": {
      const rad = (op.angle * Math.PI) / 180;
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      // Rotation around (cx, cy): T(cx,cy) · R(angle) · T(-cx,-cy)
      if (op.cx === 0 && op.cy === 0) return [c, s, -s, c, 0, 0];
      const e = op.cx - c * op.cx + s * op.cy;
      const f = op.cy - s * op.cx - c * op.cy;
      return [c, s, -s, c, e, f];
    }
    case "scale":
      return [op.sx, 0, 0, op.sy, 0, 0];
    case "skewX": {
      const rad = (op.angle * Math.PI) / 180;
      return [1, 0, Math.tan(rad), 1, 0, 0];
    }
    case "skewY": {
      const rad = (op.angle * Math.PI) / 180;
      return [1, Math.tan(rad), 0, 1, 0, 0];
    }
  }
}
