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
import type { NodeId, PickEvent, Unsubscribe } from "../types";
import type { DomComputedResolver } from "./editor";
import type { GeometryProvider } from "./geometry";
import type { SvgDocument } from "./document";

export interface SurfaceBridge {
  /** Low-level IR. Mutating directly bypasses history; surfaces read
   *  freely, write only through the `history.preview(...)` brackets
   *  exposed below. */
  readonly doc: SvgDocument;

  /** History bracket factory. Surfaces open one per gesture and
   *  `set / commit / discard` it across frames. */
  readonly history: {
    preview(label: string): Preview;
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

  /** editor → surface: register the driver that mounts inline content
   *  editing (text-edit, vector-edit) on a target node. The editor calls
   *  `editor.enter_content_edit(id)` and routes here. Pass `null` to
   *  unregister on detach. */
  set_content_edit_driver(fn: ((target: NodeId) => boolean) | null): void;

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
}
