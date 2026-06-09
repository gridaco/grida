// Font-load settle → geometry bump.
//
// A documented v1 limitation (docs/geometry.md §Limitations "Text bbox
// depends on font"): when a `<text>` / `<tspan>` reflows because a web font
// finishes loading AFTER the `font-family` / `font-size` write was already
// serialized, the IR never sees the reflow, so nothing bumps
// `geometry_version` and every bounds-keyed consumer (snap, HUD chrome, size
// meter) stays stuck at the fallback-face metrics.
//
// The fix has two producer-side seams, both exercised here against the REAL
// production code (no consumer / inspector is named, no real font / network):
//   - `editor._internal.bump_geometry()` — advances the geometry channel for
//     a surface-observed reflow without touching doc/structure/undo.
//   - `install_font_load_geometry_bump(source, bump)` — the DOM surface's
//     `loadingdone` wiring, with an INJECTED `EventTarget` standing in for
//     `document.fonts` (jsdom's FontFaceSet is incomplete).
//
// The test env is node-only; the settle is simulated by dispatching a
// synthetic `loadingdone` Event into the injected source.

import { describe, expect, it } from "vitest";
import { createSvgEditorWithInternals } from "./_helpers";
import {
  MemoizedGeometryProvider,
  type GeometryProvider,
} from "../src/core/geometry";
import { install_font_load_geometry_bump } from "../src/dom";
import type { NodeId, Rect } from "../src/types";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text id="t" x="0" y="20" font-family="Inter" font-size="16">hi</text></svg>`;

/** Minimal `EventTarget` stub standing in for `document.fonts`. Node 24's
 *  global `EventTarget` is sufficient — we only need add/remove/dispatch of a
 *  bare `loadingdone` Event (no `ready` promise; that path is covered by the
 *  surface's own `?? document.fonts` default and is optional in the seam). */
function fakeFontFaceSet(): EventTarget {
  return new EventTarget();
}

/** Fire the DOM surface's settle signal into the injected source. */
function settle(source: EventTarget): void {
  source.dispatchEvent(new Event("loadingdone"));
}

/** The single `<text>` node id. */
function textId(
  editor: ReturnType<typeof createSvgEditorWithInternals>
): NodeId {
  for (const [id, n] of editor.tree().nodes) {
    if (n.tag === "text") return id;
  }
  throw new Error("no <text> in document");
}

describe("font-load geometry bump", () => {
  it("geometry bumps on font-load settle (dom driver)", () => {
    const editor = createSvgEditorWithInternals({ svg: SVG });
    const source = fakeFontFaceSet();
    const detach = install_font_load_geometry_bump(source, () =>
      editor._internal.bump_geometry()
    );

    let fired = 0;
    const unsub = editor.subscribe_geometry(() => {
      fired++;
    });
    const before = editor.state.geometry_version;

    settle(source);

    expect(fired).toBe(1);
    expect(editor.state.geometry_version).toBe(before + 1);

    unsub();
    detach();
  });

  it("bounds re-read after font-load settle clears memoizer", () => {
    const editor = createSvgEditorWithInternals({ svg: SVG });
    const id = textId(editor);

    // Driver stubs `getBBox`-style reads: W=10 before settle, W=20 after.
    // (A web font that loads wider glyphs than the fallback face.)
    let width = 10;
    let driver_reads = 0;
    const driver: GeometryProvider = {
      bounds_of(_id: NodeId): Rect | null {
        driver_reads++;
        return { x: 0, y: 0, width, height: 16 };
      },
      bounds_of_many(ids) {
        const out = new Map<NodeId, Rect>();
        for (const i of ids) {
          const r = this.bounds_of(i);
          if (r) out.set(i, r);
        }
        return out;
      },
      nodes_in_rect() {
        return [];
      },
      node_at_point() {
        return null;
      },
    };

    // Wire the memoizer to the editor's geometry channel exactly as the DOM
    // surface does (see src/dom.ts: subscribe_structure / subscribe_geometry).
    const memo = new MemoizedGeometryProvider(driver, {
      subscribe_structure: (cb) =>
        editor.subscribe_with_selector(
          (s) => s.structure_version,
          () => cb()
        ),
      subscribe_geometry: (cb) => editor.subscribe_geometry(cb),
    });
    editor._internal.set_geometry(memo);

    const source = fakeFontFaceSet();
    const detach = install_font_load_geometry_bump(source, () =>
      editor._internal.bump_geometry()
    );

    // First read: W=10, cached.
    expect(memo.bounds_of(id)?.width).toBe(10);
    expect(driver_reads).toBe(1);
    // Cache hit — driver not consulted again, value still 10 even though the
    // (not-yet-settled) driver would now return 10 anyway.
    expect(memo.bounds_of(id)?.width).toBe(10);
    expect(driver_reads).toBe(1);

    // Font settles wider; driver would now report 20.
    width = 20;
    // Without the bump the memoizer would still serve the stale 10.
    expect(memo.bounds_of(id)?.width).toBe(10);

    // Settle clears the memoizer via the geometry channel.
    settle(source);

    expect(memo.bounds_of(id)?.width).toBe(20);
    expect(driver_reads).toBe(2);

    editor._internal.set_geometry(null);
    memo.dispose();
    detach();
  });

  it("font-load settle does not bump doc/structure version", () => {
    const editor = createSvgEditorWithInternals({ svg: SVG });
    const source = fakeFontFaceSet();
    const detach = install_font_load_geometry_bump(source, () =>
      editor._internal.bump_geometry()
    );

    const before = editor.state;
    const geo_before = before.geometry_version;
    const struct_before = before.structure_version;
    const content_before = before.content_version;
    const dirty_before = before.dirty;
    const can_undo_before = before.can_undo;

    settle(source);

    const after = editor.state;
    // Geometry channel advanced…
    expect(after.geometry_version).toBe(geo_before + 1);
    // …but a reflow is NOT an edit: nothing else moved.
    expect(after.structure_version).toBe(struct_before);
    expect(after.content_version).toBe(content_before);
    expect(after.dirty).toBe(dirty_before);
    expect(after.dirty).toBe(false);
    expect(after.can_undo).toBe(can_undo_before);
    expect(after.can_undo).toBe(false);

    detach();
  });

  it("font-load listener detaches on surface detach", () => {
    const editor = createSvgEditorWithInternals({ svg: SVG });
    const source = fakeFontFaceSet();
    const detach = install_font_load_geometry_bump(source, () =>
      editor._internal.bump_geometry()
    );

    let fired = 0;
    const unsub = editor.subscribe_geometry(() => {
      fired++;
    });

    settle(source);
    expect(fired).toBe(1);

    // Teardown (the surface's detach path) removes the listener.
    detach();

    settle(source);
    // No further bump — the listener is gone (leak guard).
    expect(fired).toBe(1);

    unsub();
  });

  it("bump_geometry advances geometry channel", () => {
    // The internal seam, called directly (no DOM, no listener): one listener
    // fire, geometry_version +1, memoizer cleared.
    const editor = createSvgEditorWithInternals({ svg: SVG });
    const id = textId(editor);

    let width = 10;
    const driver: GeometryProvider = {
      bounds_of(): Rect | null {
        return { x: 0, y: 0, width, height: 16 };
      },
      bounds_of_many(ids) {
        const out = new Map<NodeId, Rect>();
        for (const i of ids) out.set(i, this.bounds_of()!);
        return out;
      },
      nodes_in_rect() {
        return [];
      },
      node_at_point() {
        return null;
      },
    };
    const memo = new MemoizedGeometryProvider(driver, {
      subscribe_structure: (cb) =>
        editor.subscribe_with_selector(
          (s) => s.structure_version,
          () => cb()
        ),
      subscribe_geometry: (cb) => editor.subscribe_geometry(cb),
    });
    editor._internal.set_geometry(memo);

    let fired = 0;
    const unsub = editor.subscribe_geometry(() => {
      fired++;
    });
    const before = editor.state.geometry_version;

    expect(memo.bounds_of(id)?.width).toBe(10);
    width = 20;

    editor._internal.bump_geometry();

    expect(fired).toBe(1);
    expect(editor.state.geometry_version).toBe(before + 1);
    // Cache cleared → next read sees the new driver value.
    expect(memo.bounds_of(id)?.width).toBe(20);

    unsub();
    editor._internal.set_geometry(null);
    memo.dispose();
  });
});
