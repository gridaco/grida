// Phase A + B coverage: SelectionGroup[] grouping in the HUD-sync path,
// multi-member resize through the orchestrator/pipeline, and the
// `commands.resize_to` RPC. Tests stay headless — geometry is faked via
// a stub `GeometryProvider`; the DOM surface is not exercised.

import { describe, expect, it } from "vitest";
import cmath from "@grida/cmath";
import { createSvgEditor } from "../src/index";
import { SvgDocument } from "../src/core/document";
import type { NodeId, Rect } from "../src/types";
import { resize_pipeline, type ResizePlan } from "../src/core/resize-pipeline";
import { first_rect, install_geometry } from "./_helpers";

// ─── Phase A: SelectionGroup builder (parity sanity) ─────────────────────────
//
// The actual `build_selection_groups` lives in `dom.ts` and isn't
// exported — these tests mirror the algorithm against a `SvgDocument`
// + a synthetic `bounds_of` so the dom-side wiring (a one-line union)
// has its shape pinned.
//
// Policy: one outer envelope across the whole selection, regardless of
// parent. Per-member outlines render separately as decoration extras.

function build_envelope(
  doc: SvgDocument,
  selection: ReadonlyArray<NodeId>,
  bounds_of: (id: NodeId) => Rect | null
): { ids: NodeId[]; rect: Rect | null; line?: boolean } | null {
  if (selection.length === 0) return null;
  if (selection.length === 1) {
    const tag = doc.tag_of(selection[0]);
    if (tag === "line") return { ids: [...selection], rect: null, line: true };
    return { ids: [...selection], rect: bounds_of(selection[0]) };
  }
  const rects: Rect[] = [];
  for (const id of selection) {
    const r = bounds_of(id);
    if (r) rects.push(r);
  }
  if (rects.length === 0) return null;
  return { ids: [...selection], rect: cmath.rect.union(rects) };
}

describe("HUD selection groups — one envelope across the whole selection", () => {
  it("two-rect selection under one <g> collapses to one rect group", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g><rect x="0" y="0" width="20" height="10"/><rect x="50" y="30" width="40" height="20"/></g></svg>`;
    const doc = new SvgDocument(svg);
    const ids = doc.all_elements().filter((id) => doc.tag_of(id) === "rect");
    const env = build_envelope(doc, ids, (id) => {
      const x = parseFloat(doc.get_attr(id, "x") ?? "0");
      const y = parseFloat(doc.get_attr(id, "y") ?? "0");
      const w = parseFloat(doc.get_attr(id, "width") ?? "0");
      const h = parseFloat(doc.get_attr(id, "height") ?? "0");
      return { x, y, width: w, height: h };
    });
    expect(env).not.toBeNull();
    expect(env!.ids).toEqual(ids);
    expect(env!.rect).toEqual({ x: 0, y: 0, width: 90, height: 50 });
  });

  it("mixed-parent selection still produces ONE envelope", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g><rect x="0" y="0" width="10" height="10"/></g><g><rect x="100" y="100" width="20" height="20"/></g></svg>`;
    const doc = new SvgDocument(svg);
    const ids = doc.all_elements().filter((id) => doc.tag_of(id) === "rect");
    const bounds = (id: NodeId) => ({
      x: parseFloat(doc.get_attr(id, "x") ?? "0"),
      y: parseFloat(doc.get_attr(id, "y") ?? "0"),
      width: parseFloat(doc.get_attr(id, "width") ?? "0"),
      height: parseFloat(doc.get_attr(id, "height") ?? "0"),
    });
    const env = build_envelope(doc, ids, bounds);
    expect(env).not.toBeNull();
    expect(env!.ids).toEqual(ids);
    // Union of (0,0,10,10) and (100,100,20,20) = (0,0,120,120).
    expect(env!.rect).toEqual({ x: 0, y: 0, width: 120, height: 120 });
  });

  it("single <line> selection stays line-typed (endpoint knobs)", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><line x1="0" y1="0" x2="50" y2="50"/></svg>`;
    const doc = new SvgDocument(svg);
    const ids = doc.all_elements().filter((id) => doc.tag_of(id) === "line");
    const env = build_envelope(doc, ids, () => null);
    expect(env).not.toBeNull();
    expect(env!.line).toBe(true);
  });

  it("preserves selection order within the envelope's ids", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g><rect x="0" y="0" width="10" height="10"/></g><g><rect x="100" y="100" width="20" height="20"/></g><g><rect x="50" y="50" width="5" height="5"/></g></svg>`;
    const doc = new SvgDocument(svg);
    const rects = doc.all_elements().filter((id) => doc.tag_of(id) === "rect");
    const bounds = (id: NodeId) => ({
      x: parseFloat(doc.get_attr(id, "x") ?? "0"),
      y: parseFloat(doc.get_attr(id, "y") ?? "0"),
      width: parseFloat(doc.get_attr(id, "width") ?? "0"),
      height: parseFloat(doc.get_attr(id, "height") ?? "0"),
    });
    // Select in order: second, then third, then first.
    const selection = [rects[1], rects[2], rects[0]];
    const env = build_envelope(doc, selection, bounds);
    expect(env?.ids).toEqual([rects[1], rects[2], rects[0]]);
  });
});

// ─── Phase B: Multi-member resize plan apply/revert ─────────────────────────

describe("applyResizePlan / revertResizePlan — multi-member", () => {
  it("scales two rects around the union NW; per-member arms execute", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="0" y="0" width="10" height="10"/><rect x="20" y="0" width="10" height="10"/></svg>`;
    const doc = new SvgDocument(svg);
    const [a, b] = doc.all_elements().filter((id) => doc.tag_of(id) === "rect");
    const ba = resize_pipeline.intent.capture_baseline(doc, a, {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    const bb = resize_pipeline.intent.capture_baseline(doc, b, {
      x: 20,
      y: 0,
      width: 10,
      height: 10,
    });
    const union = cmath.rect.union([ba.bbox, bb.bbox]);
    expect(union).toEqual({ x: 0, y: 0, width: 30, height: 10 });
    const plan: ResizePlan = {
      id: a,
      baseline: resize_pipeline.synthesize_group_baseline(union),
      members: [
        { id: a, baseline: ba },
        { id: b, baseline: bb },
      ],
      direction: "se",
      dx: 30, // double the width
      dy: 10, // double the height
    };
    resize_pipeline.apply(doc, plan);
    // After doubling around union NW (0,0):
    //   a: (0,0,10,10) → (0,0,20,20)
    //   b: (20,0,10,10) → (40,0,20,20)
    expect(doc.get_attr(a, "x")).toBe("0");
    expect(doc.get_attr(a, "y")).toBe("0");
    expect(doc.get_attr(a, "width")).toBe("20");
    expect(doc.get_attr(a, "height")).toBe("20");
    expect(doc.get_attr(b, "x")).toBe("40");
    expect(doc.get_attr(b, "y")).toBe("0");
    expect(doc.get_attr(b, "width")).toBe("20");
    expect(doc.get_attr(b, "height")).toBe("20");

    resize_pipeline.revert(doc, plan);
    expect(doc.get_attr(a, "x")).toBe("0");
    expect(doc.get_attr(a, "width")).toBe("10");
    expect(doc.get_attr(b, "x")).toBe("20");
    expect(doc.get_attr(b, "width")).toBe("10");
  });

  it("circle stays uniform under multi-resize (per-tag arm fires)", () => {
    // A rect + a circle in one group. The pipeline math runs against the
    // synthesized free union baseline; per-member apply forces the
    // circle to uniform `s = min(sx, sy)`.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="0" y="0" width="10" height="20"/><circle cx="30" cy="10" r="5"/></svg>`;
    const doc = new SvgDocument(svg);
    const elements = doc.all_elements();
    const r = elements.find((id) => doc.tag_of(id) === "rect")!;
    const c = elements.find((id) => doc.tag_of(id) === "circle")!;
    const br = resize_pipeline.intent.capture_baseline(doc, r, {
      x: 0,
      y: 0,
      width: 10,
      height: 20,
    });
    const bc = resize_pipeline.intent.capture_baseline(doc, c, {
      x: 25,
      y: 5,
      width: 10,
      height: 10,
    });
    const union = cmath.rect.union([br.bbox, bc.bbox]);
    expect(union).toEqual({ x: 0, y: 0, width: 35, height: 20 });
    // Drag se by (35, 20) → sx=2, sy=2. Both equal so uniform doesn't
    // bite. Rect doubles; circle radius doubles around (origin = NW).
    const plan: ResizePlan = {
      id: r,
      baseline: resize_pipeline.synthesize_group_baseline(union),
      members: [
        { id: r, baseline: br },
        { id: c, baseline: bc },
      ],
      direction: "se",
      dx: 35,
      dy: 20,
    };
    resize_pipeline.apply(doc, plan);
    expect(doc.get_attr(r, "width")).toBe("20");
    expect(doc.get_attr(r, "height")).toBe("40");
    expect(doc.get_attr(c, "r")).toBe("10");
  });

  it("non-uniform multi-resize: circle still picks min(sx,sy)", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="0" y="0" width="10" height="10"/><circle cx="20" cy="5" r="5"/></svg>`;
    const doc = new SvgDocument(svg);
    const elements = doc.all_elements();
    const r = elements.find((id) => doc.tag_of(id) === "rect")!;
    const c = elements.find((id) => doc.tag_of(id) === "circle")!;
    const br = resize_pipeline.intent.capture_baseline(doc, r, {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    const bc = resize_pipeline.intent.capture_baseline(doc, c, {
      x: 15,
      y: 0,
      width: 10,
      height: 10,
    });
    const union = cmath.rect.union([br.bbox, bc.bbox]); // (0,0,25,10)
    const plan: ResizePlan = {
      id: r,
      baseline: resize_pipeline.synthesize_group_baseline(union),
      members: [
        { id: r, baseline: br },
        { id: c, baseline: bc },
      ],
      direction: "se",
      dx: 25, // sx = 2
      dy: 10, // sy = 2
    };
    // Equal sx/sy here for simplicity — covers the apply path; the
    // important property is the circle's per-tag arm still calls
    // `min(sx, sy)`. Verify radius scales linearly.
    resize_pipeline.apply(doc, plan);
    expect(doc.get_attr(c, "r")).toBe("10");
  });
});

// ─── commands.resize_to ──────────────────────────────────────────────────────

describe("commands.resize_to — single member", () => {
  it("maps a rect's bbox to an arbitrary target rect", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="10" y="10" width="50" height="20"/></svg>`,
    });
    install_geometry(editor);
    const ids = editor.document.all_elements();
    const r = ids.find((id) => editor.document.tag_of(id) === "rect")!;
    editor.commands.select(r);
    const ok = editor.commands.resize_to({
      x: 100,
      y: 200,
      width: 300,
      height: 80,
    });
    expect(ok).toBe(true);
    expect(editor.document.get_attr(r, "x")).toBe("100");
    expect(editor.document.get_attr(r, "y")).toBe("200");
    expect(editor.document.get_attr(r, "width")).toBe("300");
    expect(editor.document.get_attr(r, "height")).toBe("80");
  });

  it("no-op when geometry provider is absent (headless)", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="10"/></svg>`,
    });
    // Do NOT install geometry.
    const r = editor.document
      .all_elements()
      .find((id) => editor.document.tag_of(id) === "rect")!;
    editor.commands.select(r);
    const ok = editor.commands.resize_to({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    expect(ok).toBe(false);
    expect(editor.document.get_attr(r, "width")).toBe("10");
  });

  it("undo restores all geometry attrs as one history step", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="5" y="5" width="10" height="20"/></svg>`,
    });
    install_geometry(editor);
    const r = editor.document
      .all_elements()
      .find((id) => editor.document.tag_of(id) === "rect")!;
    editor.commands.select(r);
    editor.commands.resize_to({ x: 50, y: 60, width: 100, height: 40 });
    expect(editor.document.get_attr(r, "x")).toBe("50");
    expect(editor.state.can_undo).toBe(true);
    editor.commands.undo();
    expect(editor.document.get_attr(r, "x")).toBe("5");
    expect(editor.document.get_attr(r, "y")).toBe("5");
    expect(editor.document.get_attr(r, "width")).toBe("10");
    expect(editor.document.get_attr(r, "height")).toBe("20");
  });
});

describe("commands.resize_to — multi member", () => {
  it("maps a two-rect selection's union bbox to an arbitrary target", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="0" y="0" width="10" height="10"/><rect x="20" y="0" width="10" height="10"/></svg>`,
    });
    install_geometry(editor);
    const [a, b] = editor.document
      .all_elements()
      .filter((id) => editor.document.tag_of(id) === "rect");
    editor.commands.select([a, b]);
    // Union pre-op: (0,0,30,10). Target: (100, 200, 60, 20) — sx=2, sy=2.
    editor.commands.resize_to({ x: 100, y: 200, width: 60, height: 20 });
    // a: (0,0,10,10) → scale 2 around (0,0) = (0,0,20,20) → translate +100/+200 = (100,200,20,20)
    expect(editor.document.get_attr(a, "x")).toBe("100");
    expect(editor.document.get_attr(a, "y")).toBe("200");
    expect(editor.document.get_attr(a, "width")).toBe("20");
    expect(editor.document.get_attr(a, "height")).toBe("20");
    // b: (20,0,10,10) → scale 2 around (0,0) = (40,0,20,20) → translate = (140,200,20,20)
    expect(editor.document.get_attr(b, "x")).toBe("140");
    expect(editor.document.get_attr(b, "y")).toBe("200");
    expect(editor.document.get_attr(b, "width")).toBe("20");
    expect(editor.document.get_attr(b, "height")).toBe("20");
  });

  it("undo restores both members as one history step", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="0" y="0" width="10" height="10"/><rect x="20" y="0" width="10" height="10"/></svg>`,
    });
    install_geometry(editor);
    const [a, b] = editor.document
      .all_elements()
      .filter((id) => editor.document.tag_of(id) === "rect");
    editor.commands.select([a, b]);
    editor.commands.resize_to({ x: 100, y: 100, width: 60, height: 20 });
    editor.commands.undo();
    expect(editor.document.get_attr(a, "x")).toBe("0");
    expect(editor.document.get_attr(a, "width")).toBe("10");
    expect(editor.document.get_attr(b, "x")).toBe("20");
    expect(editor.document.get_attr(b, "width")).toBe("10");
  });

  it("pure translate (sx=sy=1) shifts the union NW without resize", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="0" y="0" width="10" height="10"/><rect x="20" y="0" width="10" height="10"/></svg>`,
    });
    install_geometry(editor);
    const [a, b] = editor.document
      .all_elements()
      .filter((id) => editor.document.tag_of(id) === "rect");
    editor.commands.select([a, b]);
    // Union pre-op: (0,0,30,10). Target: (50,60,30,10) — same size,
    // shifted by (+50, +60). Should land each member translated by the
    // same offset.
    editor.commands.resize_to({ x: 50, y: 60, width: 30, height: 10 });
    expect(editor.document.get_attr(a, "x")).toBe("50");
    expect(editor.document.get_attr(a, "y")).toBe("60");
    expect(editor.document.get_attr(a, "width")).toBe("10");
    expect(editor.document.get_attr(b, "x")).toBe("70");
    expect(editor.document.get_attr(b, "y")).toBe("60");
    expect(editor.document.get_attr(b, "width")).toBe("10");
  });
});

// ─── commands.resize_to — transform-safety gate (is_resizable_node) ──────────
//
// resize_to scales LOCAL attrs around a WORLD-space origin, which is only
// correct when world ≡ local. A member with a non-trivial transform (rotate
// without explicit pivot, matrix, scale, skew) must be skipped — gating on the
// tag-only `is_resizable` used to let such members through and resize them incorrectly.
// The gate is now `is_resizable_node`, matching the HUD resize path.

describe("commands.resize_to — transform-safety gate", () => {
  it("skips a member with an unsafe transform (rotate without explicit pivot) and resizes the rest", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="0" y="0" width="10" height="10"/><rect x="20" y="0" width="10" height="10" transform="rotate(30)"/></svg>`,
    });
    install_geometry(editor);
    const [plain, rotated] = editor.document
      .all_elements()
      .filter((id) => editor.document.tag_of(id) === "rect");
    editor.commands.select([plain, rotated]);
    // Only `plain` is a member → union = (0,0,10,10). Target doubles width.
    const ok = editor.commands.resize_to({ x: 0, y: 0, width: 20, height: 10 });
    expect(ok).toBe(true);
    // plain resized:
    expect(editor.document.get_attr(plain, "width")).toBe("20");
    // rotated untouched (skipped):
    expect(editor.document.get_attr(rotated, "x")).toBe("20");
    expect(editor.document.get_attr(rotated, "width")).toBe("10");
    expect(editor.document.get_attr(rotated, "transform")).toBe("rotate(30)");
  });

  it("is a no-op (false) when the only member has an unsafe transform", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="0" y="0" width="10" height="10" transform="rotate(30)"/></svg>`,
    });
    install_geometry(editor);
    const r = first_rect(editor);
    editor.commands.select(r);
    const ok = editor.commands.resize_to({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    expect(ok).toBe(false);
    expect(editor.document.get_attr(r, "width")).toBe("10");
    expect(editor.document.get_attr(r, "transform")).toBe("rotate(30)");
  });

  it("still resizes a member with a leading translate", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="0" y="0" width="10" height="10" transform="translate(5 5)"/></svg>`,
    });
    install_geometry(editor);
    const r = first_rect(editor);
    editor.commands.select(r);
    const ok = editor.commands.resize_to({ x: 0, y: 0, width: 20, height: 10 });
    expect(ok).toBe(true);
    expect(editor.document.get_attr(r, "width")).toBe("20");
    // leading translate preserved (apply_resize never touches transform):
    expect(editor.document.get_attr(r, "transform")).toBe("translate(5 5)");
  });
});

// ─── commands.resize_by — keyboard nudge-resize core verb ────────────────────
//
// Grows/shrinks the selection's union bbox by a {dw, dh} delta, NW corner
// fixed. Sugar over resize_to with an ALL-OR-NOTHING is_resizable_node gate
// (matches the HUD: a mixed/unsafe selection is refused, not partially
// resized — the distinction from resize_to's per-member skip).

describe("commands.resize_by", () => {
  const mkRect = () =>
    createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="10" y="10" width="50" height="20"/></svg>`,
    });

  it("grows width with the NW corner fixed (+dw)", () => {
    const editor = mkRect();
    install_geometry(editor);
    const r = first_rect(editor);
    editor.commands.select(r);
    expect(editor.commands.resize_by({ dw: 30, dh: 0 })).toBe(true);
    expect(editor.document.get_attr(r, "x")).toBe("10");
    expect(editor.document.get_attr(r, "y")).toBe("10");
    expect(editor.document.get_attr(r, "width")).toBe("80");
    expect(editor.document.get_attr(r, "height")).toBe("20");
  });

  it("shrinks width with the NW corner fixed (-dw)", () => {
    const editor = mkRect();
    install_geometry(editor);
    const r = first_rect(editor);
    editor.commands.select(r);
    expect(editor.commands.resize_by({ dw: -20, dh: 0 })).toBe(true);
    expect(editor.document.get_attr(r, "x")).toBe("10");
    expect(editor.document.get_attr(r, "width")).toBe("30");
  });

  it("grows height with the NW corner fixed (+dh)", () => {
    const editor = mkRect();
    install_geometry(editor);
    const r = first_rect(editor);
    editor.commands.select(r);
    expect(editor.commands.resize_by({ dw: 0, dh: 10 })).toBe(true);
    expect(editor.document.get_attr(r, "y")).toBe("10");
    expect(editor.document.get_attr(r, "height")).toBe("30");
    expect(editor.document.get_attr(r, "width")).toBe("50");
  });

  it("shrinks height with the NW corner fixed (-dh)", () => {
    const editor = mkRect();
    install_geometry(editor);
    const r = first_rect(editor);
    editor.commands.select(r);
    expect(editor.commands.resize_by({ dw: 0, dh: -5 })).toBe(true);
    expect(editor.document.get_attr(r, "height")).toBe("15");
  });

  it("grows each member in place (multi) — members do not move relative to one another", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="0" y="0" width="10" height="10"/><rect x="20" y="0" width="10" height="10"/></svg>`,
    });
    install_geometry(editor);
    const [a, b] = editor.document
      .all_elements()
      .filter((id) => editor.document.tag_of(id) === "rect");
    editor.commands.select([a, b]);
    // PER-ELEMENT: each rect grows by +30 around its OWN NW. Neither member is
    // translated — b keeps its x=20 (contrast: resize_to would push it to 40).
    expect(editor.commands.resize_by({ dw: 30, dh: 0 })).toBe(true);
    expect(editor.document.get_attr(a, "x")).toBe("0");
    expect(editor.document.get_attr(a, "width")).toBe("40");
    expect(editor.document.get_attr(b, "x")).toBe("20"); // NOT translated
    expect(editor.document.get_attr(b, "width")).toBe("40");
  });

  it("refuses the whole gesture (false, no mutation) when selection includes a <g>", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="0" y="0" width="10" height="10"/><g><rect x="50" y="50" width="10" height="10"/></g></svg>`,
    });
    install_geometry(editor);
    const r = editor.document
      .all_elements()
      .find((id) => editor.document.tag_of(id) === "rect")!;
    const g = editor.document
      .all_elements()
      .find((id) => editor.document.tag_of(id) === "g")!;
    editor.commands.select([r, g]);
    expect(editor.commands.resize_by({ dw: 30, dh: 0 })).toBe(false);
    // resizable member is NOT partially resized — all-or-nothing.
    expect(editor.document.get_attr(r, "width")).toBe("10");
  });

  it("refuses the whole gesture when a member has an unsafe transform (all-or-nothing, unlike resize_to)", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="0" y="0" width="10" height="10"/><rect x="20" y="0" width="10" height="10" transform="rotate(30)"/></svg>`,
    });
    install_geometry(editor);
    const [plain, rotated] = editor.document
      .all_elements()
      .filter((id) => editor.document.tag_of(id) === "rect");
    editor.commands.select([plain, rotated]);
    expect(editor.commands.resize_by({ dw: 30, dh: 0 })).toBe(false);
    expect(editor.document.get_attr(plain, "width")).toBe("10");
    expect(editor.document.get_attr(rotated, "width")).toBe("10");
  });

  it("is a no-op (false) when no geometry provider is attached (headless)", () => {
    const editor = mkRect();
    // Do NOT install geometry.
    const r = first_rect(editor);
    editor.commands.select(r);
    expect(editor.commands.resize_by({ dw: 30, dh: 0 })).toBe(false);
    expect(editor.document.get_attr(r, "width")).toBe("50");
  });

  it("shrinking past zero stays non-negative (floors at the resize minimum)", () => {
    const editor = mkRect();
    install_geometry(editor);
    const r = first_rect(editor);
    editor.commands.select(r);
    // resize_by clamps the target width to 0; the per-tag resize handler then
    // floors the written width at its 0.001 minimum so the shape never
    // collapses or flips negative. The contract is "never negative / NaN".
    expect(editor.commands.resize_by({ dw: -1000, dh: 0 })).toBe(true);
    const w = parseFloat(editor.document.get_attr(r, "width")!);
    expect(Number.isFinite(w)).toBe(true);
    expect(w).toBeGreaterThanOrEqual(0);
    expect(w).toBeLessThan(1);
  });

  it("is a no-op (false, no history step) on a geometrically identity gesture", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="0" y="0" width="10" height="0"/></svg>`,
    });
    install_geometry(editor);
    const r = first_rect(editor);
    editor.commands.select(r);
    // height is 0 → the height nudge can't scale a zero-extent axis (factor 1)
    // and width is untouched → identity gesture → no history step pushed.
    expect(editor.commands.resize_by({ dw: 0, dh: 5 })).toBe(false);
    expect(editor.state.can_undo).toBe(false);
  });

  it("pushes one undo step", () => {
    const editor = mkRect();
    install_geometry(editor);
    const r = first_rect(editor);
    editor.commands.select(r);
    editor.commands.resize_by({ dw: 30, dh: 0 });
    expect(editor.document.get_attr(r, "width")).toBe("80");
    expect(editor.state.can_undo).toBe(true);
    editor.commands.undo();
    expect(editor.document.get_attr(r, "width")).toBe("50");
    expect(editor.document.get_attr(r, "x")).toBe("10");
  });
});

// ─── resize semantics — GROUP (resize_to) vs PER-ELEMENT (resize_by) ─────────
//
// The two verbs share one path (collect_resize_members + commit_resize) but
// parameterize it to OPPOSITE multi-member semantics. These two tests pin the
// divergence on identical input so the contract is explicit:
//
//   fixture: two 10×10 rects, a@(0,0) and b@(20,0); union = (0,0,30,10).
//   widen so the union/each grows +30 in width.
//
//   • resize_to (group / HUD handle-drag): scale the whole selection around the
//     union NW → the off-origin member b TRANSLATES (x 20 → 40) and scales.
//   • resize_by (per-element / keyboard nudge): grow each member around its OWN
//     NW → b stays at x=20, just grows. Nobody moves relative to anyone.

describe("resize semantics — group (resize_to) vs per-element (resize_by)", () => {
  const TWO_RECTS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="0" y="0" width="10" height="10"/><rect x="20" y="0" width="10" height="10"/></svg>`;
  const select_two = (editor: ReturnType<typeof createSvgEditor>) => {
    install_geometry(editor);
    const [a, b] = editor.document
      .all_elements()
      .filter((id) => editor.document.tag_of(id) === "rect");
    editor.commands.select([a, b]);
    return { a, b };
  };

  it("resize_to (GROUP) scales the union — the off-origin member translates", () => {
    const editor = createSvgEditor({ svg: TWO_RECTS });
    const { a, b } = select_two(editor);
    // union (0,0,30,10) → target (0,0,60,10): sx=2 around union NW (0,0).
    expect(
      editor.commands.resize_to({ x: 0, y: 0, width: 60, height: 10 })
    ).toBe(true);
    expect(editor.document.get_attr(a, "x")).toBe("0");
    expect(editor.document.get_attr(a, "width")).toBe("20");
    expect(editor.document.get_attr(b, "x")).toBe("40"); // TRANSLATED (20 → 40)
    expect(editor.document.get_attr(b, "width")).toBe("20");
  });

  it("resize_by (PER-ELEMENT) grows each member in place — nobody translates", () => {
    const editor = createSvgEditor({ svg: TWO_RECTS });
    const { a, b } = select_two(editor);
    expect(editor.commands.resize_by({ dw: 30, dh: 0 })).toBe(true);
    expect(editor.document.get_attr(a, "x")).toBe("0");
    expect(editor.document.get_attr(a, "width")).toBe("40");
    expect(editor.document.get_attr(b, "x")).toBe("20"); // NOT translated
    expect(editor.document.get_attr(b, "width")).toBe("40");
  });
});

// ─── commands.resize_to via the keymap registry ─────────────────────────────

// ─── commands.translate — ancestor/descendant accumulation bug ─────────────
//
// Repro for the "Bar chart marquee-translate" bug. When the selection
// contains both a `<g>` ancestor AND any of its descendants,
// `applyTranslatePlan` runs `apply_translate` for every id:
//   - The `<g>` hits the `viaTransform` arm → `transform="translate(dx,dy)"`,
//     which shifts the group and ALL its descendants visually.
//   - The descendant hits its own geometry-attr arm → shifts the
//     descendant's `x/y/cx/cy/…` by `(dx, dy)`.
// The descendant is therefore moved twice: once via parent's transform,
// once via its own attrs. With N levels of selected ancestors the
// descendant gets shifted (N+1)x. A marquee select-all on a
// `<g>`-heavy fixture (Bar chart) hits this on every bar / legend item.
//
// Expected behavior: descendants whose ancestor is also selected should
// be filtered out of the translate plan, so the parent transform is
// the only source of motion for them. Mirrors the policy
// `commands.remove` already applies.

describe("commands.translate — ancestor + descendant filter", () => {
  it("does not double-translate a descendant when its <g> ancestor is also selected", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g><rect x="0" y="0" width="10" height="10"/></g></svg>`,
    });
    const elements = editor.document.all_elements();
    const g = elements.find((id) => editor.document.tag_of(id) === "g")!;
    const r = elements.find((id) => editor.document.tag_of(id) === "rect")!;
    editor.commands.select([g, r]);
    editor.commands.translate({ dx: 10, dy: 0 });

    // The group should carry the translate (it owns the gesture).
    expect(editor.document.get_attr(g, "transform")).toBe("translate(10 0)");
    // The rect should NOT have its own x bumped — it's already moved
    // by the parent transform. Bumping its x too would double the
    // displacement on screen.
    expect(editor.document.get_attr(r, "x")).toBe("0");
  });

  it("Bar-chart-shape repro: all groups + descendants → only groups move", () => {
    // Two sibling groups, each with a child rect. Marquee-select-all
    // would pick all 4 ids. Each child should NOT have its own x
    // bumped; only the parent <g>s should carry the transform.
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><g><rect x="0" y="0" width="10" height="10"/></g><g><rect x="100" y="0" width="10" height="10"/></g></svg>`,
    });
    const elements = editor.document.all_elements();
    const gs = elements.filter((id) => editor.document.tag_of(id) === "g");
    const rs = elements.filter((id) => editor.document.tag_of(id) === "rect");
    expect(gs).toHaveLength(2);
    expect(rs).toHaveLength(2);
    editor.commands.select([...gs, ...rs]);
    editor.commands.translate({ dx: 5, dy: 3 });
    for (const g of gs) {
      expect(editor.document.get_attr(g, "transform")).toBe("translate(5 3)");
    }
    expect(editor.document.get_attr(rs[0], "x")).toBe("0");
    expect(editor.document.get_attr(rs[0], "y")).toBe("0");
    expect(editor.document.get_attr(rs[1], "x")).toBe("100");
    expect(editor.document.get_attr(rs[1], "y")).toBe("0");
  });

  it("nested groups: only the topmost selected ancestor translates", () => {
    // <g> > <g> > <rect>. All three selected — only the outer <g>
    // should carry the transform. The inner <g> is a descendant of
    // the outer, and the rect is a descendant of both.
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g><g><rect x="0" y="0" width="10" height="10"/></g></g></svg>`,
    });
    const elements = editor.document.all_elements();
    const gs = elements.filter((id) => editor.document.tag_of(id) === "g");
    expect(gs).toHaveLength(2);
    const outer = gs[0];
    const inner = gs[1];
    const r = elements.find((id) => editor.document.tag_of(id) === "rect")!;
    editor.commands.select([outer, inner, r]);
    editor.commands.translate({ dx: 7, dy: -2 });
    expect(editor.document.get_attr(outer, "transform")).toBe(
      "translate(7 -2)"
    );
    // Inner group: untouched (its parent moves it). Rect: untouched.
    expect(editor.document.get_attr(inner, "transform")).toBeNull();
    expect(editor.document.get_attr(r, "x")).toBe("0");
  });

  it("disjoint selection (no ancestor/descendant pairs) still translates every member", () => {
    // Two unrelated siblings — both should move under the gesture
    // (no parent <g> on the path is in the selection).
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect x="0" y="0" width="10" height="10"/><rect x="50" y="0" width="10" height="10"/></svg>`,
    });
    const rs = editor.document
      .all_elements()
      .filter((id) => editor.document.tag_of(id) === "rect");
    editor.commands.select(rs);
    editor.commands.translate({ dx: 5, dy: 0 });
    expect(editor.document.get_attr(rs[0], "x")).toBe("5");
    expect(editor.document.get_attr(rs[1], "x")).toBe("55");
  });

  it("undo restores the descendant baseline (revert path must skip the descendant too)", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g><rect x="0" y="0" width="10" height="10"/></g></svg>`,
    });
    const g = editor.document
      .all_elements()
      .find((id) => editor.document.tag_of(id) === "g")!;
    const r = editor.document
      .all_elements()
      .find((id) => editor.document.tag_of(id) === "rect")!;
    editor.commands.select([g, r]);
    editor.commands.translate({ dx: 10, dy: 0 });
    editor.commands.undo();
    expect(editor.document.get_attr(g, "transform")).toBeNull();
    expect(editor.document.get_attr(r, "x")).toBe("0");
  });
});

// ─── commands.remove — multi-selection ───────────────────────────────────────

describe("commands.remove — multi-selection", () => {
  it("removes every selected node and undo restores them in original order", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect id="a" x="0" y="0" width="10" height="10"/><rect id="b" x="20" y="0" width="10" height="10"/><rect id="c" x="40" y="0" width="10" height="10"/></svg>`,
    });
    const ids = editor.document
      .all_elements()
      .filter((id) => editor.document.tag_of(id) === "rect");
    expect(ids).toHaveLength(3);
    editor.commands.select([ids[0], ids[2]]);
    editor.commands.remove();
    // Only the middle rect should remain.
    const after = editor.document
      .all_elements()
      .filter((id) => editor.document.tag_of(id) === "rect");
    expect(after).toEqual([ids[1]]);
    expect(editor.state.selection).toEqual([]);

    editor.commands.undo();
    const restored = editor.document
      .all_elements()
      .filter((id) => editor.document.tag_of(id) === "rect");
    // Original document order preserved.
    expect(restored).toEqual(ids);
    expect(editor.state.selection).toEqual([ids[0], ids[2]]);
  });

  it("filters out descendants when an ancestor is also selected", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g><rect x="0" y="0" width="10" height="10"/><rect x="20" y="0" width="10" height="10"/></g></svg>`,
    });
    const elements = editor.document.all_elements();
    const g = elements.find((id) => editor.document.tag_of(id) === "g")!;
    const rects = elements.filter(
      (id) => editor.document.tag_of(id) === "rect"
    );
    // Select both the group and one of its descendants — descendant
    // should be filtered out so removing the group doesn't try to
    // re-attach an already-detached child on undo.
    editor.commands.select([g, rects[0]]);
    editor.commands.remove();
    const surviving = editor.document
      .all_elements()
      .filter((id) => ["g", "rect"].includes(editor.document.tag_of(id)));
    expect(surviving).toEqual([]);

    editor.commands.undo();
    const after_undo = editor.document
      .all_elements()
      .filter((id) => ["g", "rect"].includes(editor.document.tag_of(id)));
    // Group and both rects back in original order.
    expect(after_undo).toEqual([g, rects[0], rects[1]]);
  });

  it("revert order handles adjacent selected siblings", () => {
    // Two adjacent rects selected — revert must re-insert in reverse
    // document order so each captured next-sibling anchor exists when
    // its predecessor reattaches.
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="0" y="0" width="10" height="10"/><rect x="20" y="0" width="10" height="10"/><rect x="40" y="0" width="10" height="10"/></svg>`,
    });
    const ids = editor.document
      .all_elements()
      .filter((id) => editor.document.tag_of(id) === "rect");
    editor.commands.select([ids[0], ids[1]]);
    editor.commands.remove();
    let surviving = editor.document
      .all_elements()
      .filter((id) => editor.document.tag_of(id) === "rect");
    expect(surviving).toEqual([ids[2]]);
    editor.commands.undo();
    surviving = editor.document
      .all_elements()
      .filter((id) => editor.document.tag_of(id) === "rect");
    expect(surviving).toEqual(ids);
  });

  it("one undo step per multi-remove", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="0" y="0" width="10" height="10"/><rect x="20" y="0" width="10" height="10"/></svg>`,
    });
    const ids = editor.document
      .all_elements()
      .filter((id) => editor.document.tag_of(id) === "rect");
    editor.commands.select(ids);
    editor.commands.remove();
    expect(editor.state.can_undo).toBe(true);
    editor.commands.undo();
    // After one undo, both rects are back and there's nothing further to undo.
    const restored = editor.document
      .all_elements()
      .filter((id) => editor.document.tag_of(id) === "rect");
    expect(restored).toEqual(ids);
    expect(editor.state.can_undo).toBe(false);
  });
});

describe("selection.resize_to registry binding", () => {
  it("dispatches via invoke", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="0" y="0" width="10" height="10"/></svg>`,
    });
    install_geometry(editor);
    const r = editor.document
      .all_elements()
      .find((id) => editor.document.tag_of(id) === "rect")!;
    editor.commands.select(r);
    const consumed = editor.commands.invoke("selection.resize_to", {
      x: 1,
      y: 2,
      width: 100,
      height: 200,
    });
    expect(consumed).toBe(true);
    expect(editor.document.get_attr(r, "width")).toBe("100");
    expect(editor.document.get_attr(r, "height")).toBe("200");
  });

  it("no-op when selection is empty", () => {
    const editor = createSvgEditor({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="0" y="0" width="10" height="10"/></svg>`,
    });
    install_geometry(editor);
    const consumed = editor.commands.invoke("selection.resize_to", {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
    expect(consumed).toBe(false);
  });
});
