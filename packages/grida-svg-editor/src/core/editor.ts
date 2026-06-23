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
import { clipboard as clipboard_codec } from "./clipboard";
import { subtree } from "./subtree";
import { SvgDocument, WELL_KNOWN_NS_PREFIXES, XMLNS_NS } from "./document";
import type { GeometryProvider } from "./geometry";
import type { SurfaceBridge } from "./surface-bridge";
import { group as group_policy } from "./group";
import {
  translate_pipeline,
  type TranslateBaseline,
  type TranslatePlan,
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
  Matrix2D,
  Mode,
  NodeId,
  Paint,
  PaintPreviewSession,
  PaintValue,
  PickEvent,
  PreviewSession,
  Providers,
  ReorderDirection,
  Tool,
  Unsubscribe,
  Vec2,
  VectorSubSelection,
  VectorSubSelectionInput,
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
  /**
   * Set the `opacity` presentation property across the whole selection in
   * one history step. Typed, clamped sugar over `set_property("opacity", …)`
   * — `value` is clamped to `[0, 1]` (CSS clamps opacity to that range at
   * used-value time), so callers don't have to. A non-finite `value` is a
   * no-op, as is an empty selection. The write picks each member's winning
   * cascade carrier exactly like `set_property` (P1), and an in-flight
   * `preview_property("opacity")` session is superseded the same way a
   * discrete `set_property` write is.
   *
   * This is the editor-owned command behind the digit → opacity shortcut
   * (see `docs/keybindings.md` → Object Properties); the keybindings
   * themselves are intentionally not shipped in the default keymap.
   */
  set_opacity(value: number): void;
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
   * override. Members that are not resizable are skipped silently: this
   * means both an unresizable tag (e.g. `<g>`) AND a resizable tag carrying
   * a non-trivial transform (rotate-without-pivot, matrix, scale, skew),
   * which can't be resized in local space without breaking round-trip — the
   * same `is_resizable_node` gate the resize HUD applies. The gesture is a
   * no-op when no resizable member remains. Returns `true` when a history
   * step was pushed. `opts.label` overrides the atomic history label
   * (default `"resize-to"`).
   */
  resize_to(
    target: { x: number; y: number; width: number; height: number },
    opts?: { ids?: ReadonlyArray<NodeId>; label?: string }
  ): boolean;
  /**
   * Resize the selection by a delta — PER-ELEMENT: each selected member
   * grows/shrinks around its OWN NW corner, so members keep their positions
   * relative to one another (NOT a union/group resize — contrast
   * {@link resize_to}, which scales the whole selection around the shared
   * union origin and so translates off-origin members). `delta.dw` /
   * `delta.dh` are applied additively to each member (clamped to >= 0). The
   * core verb behind keyboard nudge-resize.
   *
   * ALL-OR-NOTHING gate: refuses (returns `false`, no history step) unless
   * EVERY member passes `is_resizable_node` — the same tag + transform-class
   * check the resize HUD uses, applied wholesale (a mixed selection is
   * refused, not partially resized — matches a HUD handle-drag, which is
   * rejected when any member is unsafe). Also refuses on empty selection or
   * when no geometry provider (DOM surface) is attached.
   *
   * Per-tag constraints (circle uniform, text edge no-op) apply per member.
   * The default selection is `state.selection`; pass `opts.ids` to override.
   */
  resize_by(
    delta: { dw: number; dh: number },
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
   * Compose an arbitrary 2×3 affine onto the selection, **relative** and
   * applied in **world space about a pivot**. `matrix` is in SVG
   * `matrix(a b c d e f)` order (see {@link Matrix2D}).
   *
   * Semantics: the effective affine written to each member is
   * `E = T(pivot) · matrix · T(-pivot)`, so the bare flip tuples become
   * in-place flips about the pivot. Pivot defaults to the selection
   * union-bbox center (via the attached surface's `geometry_provider`);
   * pass `opts.pivot` to override.
   *
   * Round-trip: `E` is folded onto each member's transform list as a
   * single LEADING `matrix` op — existing `rotate`/`translate` tokens are
   * preserved after it, repeated applies collapse into one matrix, and a
   * net-identity leading matrix is dropped (so flip-then-flip restores
   * the original). One atomic history step labelled `"transform"`.
   *
   * Refusal (returns `false`, no-op, no history): empty selection, no
   * `geometry_provider`, or any member failing `is_rotatable` (the same
   * non-trivial-transform / `<text rotate>` / CSS-property / animated
   * gate `rotate` uses). All-or-nothing — no partial writes.
   *
   * Flat-doc limitation: only each element's OWN transform is folded;
   * the pivot is treated as world ≡ parent space. Nested transformed
   * ancestors (`<g transform=…>`) are out of scope.
   */
  transform(
    matrix: Matrix2D,
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
  // clipboard — contract: docs/wg/feat-svg-editor/clipboard.md
  /**
   * Copy the selection as a **standalone SVG document** (the payload is
   * the file format — no private envelope). The payload carries the
   * outbound `url(#…)` / `href` reference closure in one `<defs>` block
   * and declares every namespace prefix the fragment borrows from
   * ancestor scope; ancestor transforms, inherited presentation, and the
   * viewport are deliberately NOT carried (verbatim policy — see the FRD).
   *
   * Pure read: no document mutation, no history entry. The payload is
   * always written to the editor's internal clipboard buffer (the
   * transport floor — cannot fail) and, when a `ClipboardProvider` is
   * configured, delivered to it best-effort (a failed provider write is
   * dev-warned, never a copy failure).
   *
   * Returns the payload string, or `null` on empty / non-live selection
   * (a no-op, not an error — copy has no refusal path).
   */
  copy(): string | null;
  /**
   * Copy, then delete the selection — ONE history step labeled `"cut"`
   * with {@link remove}'s exact capture/revert semantics. The payload is
   * secured in the internal buffer BEFORE the deletion commits, so a
   * failed external write never strands the user with deleted content
   * and no copy. The clipboard write is not part of the history step:
   * undo restores the document and leaves the buffer holding the payload
   * (cut → undo → paste works as a move idiom).
   *
   * Returns the payload string, or `null` on empty selection (no
   * mutation, no history).
   */
  cut(): string | null;
  /**
   * Paste SVG markup — `text` when given, else the internal clipboard
   * buffer. Synchronous over delivered text: acquisition from a native
   * clipboard event or an async provider read is the invoking channel's
   * job and completes before this command runs.
   *
   * Accepts anything {@link insert_fragment} parses (bare fragment or
   * full document — the editor's own payloads are an ordinary case, not
   * a privileged one) and inserts it with the same atomic semantics:
   * one history step, subtrees adopted verbatim, ids never rewritten,
   * namespace declarations hoisted, appended at the document top level,
   * inserted roots selected.
   *
   * **Gesture-grade refusal table** (deliberately weaker than
   * `insert_fragment`'s): paste's input is environment-supplied — prose,
   * URLs, and JSON are what clipboards hold most of the day — so
   * non-parseable input is a **no-op refusal** (`[]`, no mutation, no
   * history), never a thrown error. A non-string argument still throws
   * `TypeError` (caller bug — no acquisition channel produces one).
   * Empty selection→buffer misses (`undefined` text, empty buffer) also
   * return `[]`.
   */
  paste(text?: string): NodeId[];
  /**
   * Duplicate the selection in place — the **subtree-clone** operation
   * (the clipboard FRD's second extraction operation; design note:
   * `docs/wg/feat-svg-editor/subtree-clone.md`). Each normalized
   * selection root is cloned verbatim (byte-equal subtree markup — and
   * therefore NO defs closure, NO namespace shell: the destination is
   * the source document) and inserted as its origin's next sibling, so
   * the clone paints directly above its origin. Selection moves to the
   * clones. ONE history step; a single `undo()` removes the clones and
   * restores the prior selection.
   *
   * Authored `id=""` attributes are cloned verbatim, NEVER rewritten —
   * the document gains colliding ids that resolve first-in-document-order
   * (so a clone's internal self-reference resolves to the ORIGINAL);
   * dedup is the explicit Tidy command's job.
   *
   * **Repeating offset** (gridaco/grida#825, spec §Repeating offset):
   * duplicate, move the copy, duplicate again — the next copy lands at
   * the same relative offset from the previous one (Figma's repeating
   * duplicate; an Alt-drag clone commit arms the same memory, so ⌘D
   * after a clone-drag repeats the drag offset). Still ONE history
   * step: a single `undo()` removes copy + offset together. Requires an
   * attached geometry provider; when the repeat's preconditions don't
   * hold (selection isn't the previous clones, a copy was resized,
   * nothing moved, no geometry) the command degrades to the plain
   * in-place duplicate above — never an error.
   *
   * Refusal (no mutation, no history): an empty selection, or one that
   * normalizes to nothing cloneable (document root, nested `<svg>`,
   * stale / non-element ids) → `[]`. Returns the clone ids in document
   * order otherwise.
   */
  duplicate(): NodeId[];
  /**
   * Wrap the current selection in a new plain `<g>`. Returns `true` if
   * the wrap was performed (a history step was pushed and the new group
   * is the active selection); `false` if the policy in `GROUPING.md`
   * rejected the call.
   */
  group(): boolean;
  /**
   * Dissolve the selected `<g>` (or `opts.id`), hoisting its children
   * into the group's parent at the group's z-position. Returns `true`
   * when a history step was pushed (children hoisted, group removed, the
   * former children selected); `false` when the call was refused.
   *
   * Only the **safe clean-structural subset** is accepted (see
   * `core/group.ts:plan_ungroup` and `../docs/grouping.md` §Ungrouping).
   * Refused — with NO mutation and NO history entry — when: the target
   * is not a single `<g>`; the group is inside `<defs>`; the group has
   * no element children; the group carries any own attribute beyond
   * `{ transform, id, data-grida-id }` (i.e. any visual / cascade state
   * such as `opacity` / `class` / `style` / `filter` / `clip-path` /
   * `mask` / `fill`); the group's `id` is referenced by a `<use>`; a
   * direct child is an SMIL animation element; or — when the group has a
   * `transform` — any child's own transform is unparseable.
   *
   * When the group has a `transform`, it is BAKED into each child by
   * prepending the group's parsed ops to the child's (clean token
   * compose, not a matrix collapse), so paint output round-trips.
   */
  ungroup(opts?: { id?: NodeId }): boolean;
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
   * Atomic insertion of a pre-authored SVG **fragment** — one or more
   * sibling elements as markup (`"<g …><path …/></g>"`), or a full
   * `<svg>` document whose element children are taken as the content
   * (the `<svg>` shell — viewBox, width/height, prolog, doctype — is
   * discarded; an `<svg>` that is one of several top-level elements is
   * content and inserted as-is). The element subtrees are adopted
   * verbatim — every byte of trivia inside each element survives
   * (attribute order, quote styles, whitespace, comments) — inserted
   * contiguously in source order at `opts.parent` / `opts.index`, and
   * selected. ONE history step regardless of fragment size; a single
   * `undo()` restores the exact pre-insert serialization. Returns the
   * inserted top-level ids in document order.
   *
   * This is the markup-shaped sibling of {@link insert} — the primitive
   * paste and asset-stamping flows compose. Use `insert` for a tag +
   * attrs; use `insert_fragment` for markup.
   *
   * **Position is authored content.** There is deliberately no placement
   * opt: to land a fragment at a document-space point, author the
   * position into the markup before inserting — wrap it in
   * `<g transform="translate(x y)">…</g>` or set the elements' own
   * geometry attrs. Placement then round-trips as ordinary markup and
   * the whole drop is the same single undo step.
   *
   * **`id` collisions:** authored `id=""` attributes are inserted
   * verbatim, NEVER rewritten — silent id renaming is proprietary noise
   * (P1; README "What clean means" §3). When a fragment id collides
   * with an existing one, reference resolution (`url(#…)`, `href`)
   * follows the document-order rules of the host renderer; resolving
   * the duplication is the explicit Tidy command's job, not insertion's.
   *
   * **Namespaces:** when the fragment uses a prefix the document root
   * doesn't declare, the declaration is hoisted onto the root as part
   * of the same history step — `xlink` (well-known URI) and any prefix
   * the discarded `<svg>` shell declared. A prefix whose URI is not
   * discoverable is left as authored (the input was equally unbound as
   * a standalone document). An authored root declaration always wins —
   * never rebound.
   *
   * **Refusals:** an input with no top-level elements (empty /
   * whitespace / comments-only) returns `[]` with NO history step.
   * Throws on malformed markup (parser errors propagate), on a
   * non-string input, and on an `opts.parent` that isn't a live element
   * of the current document — a silent no-op there would hide consumer
   * bugs (same stance as `serialize_node`).
   *
   * `opts.parent` defaults to root; `opts.index` (position in the
   * parent's element-children list; the whole fragment lands
   * contiguously at it) defaults to append; `opts.select` defaults to
   * `true`.
   */
  insert_fragment(
    svg: string,
    opts?: { parent?: NodeId; index?: number; select?: boolean }
  ): NodeId[];
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
  /**
   * Insert one `<image>` from a **resolvable href** — a designed,
   * synchronous, headless image-insertion command. Design:
   * `docs/wg/feat-svg-editor/image-insertion.md`.
   *
   * A "resolvable href" is a reference the rendering context can already
   * fetch as-is: a remote URL, a `data:` URI, or a host-served URL. The
   * editor authors the element, places it, sizes it, selects it, and
   * records ONE history step — it NEVER reads a `File`, decodes bytes, or
   * fetches the href. Turning a local file into a URL, and decoding it to
   * learn an intrinsic size, is host-owned I/O (P2); the host does that
   * first and hands the result here.
   *
   * Distinct from {@link insert} (the generic tag + attrs primitive) by
   * design (FRD § The insertion contract): the href is a first-class,
   * named argument (it is the payload, not an opaque attr); the size has a
   * defined answer (R3); and the href-form decision (SVG 2 `href`, no
   * forced `xmlns:xlink`) is the command's to own, not the caller's.
   *
   * Behavior:
   *  - **SVG 2 `href`** is authored, never `xlink:href` — so no
   *    `xmlns:xlink` is forced onto the root (R4). `xlink:href` on a
   *    pre-existing image is still preserved on edit; it is just never
   *    AUTHORED for a new one.
   *  - **Explicit `width`/`height` always** (R3). `opts.width`/`height`
   *    when supplied; otherwise a named placeholder
   *    (`insertions.DEFAULT_IMAGE_SIZE`, explicitly NOT intrinsic) so the
   *    node is immediately selectable / resizable. The fallback is
   *    deliberate, not a refusal — insertion corrupts nothing.
   *  - **Placement** centers the element on `opts.at` (an `<image>`'s
   *    `x`/`y` are top-left, so top-left = `at − size/2`); with no `at`
   *    the element anchors at the document origin (top-left at `(0, 0)`).
   *  - **No content policy** (R6): the href is written and round-trips
   *    verbatim — no length cap on a `data:` URI, no scheme filter, no
   *    fetch-to-validate (P1 — content is sovereign).
   *
   * `opts.parent` defaults to root; `opts.index` defaults to append;
   * `opts.select` defaults to `true`. Returns the new node id. One undo
   * step (undo restores byte-equal; redo re-inserts and re-selects).
   *
   * The pointer-driven "place an already-chosen image by clicking the
   * canvas" tool, an async intrinsic-size resolver provider, and a drop
   * observation channel are all NAMED DEFERRALS (FRD § Out of scope) —
   * every v1 flow (drop, paste, programmatic) drives this command directly
   * with its own point and size.
   */
  insert_image(
    href: string,
    opts?: {
      at?: Vec2;
      width?: number;
      height?: number;
      parent?: NodeId;
      index?: number;
      select?: boolean;
    }
  ): NodeId;
  // content
  set_text(value: string): void;
  /**
   * Set the vertex / segment / tangent sub-selection while a vector
   * content-edit session is open (gridaco/grida#790). Returns `true` when the
   * sub-selection changed, `false` (no-op) when no vector session is active,
   * no DOM surface is attached, the input is out of range, or it resolves to
   * the current selection.
   *
   * `mode` defaults to `"replace"` (the input becomes the whole sub-selection;
   * omitted tracks are cleared). `"add"` / `"toggle"` fold the input into the
   * existing sub-selection per track, leaving omitted tracks intact. The write
   * is one undoable step, like a knob click. Indices are validated against the
   * path under edit; an out-of-range index or tangent ref refuses the whole
   * call. To open a path with an initial sub-selection in one step, pass the
   * same input to {@link SvgEditor.enter_content_edit}.
   */
  set_vector_selection(
    input: VectorSubSelectionInput,
    mode?: SelectMode
  ): boolean;
  /**
   * Delete the current vertex / segment / tangent sub-selection from the
   * open vector content-edit session (gridaco/grida#880). Removes only the
   * sub-selected geometry from the path under edit and rewrites its `d` (or
   * native attrs) as one undoable step; the element survives and stays in
   * edit mode, and the sub-selection is cleared. Returns `true` when a
   * deletion was applied, `false` (no-op) when no vector session is active,
   * no DOM surface is attached, nothing is sub-selected, or the policy-class
   * `delete-vertex` verdict refuses it (e.g. dropping a triangle `<polygon>`
   * below 3 vertices under the `restrict` policy).
   *
   * The session is surface-owned, so this routes through the surface driver
   * (symmetric to {@link Commands.set_vector_selection}).
   */
  delete_vector_selection(): boolean;
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
  /** `doc.revision` at the last load()/reset(); compared to derive `dirty`.
   *  The doc's own total mutation counter is the single edit-version
   *  source — `content_version`, `dirty`, and the typed-read memo caches
   *  all derive from it (no editor-side shadow counter to drift). */
  let baseline_revision = doc.revision;
  /**
   * Bumps once per `editor.load(svg)` call. The constructor's initial parse
   * does NOT count — it's the "factory" state. Hosts subscribe via
   * `subscribe_with_selector(s => s.load_version, ...)` to react to fresh
   * document loads without firing on every edit.
   */
  let load_version = 0;
  let style: EditorStyle = { ...DEFAULT_STYLE, ...opts.style };
  const providers = opts.providers ?? {};
  /**
   * In-memory clipboard buffer — the transport floor (FRD R1: the buffer
   * write cannot fail; external channels are best-effort on top). NOT part
   * of `EditorState` and NOT history-managed: it survives `load()` /
   * `reset()` / undo, like the OS clipboard it mirrors.
   */
  let clipboard_buffer: string | null = null;
  /**
   * The last committed duplication — read by the NEXT `duplicate()` to
   * repeat the user's translate delta (gridaco/grida#825; spec
   * §Repeating offset). Session state like `clipboard_buffer`: not in
   * `EditorState`, not history-managed (undo/redo replay never re-arms
   * it — only a user-initiated ⌘D or cloned-drag commit does). Staleness
   * is caught at use by `subtree.repeat_delta`; the only eager clears are
   * `load()` / `reset()`, where every NodeId dies wholesale.
   */
  let active_duplication: subtree.DuplicationRecord | null = null;
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
      dirty: doc.revision !== baseline_revision,
      can_undo: history.stack.canUndo,
      can_redo: history.stack.canRedo,
      version,
      content_version: doc.revision,
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
  /**
   * Fan out the geometry channel iff the doc's `geometry_version` has
   * moved since we last fired. Shared by the `doc.on_change` handler
   * (mutation-driven bumps) and the surface-driven `bump_geometry` seam
   * (font-load reflow). Idempotent against a stale version — never
   * double-fires for the same value.
   */
  function fire_geometry_listeners_if_advanced() {
    if (doc.geometry_version !== last_emitted_geometry_version) {
      last_emitted_geometry_version = doc.geometry_version;
      for (const cb of geometry_listeners) cb();
    }
  }

  doc.on_change(() => {
    // Fire the geometry channel only when the doc's geometry_version
    // advanced — pure presentation writes don't reach the geometry cache.
    // (Edit counting lives on the doc itself: `doc.revision`.)
    fire_geometry_listeners_if_advanced();
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
    // Selection-state invariant: a selection is always its SUBTREE ROOTS —
    // never an ancestor AND its descendant. `prune_nested_nodes` drops any id
    // whose ancestor is also present, so a marquee that catches `G` and its
    // children `A`, `B` collapses to `G`. Enforcing it HERE, the one chokepoint
    // every selection change funnels through, lets every downstream feature
    // (group, remove, translate, …) stay dumb and trust `state.selection` is
    // already compacted. Single-node selections short-circuit inside `prune`.
    // Spec: `docs/selection.md`.
    const pruned = doc.prune_nested_nodes(next);
    // No-op when membership and order are unchanged. Skips emit on
    // re-selecting the current selection (clicking an already-selected node
    // with no shift, etc.) — listeners on the hot path don't re-run.
    if (pruned.length === selection.length) {
      let same = true;
      for (let i = 0; i < pruned.length; i++) {
        if (pruned[i] !== selection[i]) {
          same = false;
          break;
        }
      }
      if (same) return;
    }
    selection = Object.freeze([...pruned]);
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
    // Payload-free tool variants are equal once their types match.
    if (
      a.type === "cursor" ||
      a.type === "lasso" ||
      a.type === "bend" ||
      a.type === "insert-text"
    )
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
  // repeated reads at the same `doc.revision` are O(1) cache hits; reads
  // across mutations rebuild and structurally diff against the last
  // snapshot, returning the prior reference when the underlying values
  // didn't change.

  type ReadProperty = ReturnType<typeof properties.read>;
  type PropertyMap = { readonly [name: string]: ReadProperty };

  const paint_cache = new Map<
    string,
    { revision: number; value: PaintValue }
  >();
  const property_cache = new Map<
    string,
    { revision: number; value: ReadProperty }
  >();
  const properties_cache = new Map<
    string,
    { revision: number; value: PropertyMap }
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
    if (cached && cached.revision === doc.revision) return cached.value;
    const next = properties.read(doc, id, name);
    if (cached && properties.value_equals(cached.value, next)) {
      cached.revision = doc.revision;
      return cached.value;
    }
    property_cache.set(key, { revision: doc.revision, value: next });
    return next;
  }

  function node_properties(
    id: NodeId,
    names: ReadonlyArray<string>
  ): PropertyMap {
    const key = `${id} ${names.join("")}`;
    const cached = properties_cache.get(key);
    if (cached && cached.revision === doc.revision) return cached.value;
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
      cached.revision = doc.revision;
      return cached.value;
    }
    const frozen = Object.freeze(next) as PropertyMap;
    properties_cache.set(key, { revision: doc.revision, value: frozen });
    return frozen;
  }

  function node_paint(id: NodeId, channel: "fill" | "stroke"): PaintValue {
    const key = `${id} ${channel}`;
    const cached = paint_cache.get(key);
    if (cached && cached.revision === doc.revision) return cached.value;
    const { declared, provenance } = properties.resolve_declared(
      doc,
      id,
      channel
    );
    const computed = paint.parse(declared);
    const next: PaintValue = { declared, computed, provenance };
    if (cached && paint.value_equals(cached.value, next)) {
      cached.revision = doc.revision;
      return cached.value;
    }
    paint_cache.set(key, { revision: doc.revision, value: next });
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

  /** Open `preview_property` sessions, keyed by property name. A discrete
   *  write to the same name supersedes the in-flight gesture: the session
   *  is silently discarded so a later host-side `commit()` cannot replay
   *  the stale previewed value over the discrete write. The stored
   *  function reverts the previewed value and unregisters itself. */
  const open_property_previews = new Map<string, () => void>();

  function supersede_property_preview(name: string) {
    open_property_previews.get(name)?.();
  }

  /** End EVERY open preview session. Called by operations that detach
   *  nodes (remove / cut, ungroup) or replace the document (load,
   *  reset): the sessions' deltas target nodes that are about to die,
   *  so a later close-time `commit()` would push a dead history step.
   *  Must run BEFORE the destructive mutation — each discard reverts
   *  its in-flight delta against the still-intact document. (Live
   *  iteration is safe: each discard deletes only its own map entry.) */
  function discard_open_property_previews() {
    for (const discard of open_property_previews.values()) discard();
  }

  function set_property(name: string, value: string | null) {
    if (selection.length === 0) return;
    // The discrete write supersedes any in-flight preview gesture on the
    // same property. Discard BEFORE capturing `before`: the undo snapshot
    // must be the pre-gesture state, not the previewed value.
    supersede_property_preview(name);
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
    // Opening a session on a name that already has one is the same
    // conflict as a discrete write: the new gesture supersedes the old.
    // Discard BEFORE capturing `before` so this session reverts to the
    // true pre-gesture state, not the prior session's previewed value.
    supersede_property_preview(name);
    // Targets are pinned at session open — `before` only covers these
    // nodes, so apply must never chase the live selection: a selection
    // change mid-gesture (or before a history redo replays the
    // committed delta) would write nodes the revert cannot restore.
    const targets = [...selection];
    const before: Array<{
      id: NodeId;
      attr: string | null;
      style: string | null;
    }> = [];
    for (const id of targets) {
      before.push({
        id,
        attr: doc.get_attr(id, name),
        style: doc.get_style(id, name),
      });
    }
    const preview = history.preview(`change ${name}`);
    // Once the session ends — committed, discarded, superseded, OR killed
    // by history itself (undo/redo discards every active preview) — every
    // method is a no-op: the host's close-time `commit()` and defensive
    // `discard()` stay valid calls instead of throwing on the dead
    // session. Liveness is read from `preview.state`, the producer's own
    // lifecycle, NOT a local flag: a flag cannot see history-initiated
    // discards and would desync on the first mid-gesture undo.
    const live = () => preview.state === "active";
    // Drop this session's registry entry — identity-checked, because a
    // superseding session re-occupies the same key and a late commit/
    // discard on the old session must not evict the new one.
    const close = () => {
      if (open_property_previews.get(name) === discard) {
        open_property_previews.delete(name);
      }
    };
    const discard = () => {
      close();
      if (live()) preview.discard();
    };
    open_property_previews.set(name, discard);
    return {
      get live() {
        return live();
      },
      update(value: string) {
        if (!live()) return;
        preview.set({
          providerId: PROVIDER_ID,
          apply: () => {
            for (const id of targets) write_property(id, name, value);
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
      commit: () => {
        close();
        if (live()) preview.commit();
      },
      discard,
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
      get live() {
        return session.live;
      },
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

  function set_opacity(value: number) {
    // No-op on a non-finite arg rather than writing `opacity="NaN"`; the
    // empty-selection no-op is `set_property`'s own guard.
    if (!Number.isFinite(value)) return;
    const clamped = cmath.clamp01(value);
    // `String(clamped)` keeps the value compact (`0.1`, `1`, `0`) — the same
    // shape the digit shortcut produces. One atomic "set opacity" step.
    set_property("opacity", String(clamped));
  }

  /** World→local delta projection shared by every one-shot translate
   *  writer (translate / nudge via `prepare_rpc`, align). Re-expresses a
   *  world-space delta in the frame the target's position attributes are
   *  written in — nested-viewport / transformed-ancestor correctness.
   *  Identity for flat docs and DOM-less hosts (no provider, or a
   *  provider without a layout engine). */
  const project_world_delta: translate_pipeline.DeltaProjector = (id, d) =>
    geometry_provider?.world_delta_to_local?.(id, d) ?? d;

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
      project: project_world_delta,
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

  // ─── resize: shared path (resize_to / resize_by go through these) ──────────
  //
  // `resize_to` (group / set-bbox) and `resize_by` (per-element nudge) are the
  // same operation — "for each member apply (sx, sy, origin), optionally a
  // group translate, in one atomic history step" — differing only in (a) the
  // gate refusal mode and (b) how each member's (sx, sy, origin) is derived.
  // Those two pieces are extracted so the callers stay tiny and can't drift.

  type ResizeMember = {
    id: NodeId;
    rz: ResizeBaseline;
    bbox: { x: number; y: number; width: number; height: number };
  };

  /**
   * Gate + capture for a resize gesture. Returns the resizable members (with
   * captured baseline / pre-transform / bbox), or `null` if the gesture can't
   * run: no geometry provider, empty selection, or — in `all_or_nothing` mode
   * — any member fails the gate.
   *
   * `mode`:
   *  - `"skip"`           — drop members failing the `is_resizable_node` gate
   *    (tag + transform class) or lacking a bbox; resize the rest. Used by the
   *    inspector `resize_to` (set-bbox) path.
   *  - `"all_or_nothing"` — refuse the WHOLE gesture (return `null`) if ANY
   *    member fails. Used by keyboard `resize_by` (nudge), matching the resize
   *    HUD, whose handle-drag is rejected when any member is unsafe.
   */
  function collect_resize_members(
    ids: ReadonlyArray<NodeId>,
    mode: "skip" | "all_or_nothing"
  ): ResizeMember[] | null {
    if (ids.length === 0) return null;
    if (!geometry_provider) return null;
    const members: ResizeMember[] = [];
    for (const id of ids) {
      // Gate on `is_resizable_node` (tag AND transform class), not the
      // tag-only `is_resizable`: scaling local attrs around a world-space
      // origin is only correct when world ≡ local; a non-trivial transform
      // (rotate-without-pivot, matrix, scale, skew) breaks that and would
      // resize it incorrectly / violate P1. Mirrors the HUD resize gate. Admitted:
      // identity, leading-translate, `rotate(θ cx cy)` with explicit pivot.
      if (!resize_pipeline.intent.is_resizable_node(doc, id)) {
        if (mode === "all_or_nothing") return null;
        continue;
      }
      const bbox = geometry_provider.bounds_of(id);
      if (!bbox) {
        if (mode === "all_or_nothing") return null;
        continue;
      }
      members.push({
        id,
        rz: resize_pipeline.intent.capture_baseline(doc, id, bbox),
        bbox,
      });
    }
    return members.length === 0 ? null : members;
  }

  /**
   * Apply a resize to each member, optionally followed by a uniform group
   * translate, as ONE atomic history step. `op` resolves each member's scale
   * factors + scale origin; `group_translate` is the post-scale envelope shift
   * (group resize only — `null` for per-element). Callers guarantee `members`
   * is non-empty. Returns `true` when a history step was pushed; `false` when
   * the gesture is geometrically identity (no member scales and no group
   * translate) so undo isn't polluted with an empty step. NOTE: a per-tag
   * constraint that collapses a non-1 factor to identity *inside* the handler
   * (e.g. `<circle>` uniform `min` on a single-axis nudge) is not detected
   * here — the op-level factor is still ≠ 1, so that case still pushes a step.
   */
  function commit_resize(
    members: ResizeMember[],
    op: (m: ResizeMember) => {
      sx: number;
      sy: number;
      origin: { x: number; y: number };
    },
    group_translate: { dx: number; dy: number } | null,
    label: string
  ): boolean {
    const ops = members.map((m) => ({ m, ...op(m) }));
    // Identity gesture → no history step (avoids empty undo entries, e.g.
    // nudging the zero-extent axis of a degenerate shape).
    const scales = ops.some(({ sx, sy }) => sx !== 1 || sy !== 1);
    const translates =
      !!group_translate &&
      (group_translate.dx !== 0 || group_translate.dy !== 0);
    if (!scales && !translates) return false;
    const apply = () => {
      for (const { m, sx, sy, origin } of ops) {
        resize_pipeline.intent.apply(doc, m.id, m.rz, sx, sy, origin);
      }
      if (
        group_translate &&
        (group_translate.dx !== 0 || group_translate.dy !== 0)
      ) {
        // Re-capture translate baselines after scale wrote new attrs —
        // otherwise apply_translate would offset the pre-scale values and
        // double-account or back-step.
        for (const m of members) {
          const tx_after = translate_pipeline.intent.capture_baseline(
            doc,
            m.id
          );
          translate_pipeline.intent.apply(
            doc,
            m.id,
            tx_after,
            group_translate.dx,
            group_translate.dy
          );
        }
      }
      emit();
    };
    const revert = () => {
      for (const { m } of ops) {
        // Byte-exact snapshot restore — covers every attr the apply step
        // can write (per-tag geometry, plus `transform` rewritten by
        // apply_translate.viaTransform / pivot renormalization). NOT
        // apply at sx=sy=1: handlers may refuse gesture shapes (text
        // refuses non-corner input) and would silently skip the restore.
        resize_pipeline.intent.restore(doc, m.id, m.rz);
      }
      emit();
    };
    apply();
    history.atomic(label, (tx) => {
      tx.push({ providerId: PROVIDER_ID, apply, revert });
    });
    return true;
  }

  /**
   * One-shot multi-member resize to an explicit target rect. Mirrors a
   * drag-resize gesture in mechanics — capture per-member baselines,
   * scale around the union's NW corner, translate the result so the
   * union NW lands at the requested position — but as a single
   * atomic step rather than a preview session. This is the GROUP path:
   * the whole selection is treated as one envelope.
   *
   * The function does its own geometry lookup via the
   * `geometry_provider` registered by the DOM surface. When no surface
   * is attached, the call is a no-op (returns `false`). Members that fail
   * the `is_resizable_node` gate — an unresizable tag (e.g. `<g>`) OR a
   * non-trivially-transformed element — are silently skipped (see
   * `collect_resize_members`).
   *
   * Revert restores the captured `transform` attribute and all
   * geometry attrs the apply step wrote — so a `<rect>` with an
   * existing `transform` round-trips cleanly. See `apply_translate`'s
   * `viaTransform` arm for why this matters.
   */
  function resize_to(
    target: { x: number; y: number; width: number; height: number },
    opts?: { ids?: ReadonlyArray<NodeId>; label?: string }
  ): boolean {
    const members = collect_resize_members(opts?.ids ?? selection, "skip");
    if (!members) return false;

    const union = cmath.rect.union(members.map((m) => m.bbox));
    const sx = union.width === 0 ? 1 : target.width / union.width;
    const sy = union.height === 0 ? 1 : target.height / union.height;
    // Origin = union NW: scale keeps the union NW fixed; an explicit group
    // translate then lands it at target NW. Every member shares this one
    // (sx, sy, origin) — the whole selection scales as one envelope, so
    // off-origin members move relative to the union (group semantics).
    const origin = { x: union.x, y: union.y };
    return commit_resize(
      members,
      () => ({ sx, sy, origin }),
      { dx: target.x - union.x, dy: target.y - union.y },
      opts?.label ?? "resize-to"
    );
  }

  /**
   * Resize by a `{dw, dh}` delta — the core verb behind keyboard nudge-resize
   * (`Ctrl+Alt+Arrow`). This is the PER-ELEMENT path: each selected member
   * grows/shrinks by the delta around ITS OWN NW corner, so members keep their
   * positions relative to one another. This deliberately differs from
   * {@link resize_to} (the group/envelope path): a HUD group-resize scales the
   * whole selection around the shared union origin, translating off-origin
   * members — correct for a drag handle, wrong for a keyboard nudge, whose UX
   * is "apply the delta to each".
   *
   * ALL-OR-NOTHING gate (`collect_resize_members("all_or_nothing")`): refuses
   * (returns `false`, no history step) on empty selection, no geometry
   * provider, or any member failing the `is_resizable_node` gate — matching
   * the resize HUD rather than `resize_to`'s per-member skip.
   */
  function resize_by(
    delta: { dw: number; dh: number },
    opts?: { ids?: ReadonlyArray<NodeId> }
  ): boolean {
    const members = collect_resize_members(
      opts?.ids ?? selection,
      "all_or_nothing"
    );
    if (!members) return false;
    // Each member around its OWN NW (origin = member bbox NW), its OWN factor
    // from its OWN bbox + delta. No group translate → members do not move
    // relative to one another. The factor `(size + d)/size` makes the resize
    // additive (size·factor = size + d), so each member grows by exactly
    // `dw` / `dh`; the guard handles a degenerate zero-size axis, the clamp
    // keeps it non-negative.
    const axis = (size: number, d: number) =>
      size === 0 ? 1 : Math.max(0, size + d) / size;
    return commit_resize(
      members,
      (m) => ({
        sx: axis(m.bbox.width, delta.dw),
        sy: axis(m.bbox.height, delta.dh),
        origin: { x: m.bbox.x, y: m.bbox.y },
      }),
      null,
      "nudge-resize"
    );
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

  /**
   * Relative affine compose about a pivot. See the `Commands.transform`
   * doc for the full contract. This function owns ONLY the pivot/effective-
   * matrix computation (which needs `geometry_provider`); the parse→fold→
   * emit round-trip is delegated per-member to the pure
   * `transform.apply_affine` helper.
   */
  function apply_transform(
    matrix: Matrix2D,
    opts?: {
      ids?: ReadonlyArray<NodeId>;
      pivot?: { x: number; y: number };
    }
  ): boolean {
    const ids = opts?.ids ?? selection;
    if (ids.length === 0) return false;
    if (!geometry_provider) return false;

    // All-or-nothing transformability gate. Distinct from `rotate`'s gate
    // (`is_transformable`, not `is_rotatable`): `transform` folds a leading
    // matrix onto whatever transform the element already has, so it does NOT
    // refuse a matrix/scale/skew transform — that's what makes flip-then-flip
    // toggle. It still refuses the genuine conflicts (unparseable transform,
    // inline CSS `transform`, `<animateTransform>` child, `<text rotate>`).
    // Any refusal aborts the whole command with no IR mutation, no history.
    for (const id of ids) {
      if (rotate_pipeline.intent.is_transformable(doc, id).kind === "refuse") {
        return false;
      }
    }

    const pivot = opts?.pivot ?? default_rotate_pivot(ids);

    // The host's request as a 2×3 affine. SVG `matrix(a b c d e f)` maps to
    // `cmath.Transform = [[a, c, e], [b, d, f]]`.
    const [a, b, c, d, e, f] = matrix;
    const requested: cmath.Transform = [
      [a, c, e],
      [b, d, f],
    ];
    // Re-center the affine about `pivot`: `E = T(pivot) · matrix · T(-pivot)`.
    const t_pivot: cmath.Transform = [
      [1, 0, pivot.x],
      [0, 1, pivot.y],
    ];
    const t_neg_pivot: cmath.Transform = [
      [1, 0, -pivot.x],
      [0, 1, -pivot.y],
    ];
    const effective = cmath.transform.multiply(
      cmath.transform.multiply(t_pivot, requested),
      t_neg_pivot
    );

    // Capture each member's pre-value, then fold `effective` onto its
    // leading matrix via the pure helper. The helper returns `null` to
    // signal "remove the attribute" (net identity, no other ops).
    type Member = { id: NodeId; transform_pre: string | null };
    const members: Member[] = ids.map((id) => ({
      id,
      transform_pre: doc.get_attr(id, "transform"),
    }));
    const apply = () => {
      for (const m of members) {
        doc.set_attr(
          m.id,
          "transform",
          transform.apply_affine(m.transform_pre, effective)
        );
      }
      emit();
    };
    const revert = () => {
      for (const m of members) doc.set_attr(m.id, "transform", m.transform_pre);
      emit();
    };
    apply();
    history.atomic("transform", (tx) => {
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
   * history step. Deltas are computed in world space and re-expressed in
   * each member's local frame before writing (`world_delta_to_local`),
   * so members under scaled/rotated ancestors land exactly and a repeat
   * invocation is a no-op.
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
    const world_deltas = compute_align_deltas(members, target, direction);
    if (world_deltas.size === 0) return false;

    // Deltas are world-space but `intent.apply` writes own-frame attrs —
    // unprojected, a scaled/rotated ancestor turns every delta into an
    // over/undershoot and repeated aligns oscillate instead of settling.
    // Projected eagerly, not inside the closures, so redo replays the
    // exact deltas even after the surface detaches.
    const deltas = new Map<NodeId, Vec2>();
    for (const [id, d] of world_deltas) {
      deltas.set(id, project_world_delta(id, d));
    }

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
    remove_selection("remove");
  }

  /**
   * Shared deletion body for `remove` and `cut` — identical
   * capture/revert semantics, differing only in the history label
   * (`verb`), so undo attribution names the gesture that caused the
   * deletion.
   */
  function remove_selection(verb: string) {
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

    // Deletion supersedes every open property-preview session — see
    // `discard_open_property_previews`. (`cut` runs the sweep earlier,
    // before its payload capture; this call is then a no-op.)
    discard_open_property_previews();

    // Sort by document order — apply removes top-to-bottom; revert
    // reinserts bottom-to-top so each captured `next_element_sibling`
    // anchor is still present in the parent when its predecessor
    // re-attaches above it.
    const targets = [...filtered].sort(subtree.by_document_order(doc));

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
      captures.length === 1 ? verb : `${verb} ${captures.length}`,
      (tx) => {
        tx.push({ providerId: PROVIDER_ID, apply, revert });
      }
    );
  }

  function group(): boolean {
    // `selection` is already compacted to subtree roots by `set_selection`, so
    // a marquee that caught a container AND its children arrives here as just
    // the container(s) + siblings. `group` stays dumb about that invariant.
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

  function ungroup(opts?: { id?: NodeId }): boolean {
    // Target resolution. With an explicit `opts.id`, that's the target.
    // Without one, operate on the single selected node (refuse a 0- or
    // multi-selection — ungroup is a single-group action).
    let target: NodeId;
    if (opts?.id !== undefined) {
      target = opts.id;
    } else {
      if (selection.length !== 1) return false;
      target = selection[0];
    }

    // End open preview sessions BEFORE planning: the plan must evaluate
    // the COMMITTED document, not transient preview state — a previewed
    // attribute would otherwise leak into the plan (a previewed
    // `transform` passes the own-attribute allowlist and would be baked
    // into children) or phantom-refuse it (any other previewed property
    // fails the allowlist). Eager on refusal by design: a structural
    // command on the gesture's own target ends the gesture.
    discard_open_property_previews();

    const plan = group_policy.plan_ungroup(doc, target);
    if (!plan) return false;

    const group_id = plan.group_id;

    // Capture for revert (BEFORE any mutation):
    //   - the group's slot among its parent's element-children, so revert
    //     re-inserts it exactly where it was (paint order round-trips).
    //   - each child's original `transform=` value, so baking is undoable
    //     byte-equal even for children that started with no transform.
    const group_next_sibling = doc.next_element_sibling_of(group_id);
    const original_child_transforms = new Map<NodeId, string | null>();
    for (const child of plan.children) {
      original_child_transforms.set(child, doc.get_attr(child, "transform"));
    }

    // Bake the group transform into each child by PREPENDING the group's
    // parsed ops to the child's parsed ops, then re-emitting clean tokens.
    // We compose op LISTS (`translate(...) rotate(...)`), NOT a collapsed
    // `matrix(...)`: SVG applies a transform list left-to-right, so the
    // group's transform must lead the child's to preserve the same visual
    // order. Keeping clean tokens (rather than collapsing to a matrix)
    // means the result stays human-readable and round-trips through the
    // transform parser without trig drift. When the group has no
    // transform, children are untouched.
    const group_ops =
      plan.group_transform === null
        ? []
        : (transform.parse(plan.group_transform) ?? []);

    const original_selection = selection;
    const apply = () => {
      if (group_ops.length > 0) {
        for (const child of plan.children) {
          const child_ops =
            transform.parse(doc.get_attr(child, "transform")) ?? [];
          const next = transform.emit([...group_ops, ...child_ops]);
          doc.set_attr(child, "transform", next === "" ? null : next);
        }
      }
      // Hoist each child into the parent at the group's z-position, in
      // document order: insert before the still-present group so the
      // children land in order at the group's slot. Then remove the
      // (now-empty) group.
      for (const child of plan.children) {
        doc.insert(child, plan.parent, group_id);
      }
      doc.remove(group_id);
      set_selection(plan.children);
    };
    const revert = () => {
      // Re-insert the group at its captured slot, then move children back
      // into it in document order. The children currently sit immediately
      // before the group's slot in the parent (where apply hoisted them);
      // re-inserting the group ahead of them and then moving each child
      // into the group (append) restores the exact element-tree shape.
      doc.insert(group_id, plan.parent, group_next_sibling);
      for (const child of plan.children) {
        doc.insert(child, group_id, null);
      }
      // Restore each child's original transform (reverse the bake). A
      // child that had no transform gets the attribute removed again.
      if (group_ops.length > 0) {
        for (const child of plan.children) {
          doc.set_attr(
            child,
            "transform",
            original_child_transforms.get(child) ?? null
          );
        }
      }
      set_selection(original_selection);
    };
    apply();
    history.atomic("ungroup", (tx) => {
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
  /**
   * Resolve an optional `index` (position in `parent`'s element-children
   * list to insert AT — anything at or after it shifts; out-of-range or
   * `undefined` appends) to an insert-before anchor. Shared by `insert`,
   * `insert_fragment`, and `insert_preview`.
   */
  function resolve_insert_before(
    parent: NodeId,
    index: number | undefined
  ): NodeId | null {
    if (index === undefined) return null;
    return doc.element_children_of(parent)[index] ?? null;
  }

  function insert(
    tag: string,
    attrs: Readonly<Record<string, string>>,
    opts?: { parent?: NodeId; index?: number; select?: boolean }
  ): NodeId {
    const parent = opts?.parent ?? doc.root;
    const select_after = opts?.select !== false;
    const insert_before = resolve_insert_before(parent, opts?.index);
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
   * Designed `<image>` insertion — contract in {@link Commands.insert_image}
   * (design: `docs/wg/feat-svg-editor/image-insertion.md`).
   *
   * Synchronous and headless: no byte read, no decode, no fetch. The href
   * is the payload; the host supplies the intrinsic size (or the named
   * placeholder is written). Composes the atomic `insert` primitive so it
   * inherits the one-history-step / select / undo-redo-byte-equal semantics
   * — this command's own job is purely to author the clean attr set
   * (`insertions.image_attrs`: SVG 2 `href`, explicit size, center-on-point
   * placement). `<image>` carries no default paint
   * (`default_paint_attrs_for` returns `{}` for it), so what lands is
   * exactly the authored attrs and nothing else (R4 — one-element delta).
   */
  function insert_image(
    href: string,
    opts?: {
      at?: Vec2;
      width?: number;
      height?: number;
      parent?: NodeId;
      index?: number;
      select?: boolean;
    }
  ): NodeId {
    const attrs = insertions.image_attrs(href, {
      at: opts?.at,
      width: opts?.width,
      height: opts?.height,
    });
    return insert("image", attrs, {
      parent: opts?.parent,
      index: opts?.index,
      select: opts?.select,
    });
  }

  /**
   * Atomic fragment insertion — contract in {@link Commands.insert_fragment}.
   * Parses + adopts via `doc.create_fragment` (subtrees registered but
   * detached, like `create_element` — history.redo finds them via
   * closure), computes the namespace hoist plan, then brackets inserts +
   * hoisted declarations + selection in ONE history step.
   */
  function insert_fragment(
    svg: string,
    opts?: { parent?: NodeId; index?: number; select?: boolean }
  ): NodeId[] {
    return insert_fragment_impl(svg, opts, "insert fragment");
  }

  /**
   * Label-bearing body shared by `insert_fragment` and `paste` — same
   * atomic insertion, differing only in history attribution (undo for a
   * paste gesture should read "paste", not "insert fragment").
   */
  function insert_fragment_impl(
    svg: string,
    opts: { parent?: NodeId; index?: number; select?: boolean } | undefined,
    label: string
  ): NodeId[] {
    const parent = opts?.parent ?? doc.root;
    if (!doc.is_element(parent) || !doc.contains(doc.root, parent)) {
      throw new Error(
        `insert_fragment: parent ${JSON.stringify(parent)} is not an element in the current document`
      );
    }
    const select_after = opts?.select !== false;
    const { roots, xmlns } = doc.create_fragment(svg);
    if (roots.length === 0) return [];

    // Namespace fidelity guard (same spirit as `retype_to_path`'s
    // synthetic `fill="none"`). A fragment is not a standalone document —
    // it may use prefixes whose declarations lived on a discarded
    // ancestor. Inserting such content into a document whose root doesn't
    // declare the prefix would serialize a namespace-ill-formed file that
    // strict XML consumers reject wholesale. Hoist the declarations we
    // can resolve: `xlink` (well-known URI) and anything the discarded
    // `<svg>` shell declared. Their writes ride the same atomic step.
    const known_uri = new Map(WELL_KNOWN_NS_PREFIXES);
    for (const d of xmlns) known_uri.set(d.prefix, d.uri);
    const hoist: Array<{ prefix: string; uri: string }> = [];
    const considered = new Set<string>();
    for (const id of roots) {
      for (const prefix of doc.undeclared_ns_prefixes(id)) {
        if (considered.has(prefix)) continue;
        considered.add(prefix);
        // An authored declaration on the root wins — never rebind.
        if (doc.get_attr(doc.root, prefix, XMLNS_NS) !== null) continue;
        const uri = known_uri.get(prefix);
        // No discoverable URI → left as authored; the input was equally
        // unbound as a standalone document.
        if (uri === undefined) continue;
        hoist.push({ prefix, uri });
      }
    }

    const insert_before = resolve_insert_before(parent, opts?.index);
    const previous_selection = selection;
    const apply = () => {
      for (const { prefix, uri } of hoist) doc.declare_xmlns(prefix, uri);
      // Each root is inserted before the same anchor, in source order —
      // the whole fragment lands contiguously, order preserved.
      for (const id of roots) doc.insert(id, parent, insert_before);
      if (select_after) set_selection(roots);
    };
    const revert = () => {
      for (let i = roots.length - 1; i >= 0; i--) doc.remove(roots[i]);
      for (const { prefix } of hoist) {
        doc.set_attr(doc.root, prefix, null, XMLNS_NS);
      }
      if (select_after) set_selection(previous_selection);
    };
    apply();
    history.atomic(label, (tx) => {
      tx.push({ providerId: PROVIDER_ID, apply, revert });
    });
    return roots;
  }

  // ─── Clipboard ───────────────────────────────────────────────────────────
  // Contract: docs/wg/feat-svg-editor/clipboard.md. Payload assembly is
  // core/clipboard.ts (pure); these commands own the buffer + transport
  // write-through. `deliver_external` implements the one-external-channel
  // rule: the public commands deliver to the provider; the surface's
  // native-event path calls `_internal.clipboard.*` (deliver=false) and
  // writes the event's DataTransfer instead — one gesture, one external
  // write.

  function copy_impl(deliver_external: boolean): string | null {
    const payload = clipboard_codec.extract_payload(doc, selection);
    if (payload === null) return null;
    clipboard_buffer = payload;
    if (deliver_external && providers.clipboard) {
      void providers.clipboard.write(payload).catch((err) => {
        // Best-effort external delivery (FRD R1): the buffer is the
        // success floor; a failed provider write is reportable, never a
        // copy failure.
        console.warn("[svg-editor] clipboard provider write failed:", err);
      });
    }
    return payload;
  }

  function copy(): string | null {
    return copy_impl(true);
  }

  function cut_impl(deliver_external: boolean): string | null {
    // No-op guard FIRST: an empty-selection cut does nothing and must
    // not end in-flight gestures (parity with remove_selection's
    // sweep-after-guards placement).
    if (selection.length === 0) return null;
    // End in-flight preview sessions BEFORE capturing the payload: the
    // deletion will discard them anyway (remove_selection), but if that
    // happened after the copy, the clipboard would carry the previewed
    // (never-committed) values while undo restores the pre-gesture
    // state — paste and undo would disagree.
    discard_open_property_previews();
    // Extract BEFORE removing — `serialize_node` throws on detached
    // nodes, and the FRD requires the payload secured in the buffer
    // before the deletion commits.
    const payload = copy_impl(deliver_external);
    if (payload === null) return null;
    remove_selection("cut");
    return payload;
  }

  function cut(): string | null {
    return cut_impl(true);
  }

  function paste(text?: string): NodeId[] {
    if (text !== undefined && typeof text !== "string") {
      throw new TypeError(
        `paste(text) requires a string when provided, got ${text === null ? "null" : typeof text}`
      );
    }
    const source = text ?? clipboard_buffer;
    if (source === null) return [];
    try {
      return insert_fragment_impl(source, undefined, "paste");
    } catch (err) {
      if (err instanceof TypeError) throw err;
      // Gesture-grade refusal (FRD §Command semantics): paste's input is
      // environment-supplied — prose, URLs, JSON are what clipboards hold
      // most of the day — so non-parseable input is a no-op, never a
      // throw. Mutation-safe to catch here: `create_fragment` parses the
      // whole input before adopting anything, so a parse error precedes
      // any document-visible change. `insert_fragment` (whose caller
      // authored its input) keeps strict error semantics.
      return [];
    }
  }

  /**
   * Duplicate over `subtree.clone_plan` — see the `Commands` doc. Same
   * atomic shape as `insert_fragment_impl`: closures own the
   * insert/remove pair so redo re-inserts the same NodeIds.
   *
   * Repeating offset (gridaco/grida#825, spec §Repeating offset): when
   * the targets are exactly the previous duplication's clones and
   * geometry witnesses a rigid translate between that record's origins
   * and clones, the fresh clones land displaced by the same delta. The
   * offset rides the translate pipeline INSIDE the same atomic step —
   * one undo removes copy + offset together. Clone baselines are
   * key-swapped from the origins (a clone is a verbatim copy at rest —
   * the orchestrator's `enter_clone` trick), so nothing reads the
   * detached clones. Any failed precondition degrades to plain
   * duplicate-in-place; never an error.
   */
  function duplicate(): NodeId[] {
    const plan = subtree.clone_plan(doc, selection);
    if (plan.length === 0) return [];
    const clones = plan.map((p) => p.clone);
    const origins = plan.map((p) => p.origin);
    const previous_selection = selection;
    // Measured BEFORE any mutation: both bbox reads (previous origins,
    // previous clones) must see the document as the user left it.
    const delta = subtree.repeat_delta(active_duplication, origins, (id) =>
      geometry_provider ? geometry_provider.bounds_of(id) : null
    );
    let offset_plan: TranslatePlan | null = null;
    if (delta) {
      const baselines = new Map<NodeId, TranslateBaseline>();
      for (const p of plan) {
        baselines.set(
          p.clone,
          translate_pipeline.intent.capture_baseline(doc, p.origin)
        );
      }
      offset_plan = { ids: clones, baselines, delta };
    }
    const apply = () => {
      subtree.insert_plan(doc, plan);
      if (offset_plan) {
        translate_pipeline.apply(doc, offset_plan, project_world_delta);
      }
      set_selection(clones);
    };
    const revert = () => {
      if (offset_plan) translate_pipeline.revert(doc, offset_plan);
      subtree.remove_plan(doc, plan);
      set_selection(previous_selection);
    };
    apply();
    history.atomic("duplicate", (tx) => {
      tx.push({ providerId: PROVIDER_ID, apply, revert });
    });
    // Arm the record AFTER the commit, OUTSIDE the closures — history
    // replay must not re-arm a stale record.
    active_duplication = { origins, clones };
    return clones;
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
    const insert_before = resolve_insert_before(parent, opts?.index);
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
    // Liveness reads the producer's own lifecycle, not a local flag — a
    // flag cannot see history-initiated discards (undo/redo, and
    // history.clear() on load/reset), and calling into a dead preview
    // throws. Same rule as `preview_property`.
    const live = () => preview.state === "active";

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
        if (!live()) return;
        for (const name in attrs) {
          live_attrs[name] = attrs[name];
          doc.set_attr(id, name, attrs[name]);
        }
        preview.set(entry);
      },
      commit() {
        if (!live()) return;
        preview.commit();
      },
      discard() {
        if (!live()) return;
        preview.discard();
      },
    };
  }

  /**
   * Text-creation bracket for the click-to-place text tool. Creates an
   * empty `<text>` with `initial` attrs, opens a single history preview,
   * and selects it — the DOM surface then mounts inline content-edit on
   * it. The surface finalizes the returned session when content-edit
   * exits:
   *
   *  - `commit()` — snapshots the live text content into the delta and
   *    commits ONE undo step (create + text together). Redo replays both,
   *    so a redone text insert keeps its content (a plain `insert_preview`
   *    would lose it — text is not an attribute).
   *  - `discard()` — rolls the creation back entirely: no node, no
   *    committed history entry. This is the empty-equals-delete rule for a
   *    freshly-placed node (design:
   *    `docs/wg/feat-svg-editor/text-tool.md`).
   *
   * The node is inserted empty on open (so the caret has somewhere to
   * live); live edits mutate its text in place, and `commit()` reads the
   * final text back off the document.
   */
  function insert_text_preview(
    initial: Readonly<Record<string, string>>,
    opts?: { parent?: NodeId }
  ): { id: NodeId; commit(): void; discard(): void } {
    const parent = opts?.parent ?? doc.root;
    const id = doc.create_element("text");
    const previous_selection = selection;
    const attrs = { ...initial };
    // Read back at commit() so redo replays the final authored text.
    let committed_text = "";
    const apply = () => {
      for (const name in attrs) doc.set_attr(id, name, attrs[name]);
      if (doc.parent_of(id) === null) doc.insert(id, parent, null);
      doc.set_text(id, committed_text);
      set_selection([id]);
    };
    const revert = () => {
      doc.remove(id);
      set_selection(previous_selection);
    };
    const preview = history.preview("insert text");
    // Liveness from `preview.state` — see `insert_preview`.
    const live = () => preview.state === "active";
    // First apply: empty node, selected. Content-edit mutates the node's
    // text in place from here (the node is already in the tree).
    preview.set({ providerId: PROVIDER_ID, apply, revert });
    return {
      id,
      commit() {
        if (!live()) return;
        committed_text = doc.text_of(id);
        preview.commit();
      },
      discard() {
        if (!live()) return;
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

  let content_edit_driver:
    | ((target: NodeId, opts?: VectorSubSelectionInput) => boolean)
    | null = null;
  // Editor → surface driver for vector sub-selection writes. The session is
  // surface-owned, so `commands.set_vector_selection` reaches it only through
  // this slot (symmetric to `content_edit_driver`). Null without a surface.
  let vector_subselect_driver:
    | ((input: VectorSubSelectionInput, mode?: SelectMode) => boolean)
    | null = null;
  // Editor → surface driver for vector sub-selection DELETION (#880). Same
  // rationale as `vector_subselect_driver`: the session is surface-owned, so
  // `commands.delete_vector_selection` reaches it only through this slot.
  let vector_delete_driver: (() => boolean) | null = null;
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

  // Pick channel — a transient "the user tapped here, on this node" event.
  // Like surface-hover, kept out of EditorState (a pick is an edge, not steady
  // state) and off the `version` stream so it never triggers snapshot
  // re-renders. The surface pushes a fully-resolved PickEvent; the editor only
  // fans it out. Observe-only: emitting a pick never mutates editor state.
  const pick_listeners = new Set<(e: PickEvent) => void>();
  function notify_pick(e: PickEvent) {
    for (const cb of pick_listeners) cb(e);
  }

  // Vector sub-selection channel — the surface publishes the live vertex /
  // segment / tangent sub-selection here. Like surface-hover and pick, kept
  // out of EditorState and off the `version` stream: it changes at pointer
  // rate during marquee / lasso, so a `version` bump per knob would re-render
  // the whole app (P4 — subscribe to outcomes). `null` when no session.
  let current_vector_subselection: VectorSubSelection | null = null;
  const vector_subselection_listeners = new Set<
    (sel: VectorSubSelection | null) => void
  >();
  function notify_vector_subselection() {
    for (const cb of vector_subselection_listeners) {
      cb(current_vector_subselection);
    }
  }
  function _set_current_vector_subselection(sel: VectorSubSelection | null) {
    current_vector_subselection = sel;
    notify_vector_subselection();
  }

  function enter_content_edit(
    target?: NodeId,
    opts?: VectorSubSelectionInput
  ): boolean {
    const id = target ?? (selection.length === 1 ? selection[0] : null);
    if (!id) return false;
    // Accept text (`<text>`/`<tspan>` leaf) OR vector (`<path>`/`<line>`/
    // `<polyline>`/`<polygon>`). The vector predicate widens what was
    // previously a path-only gate (see core/document.ts
    // `is_vector_edit_target`). The driver (DOM surface) routes by tag
    // inside `dom.ts:enter_content_edit`. `opts` carries an optional initial
    // vector sub-selection (gridaco/grida#790) — ignored for text targets.
    if (!doc.is_text_edit_target(id) && doc.is_vector_edit_target(id) === null)
      return false;
    if (!content_edit_driver) return false;
    return content_edit_driver(id, opts);
  }

  function set_vector_selection(
    input: VectorSubSelectionInput,
    mode?: SelectMode
  ): boolean {
    // The vector session lives on the surface; reach it through the driver
    // (no surface ⇒ no session ⇒ no-op). The driver owns validation, the
    // session mutation, and the undoable history step.
    if (!vector_subselect_driver) return false;
    return vector_subselect_driver(input, mode);
  }

  function delete_vector_selection(): boolean {
    // Same surface-owned-session routing as `set_vector_selection`: no driver
    // ⇒ no session ⇒ no-op. The driver owns the policy gate, the geometry
    // write, and the undoable history step.
    if (!vector_delete_driver) return false;
    return vector_delete_driver();
  }

  function load_svg(svg: string) {
    // End open preview sessions BEFORE the document swap: their reverts
    // must run against the old document (the parser reuses NodeIds per
    // parse, so a late revert would stamp old values onto colliding
    // new-document nodes), and a close-time commit() must not push a
    // dead step into the fresh history.
    discard_open_property_previews();
    // history.clear() BEFORE doc.load — @grida/history's ordering
    // contract: clear() discards every still-active preview (gesture
    // orchestrators, insert previews) by reverting their deltas, and
    // those reverts must run while the outgoing document is still
    // installed. Clear first, then swap.
    history.clear();
    doc.load(svg);
    selection = [];
    scope = null;
    mode = "select";
    tool = TOOL_CURSOR;
    active_duplication = null;
    baseline_revision = doc.revision;
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
    set_opacity,
    translate,
    nudge,
    resize_to,
    resize_by,
    rotate,
    rotate_to,
    transform: apply_transform,
    flatten_transform,
    align,
    reorder,
    remove,
    copy,
    cut,
    paste,
    duplicate,
    group,
    ungroup,
    insert,
    insert_fragment,
    insert_preview,
    insert_image,
    set_text,
    set_vector_selection,
    delete_vector_selection,
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
    // Same ordering rule as `load_svg`: end sessions against the
    // still-intact document, before history and the doc are reset.
    discard_open_property_previews();
    history.clear();
    doc.reset_to_original();
    selection = [];
    scope = null;
    mode = "select";
    tool = TOOL_CURSOR;
    active_duplication = null;
    baseline_revision = doc.revision;
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
    // Release every transient observation-channel subscriber too. `detach()`
    // already stops the surface from pushing to them, so they're inert by
    // here; clearing drops any closures a disposed-but-still-referenced editor
    // would otherwise retain. Clearing all of them (not just one) keeps the
    // disposal contract uniform across the subscribe channels.
    surface_hover_listeners.clear();
    geometry_listeners.clear();
    translate_commit_listeners.clear();
    pick_listeners.clear();
    vector_subselection_listeners.clear();
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
     * Subscribe to pick (tap) outcomes — a discrete click on the canvas,
     * reporting the document-space point and the node under it (`null` for
     * empty canvas), plus the button and modifier snapshot. Fires once per
     * tap, after the editor's own selection handling. Observe-only: a pick
     * cannot alter selection, and the channel does NOT bump `state.version`.
     * See {@link PickEvent}.
     *
     * @unstable
     */
    subscribe_pick(cb: (e: PickEvent) => void): Unsubscribe {
      pick_listeners.add(cb);
      return () => {
        pick_listeners.delete(cb);
      };
    },

    /**
     * The current vector sub-selection (vertices / segments / tangents) inside
     * an open vector content-edit session, or `null` when no such session is
     * active (gridaco/grida#790). The read counterpart to
     * `commands.set_vector_selection`. See {@link VectorSubSelection}.
     */
    vector_subselection(): VectorSubSelection | null {
      return current_vector_subselection;
    },

    /**
     * Subscribe to vector sub-selection changes — fires whenever the live
     * vertex / segment / tangent selection changes (click, marquee, lasso,
     * programmatic `set_vector_selection`, undo/redo) and on session
     * enter/exit (`null` on exit). The callback receives the new value, also
     * readable via {@link vector_subselection}. Cheap channel — does NOT bump
     * `state.version`.
     */
    subscribe_vector_subselection(
      cb: (sel: VectorSubSelection | null) => void
    ): Unsubscribe {
      vector_subselection_listeners.add(cb);
      return () => {
        vector_subselection_listeners.delete(cb);
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
    /**
     * Serialize a single element's subtree as an SVG **fragment**, using the
     * same trivia-preserving rules as {@link serialize} — for handing "the
     * markup of the element the user selected" to a downstream consumer
     * (e.g. an AI agent) without re-serializing the whole document.
     *
     * Fragment, not document (see `SvgDocument.serialize_node`): it does NOT
     * carry `serialize()`'s whole-document round-trip guarantee. Namespace
     * declarations on an ancestor (`xmlns:xlink`, normally on the root
     * `<svg>`) are NOT inlined — a node using `xlink:href` serializes without
     * `xmlns:xlink`. Throws on an unknown id or a non-element node.
     */
    serialize_node(id: NodeId): string {
      return doc.serialize_node(id);
    },
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
        undo_label: () => history.stack.undoLabel,
      },
      clipboard: {
        copy: () => copy_impl(false),
        cut: () => cut_impl(false),
      },
      insert_text_preview,
      emit,
      subscribe_translate_commit(cb: () => void): () => void {
        translate_commit_listeners.add(cb);
        return () => {
          translate_commit_listeners.delete(cb);
        };
      },
      notify_translate_commit,
      seed_duplication(record: subtree.DuplicationRecord) {
        active_duplication = record;
      },
      set_content_edit_driver(
        fn: ((target: NodeId, opts?: VectorSubSelectionInput) => boolean) | null
      ) {
        content_edit_driver = fn;
      },
      set_vector_subselect_driver(
        fn:
          | ((input: VectorSubSelectionInput, mode?: SelectMode) => boolean)
          | null
      ) {
        vector_subselect_driver = fn;
      },
      set_vector_delete_driver(fn: (() => boolean) | null) {
        vector_delete_driver = fn;
      },
      push_vector_subselection(sel: VectorSubSelection | null) {
        _set_current_vector_subselection(sel);
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
      push_pick(e: PickEvent) {
        notify_pick(e);
      },
      set_computed_resolver(fn: DomComputedResolver | null) {
        computed_resolver = fn;
      },
      set_geometry(p: GeometryProvider | null) {
        geometry_provider = p;
      },
      register_command(id, handler) {
        return registry.register(id, handler);
      },
      bump_geometry() {
        // A surface-observed reflow the IR can't see (web font settled
        // after the font-* write). Advance ONLY the geometry channel:
        // `doc.bump_geometry()` advances `geometry_version` without
        // emitting, so `doc.revision` / `structure_version` / dirty / undo
        // stay put (a reflow is not an edit); then fan out the geometry
        // listeners so the MemoizedGeometryProvider cache clears.
        doc.bump_geometry();
        fire_geometry_listeners_if_advanced();
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
  if (opts == null || typeof opts.svg !== "string") {
    const got =
      opts == null
        ? String(opts)
        : opts.svg === null
          ? "null"
          : typeof opts.svg;
    throw new TypeError(
      `createSvgEditor({ svg }) requires { svg: string }, got svg=${got}`
    );
  }
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
