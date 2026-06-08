import type { Modifiers, PointerButton, Vector2 } from "./event";
import type { NodeId } from "./gesture";

/**
 * Observe-only outcome: a discrete **tap** resolved on the surface.
 *
 * A tap is a press + release that stayed within the drag threshold — the
 * surface owns the press/release stream, the camera, and the click-vs-drag
 * discrimination, so it is the only layer that can report this fact
 * authoritatively. A pointer movement that crosses the drag threshold
 * becomes a gesture and produces NO tap.
 *
 * This is NOT an {@link import("./intent").Intent}. An `Intent` is an
 * actionable change the host commits (and the surface itself never mutates
 * the document); a tap is a pure observation — there is nothing to commit.
 * It is delivered through its own `onTap` callback, a sibling of `pick` /
 * `shapeOf` / `onIntent`, precisely so it can fire WITHOUT changing
 * selection (most importantly for the secondary button, which must never
 * mutate selection). Keeping it off the intent stream also keeps the
 * "selection store lives in the host" boundary clean: a tap that selects
 * nothing is still a first-class outcome.
 *
 * @unstable Shape is provisional until ≥2 consumers exercise it (the
 * package's promotion bar — "two consumers shape the contract"). Fields may
 * change without a semver bump until then.
 */
export interface TapOutcome {
  /**
   * Document-space point the tap resolved against — the **pointer-down**
   * point, never the pointer-up point. For the deferred path (a tap on an
   * already-selected node, which commits selection on pointer-up) the down
   * and up points differ by up to the drag threshold; the surface reports
   * the down point because that is the point the tap was resolved against
   * and the only one it still holds at release time.
   */
  point: Vector2;
  /**
   * Which button produced the tap. `"primary"` or `"secondary"` only —
   * `"middle"` is reserved for pan and never produces a tap.
   */
  button: Exclude<PointerButton, "middle">;
  /**
   * Topmost host pick at `point` at press time, or `null` for empty canvas.
   * Carried (not host-re-derived) so the host observes the SAME node the
   * surface resolved the tap against — consistent with `select` carrying
   * resolved ids. Resolved via the host's own `pick` callback, so it
   * introduces no scene-graph awareness the surface didn't already have.
   */
  hit: NodeId | null;
  /** Modifier snapshot at press time — already in hand on the surface event. */
  mods: Modifiers;
}

/**
 * Callback the host wires to observe taps. Optional in `SurfaceOptions` /
 * `StateDeps` — hosts that don't run a tap-driven tool simply omit it and
 * pay nothing.
 */
export type TapHandler = (tap: TapOutcome) => void;
