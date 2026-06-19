// In-package channel between the headless editor and an attached surface.
//
// This is the contract a second surface implementation (worker-side
// renderer, headless test harness, native host) would drive. It is
// deliberately not exported from the package — adding a method here is a
// considered seam change, not organic accretion. See README §Surface for
// what is and isn't on the public boundary.
//
// Direction convention in the JSDoc below:
//   - "editor → surface"  — the surface registers a callback the editor
//     invokes (driver / resolver / provider slots).
//   - "surface → editor"  — the surface calls into the editor to publish
//     a fact or open a history bracket.

import type { Preview } from "@grida/history";
import type { SelectMode } from "@grida/hud";
import type {
  NodeId,
  PickEvent,
  Unsubscribe,
  VectorSubSelection,
  VectorSubSelectionInput,
} from "../types";
import type { CommandHandler, CommandId } from "../commands/registry";
import type { DomComputedResolver } from "./editor";
import type { GeometryProvider } from "./geometry";
import type { SvgDocument } from "./document";
import type { subtree } from "./subtree";

export interface SurfaceBridge {
  /** Low-level IR. Mutating directly bypasses history; surfaces read
   *  freely, write only through the `history.preview(...)` brackets
   *  exposed below. */
  readonly doc: SvgDocument;

  /** History bracket factory. Surfaces open one per gesture and
   *  `set / commit / discard` it across frames. `undo_label` reads the
   *  label of the step `undo()` would revert — gesture attribution
   *  (e.g. asserting a cut recorded as "cut", not "remove"). */
  readonly history: {
    preview(label: string): Preview;
    undo_label(): string | null;
  };

  /** surface → editor: buffer-only clipboard operations for the native
   *  ClipboardEvent path. Same semantics as `commands.copy` / `commands.cut`
   *  EXCEPT no provider delivery — the surface writes the event's
   *  DataTransfer instead, honoring the one-external-channel rule
   *  (docs/wg/feat-svg-editor/clipboard.md §Transport: one gesture, one
   *  external write). Paste has no row here — the surface hands the
   *  event's text to the public `commands.paste(text)`. */
  readonly clipboard: {
    copy(): string | null;
    cut(): string | null;
  };

  /** Text-creation bracket for the click-to-place text tool. Creates an
   *  empty `<text>` with `initial` attrs under `opts.parent` (root by
   *  default), selects it, and opens one history preview. The surface
   *  mounts inline content-edit on the returned `id`, then calls
   *  `commit()` (one undo step, content captured for redo) or `discard()`
   *  (no node, no history entry — the empty-equals-delete rule for a
   *  freshly-placed node). See `core/editor.ts`. */
  insert_text_preview(
    initial: Readonly<Record<string, string>>,
    opts?: { parent?: NodeId }
  ): { id: NodeId; commit(): void; discard(): void };

  /** surface → editor: bump the version counter and notify subscribers.
   *  Used inside preview-session apply/revert closures so a per-frame
   *  geometry write reaches `subscribe()` listeners. */
  emit(): void;

  /** surface → editor: advance the geometry channel for a surface-observed
   *  reflow the IR cannot see — a `<text>` / `<tspan>` whose bbox shifted
   *  because a web font finished loading AFTER the `font-family` /
   *  `font-size` write. Advances `geometry_version` by exactly 1 and fires
   *  `subscribe_geometry` listeners (clearing the `MemoizedGeometryProvider`
   *  cache) WITHOUT marking the doc dirty, advancing `structure_version` /
   *  `revision`, or touching undo — a reflow is not an edit. The DOM
   *  surface drives this from a `document.fonts` `loadingdone` listener;
   *  see `src/dom.ts` and ../../docs/geometry.md §Limitations. */
  bump_geometry(): void;

  /** editor → surface: subscribe to translate-commit outcomes (drag
   *  commit, `commands.nudge`, `commands.translate`). Distinct from the
   *  raw geometry-listener firehose; the nudge-dwell watcher uses this. */
  subscribe_translate_commit(cb: () => void): Unsubscribe;

  /** surface → editor: publish a translate commit. Called by the
   *  translate orchestrator after a drag settles. */
  notify_translate_commit(): void;

  /** surface → editor: arm the repeating-duplicate record after a CLONED
   *  translate commit (gridaco/grida#825), so a follow-up `duplicate()`
   *  (⌘D) repeats the drag offset — the Figma alt-drag-then-⌘D
   *  convention. Commit-time only, never preview or cancel; spec:
   *  docs/wg/feat-svg-editor/subtree-clone.md §Repeating offset. */
  seed_duplication(record: subtree.DuplicationRecord): void;

  /** editor → surface: register the driver that mounts inline content
   *  editing (text-edit, vector-edit) on a target node. The editor calls
   *  `editor.enter_content_edit(id, opts?)` and routes here. `opts` carries an
   *  optional initial vector sub-selection (gridaco/grida#790) applied as part
   *  of the entry transition — ignored for text targets. Pass `null` to
   *  unregister on detach. */
  set_content_edit_driver(
    fn: ((target: NodeId, opts?: VectorSubSelectionInput) => boolean) | null
  ): void;

  /** editor → surface: register the driver that applies a vector
   *  sub-selection write while a vector content-edit session is open
   *  (`commands.set_vector_selection`, gridaco/grida#790). Returns `false`
   *  when no session is active, the input is out of range, or the surface
   *  refuses; `true` when the sub-selection changed. Pass `null` to unregister
   *  on detach. The session is surface-owned, so this is the only write path
   *  the headless command has into it — symmetric to the content-edit driver. */
  set_vector_subselect_driver(
    fn: ((input: VectorSubSelectionInput, mode?: SelectMode) => boolean) | null
  ): void;

  /** surface → editor: publish the current vector sub-selection. Goes to
   *  `editor.subscribe_vector_subselection()` listeners and updates
   *  `editor.vector_subselection()`; does NOT bump `state.version` (it changes
   *  at pointer rate during marquee / lasso — P4). `null` on session exit. */
  push_vector_subselection(sel: VectorSubSelection | null): void;

  /** editor → surface: register the driver that pushes a hover override
   *  (e.g. from a layers panel) into the HUD. Invoked immediately on
   *  registration with the current override so the surface can sync. */
  set_surface_hover_override_driver(
    fn: ((id: NodeId | null) => void) | null
  ): void;

  /** surface → editor: publish the pointer-driven hover pick. Goes to
   *  `editor.subscribe_surface_hover()` listeners; does NOT bump
   *  `state.version`. */
  push_surface_hover(id: NodeId | null): void;

  /** surface → editor: publish a discrete tap (press + release within the
   *  drag threshold). Goes to `editor.subscribe_pick()` listeners; does NOT
   *  bump `state.version`. The surface resolves the document-space point and
   *  the hit node; the editor only fans the event out. Observe-only — never
   *  mutates selection or any other editor state. */
  push_pick(e: PickEvent): void;

  /** editor → surface: register the cascade resolver. The DOM surface
   *  implements this with `getComputedStyle()`; headless surfaces may
   *  leave it null and the editor's per-node reads will skip the
   *  DOM-computed branch. */
  set_computed_resolver(fn: DomComputedResolver | null): void;

  /** editor → surface: register the world-space geometry provider.
   *  Required for any command that needs world bounds — `resize_to`,
   *  `rotate`, `align`. With no provider, those commands return false. */
  set_geometry(p: GeometryProvider | null): void;

  /** surface → editor: register (or replace) a command handler on the
   *  editor's command registry. The DOM surface installs surface-aware
   *  variants of built-in commands here — e.g. a `transform.nudge` that
   *  routes to vector sub-selection nudge during content-edit
   *  (gridaco/grida#849). The registry does NOT stack handlers, so a plain
   *  unregister leaves the slot empty; the surface re-registers the
   *  headless default on detach (see `default_nudge_handler`). Returns the
   *  registry's unregister fn. */
  register_command(id: CommandId, handler: CommandHandler): () => void;
}
