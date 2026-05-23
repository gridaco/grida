// Pin the contract behind the world-space pipeline migration:
//
//   1. With pixel-grid on, gesture-driven resize/translate at any
//      camera zoom produces exact-integer document attributes.
//   2. With snap on (no pixel-grid), a sub-pixel cursor sweep through a
//      snap zone at any camera zoom produces written-attribute variance
//      < 1e-9.
//
// The pipeline runs purely in world space, so we exercise it directly:
// the boundary conversion the DOM adapter does is just `dx_cursor / zoom`,
// which we simulate here. No DOM, no `getScreenCTM`.
//
// See `plans/snap-would-jitter-also-fancy-pearl.md` for the architecture
// rationale and the user-facing failure modes this guards against.
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { SnapSession } from "../src/core/snap";
import {
  resize_pipeline,
  type ResizeContext,
  type ResizeOptions,
  type ResizePlan,
} from "../src/core/resize-pipeline";
import {
  translate_pipeline,
  type TranslateContext,
  type TranslateOptions,
  type TranslatePlan,
} from "../src/core/translate-pipeline";
import { createSvgEditor } from "../src/index";
import { first_rect } from "./_helpers";

const ZOOMS = [1.0, 1.27, 0.5, 2.0, 0.873];

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Build a fresh editor with a single integer-attribute rect for end-to-
 *  end attribute verification. */
function build_editor_with_rect() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">
    <rect id="a" x="0" y="0" width="100" height="50" />
  </svg>`;
  const editor = createSvgEditor({ svg });
  return { editor, id: first_rect(editor) };
}

/** Internal doc access for headless mutations. */
function doc_of(editor: ReturnType<typeof createSvgEditor>) {
  return (
    editor as unknown as {
      _internal: { doc: import("../src/core/document").SvgDocument };
    }
  )._internal.doc;
}

function read_rect_attrs(
  editor: ReturnType<typeof createSvgEditor>,
  id: string
) {
  const doc = doc_of(editor);
  return {
    x: parseFloat(doc.get_attr(id, "x") ?? "0"),
    y: parseFloat(doc.get_attr(id, "y") ?? "0"),
    width: parseFloat(doc.get_attr(id, "width") ?? "0"),
    height: parseFloat(doc.get_attr(id, "height") ?? "0"),
  };
}

// ─── Resize: pixel-grid on ────────────────────────────────────────────────

describe.each(ZOOMS)(
  "resize @ camera zoom %s — pixel-grid on produces integer attributes",
  (zoom) => {
    it("integer width across a fractional cursor sweep", () => {
      // For each CSS-pixel cursor delta, the DOM adapter divides by
      // camera.zoom to get a world delta. At irrational zooms the
      // world delta is irrational — the pixel-grid stage must still
      // produce an integer-corner attribute output.
      const { editor, id } = build_editor_with_rect();
      const doc = doc_of(editor);
      const baseline = resize_pipeline.intent.capture_baseline(doc, id, {
        x: 0,
        y: 0,
        width: 100,
        height: 50,
      });
      const opts: ResizeOptions = {
        pixel_grid_quantum: 1,
        snap_enabled: false,
        snap_threshold_px: 0,
      };
      const seen = new Set<number>();
      for (let cursor_px = 10; cursor_px <= 30; cursor_px += 0.137) {
        const dx_world = cursor_px / zoom;
        const plan0: ResizePlan = {
          id,
          baseline,
          direction: "e",
          dx: dx_world,
          dy: 0,
        };
        const ctx: ResizeContext = {
          input: { id, direction: "e", dx: dx_world, dy: 0 },
          modifiers: { aspect_lock: "off", force_disable_snap: false },
          options: opts,
          snap_session: null,
        };
        const { plan } = resize_pipeline.run(
          plan0,
          resize_pipeline.stages.DEFAULT,
          ctx
        );
        resize_pipeline.apply(doc, plan);
        const attrs = read_rect_attrs(editor, id);
        seen.add(attrs.width);
        // Pixel-grid contract: written width is an exact integer at
        // any zoom, regardless of the irrational cursor → world ratio.
        expect(Math.abs(attrs.width - Math.round(attrs.width))).toBeLessThan(
          1e-9
        );
      }
      // Sanity: the sweep actually exercised a range (didn't collapse
      // to one value).
      expect(seen.size).toBeGreaterThan(5);
    });
  }
);

// ─── Resize: snap on, no pixel-grid — sub-pixel sweep stability ──────────

describe.each(ZOOMS)(
  "resize @ camera zoom %s — sub-pixel sweep through snap zone is stable",
  (zoom) => {
    it("written width variance < 1e-9 across a 0.001-px cursor sweep", () => {
      const { editor, id } = build_editor_with_rect();
      const doc = doc_of(editor);
      const baseline = resize_pipeline.intent.capture_baseline(doc, id, {
        x: 0,
        y: 0,
        width: 100,
        height: 50,
      });
      // Anchor (neighbor) at world x = 120 — a stationary snap target.
      const neighbor = { x: 120, y: 0, width: 20, height: 20 };
      const opts: ResizeOptions = {
        pixel_grid_quantum: null,
        snap_enabled: true,
        snap_threshold_px: 10 / zoom, // adapter-side conversion
      };
      const samples: number[] = [];
      // Sweep dx_world inside the snap zone in 0.001-world-unit steps.
      // Snap target: right edge at world x = 120, baseline right = 100,
      // so dx_world = 20 puts the edge exactly on the snap line.
      // Threshold (in world units) is 10/zoom; the smallest zone is at
      // the largest zoom (2.0 → threshold_world = 5, zone = dx in
      // [15, 25]). Sweep [17, 23] stays well inside at every zoom.
      for (let dx_world = 17; dx_world <= 23; dx_world += 0.001) {
        const snap = new SnapSession({
          agents: [{ x: 0, y: 0, width: 100, height: 50 }],
          neighbors: [neighbor],
        });
        const plan0: ResizePlan = {
          id,
          baseline,
          direction: "e",
          dx: dx_world,
          dy: 0,
        };
        const ctx: ResizeContext = {
          input: { id, direction: "e", dx: dx_world, dy: 0 },
          modifiers: { aspect_lock: "off", force_disable_snap: false },
          options: opts,
          snap_session: snap,
        };
        const { plan } = resize_pipeline.run(
          plan0,
          resize_pipeline.stages.DEFAULT,
          ctx
        );
        resize_pipeline.apply(doc, plan);
        samples.push(read_rect_attrs(editor, id).width);
        snap.dispose();
      }
      const max = Math.max(...samples);
      const min = Math.min(...samples);
      expect(max - min).toBeLessThan(1e-9);
      // And the converged value should be exactly 120 (snap target).
      expect(samples[samples.length - 1]).toBeCloseTo(120, 9);
    });
  }
);

// ─── Translate: pixel-grid on ────────────────────────────────────────────

describe.each(ZOOMS)(
  "translate @ camera zoom %s — pixel-grid on produces integer attributes",
  (zoom) => {
    it("integer x across a fractional cursor sweep", () => {
      const { editor, id } = build_editor_with_rect();
      const doc = doc_of(editor);
      const baselines = translate_pipeline.intent.capture_baselines(doc, [id]);
      const opts: TranslateOptions = {
        pixel_grid_quantum: 1,
        snap_enabled: false,
        snap_threshold_px: 0,
      };
      const seen = new Set<number>();
      for (let cursor_px = 10; cursor_px <= 30; cursor_px += 0.137) {
        const dx_world = cursor_px / zoom;
        const plan0: TranslatePlan = {
          ids: [id],
          baselines,
          delta: { x: 0, y: 0 },
        };
        const ctx: TranslateContext = {
          input: { ids: [id], movement: [dx_world, 0] },
          modifiers: { axis_lock: "off", force_disable_snap: false },
          options: opts,
          snap_session: null,
          snap_policy: "engine",
        };
        const { plan } = translate_pipeline.run(
          plan0,
          translate_pipeline.stages.DEFAULT,
          ctx
        );
        translate_pipeline.apply(doc, plan);
        const attrs = read_rect_attrs(editor, id);
        seen.add(attrs.x);
        expect(Math.abs(attrs.x - Math.round(attrs.x))).toBeLessThan(1e-9);
      }
      expect(seen.size).toBeGreaterThan(5);
    });
  }
);
