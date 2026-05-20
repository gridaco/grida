// Headless tests for the rotate intent helpers (capture_rotate_baseline,
// apply_rotate, is_rotatable, is_resizable_node). No editor, no DOM, no
// orchestrator — just the per-tag math against an in-memory SvgDocument.

import { describe, it, expect } from "vitest";
import { SvgDocument } from "../src/core/document";
import {
  apply_resize,
  apply_rotate,
  capture_resize_baseline,
  capture_rotate_baseline,
  is_resizable_node,
  is_rotatable,
} from "../src/core/intents";

const DEG = Math.PI / 180;

function with_rect(attrs: Record<string, string | number>): {
  doc: SvgDocument;
  id: string;
} {
  const a = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  const doc = new SvgDocument(
    `<svg xmlns="http://www.w3.org/2000/svg"><rect ${a}/></svg>`
  );
  const id = doc.element_children_of(doc.root)[0];
  return { doc, id };
}

describe("is_rotatable", () => {
  it("accepts a clean rect with no transform", () => {
    const { doc, id } = with_rect({ x: 0, y: 0, width: 10, height: 10 });
    expect(is_rotatable(doc, id)).toEqual({ kind: "yes" });
  });

  it("accepts a rect with a leading translate", () => {
    const { doc, id } = with_rect({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      transform: "translate(20 30)",
    });
    expect(is_rotatable(doc, id)).toEqual({ kind: "yes" });
  });

  it("accepts a rect with a single existing rotate", () => {
    const { doc, id } = with_rect({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      transform: "rotate(15 5 5)",
    });
    expect(is_rotatable(doc, id)).toEqual({ kind: "yes" });
  });

  it("accepts translate-then-rotate", () => {
    const { doc, id } = with_rect({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      transform: "translate(20 0) rotate(15)",
    });
    expect(is_rotatable(doc, id)).toEqual({ kind: "yes" });
  });

  it("refuses matrix transform", () => {
    const { doc, id } = with_rect({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      transform: "matrix(1 0 0 1 5 5)",
    });
    expect(is_rotatable(doc, id)).toEqual({
      kind: "refuse",
      reason: "non-trivial-transform",
    });
  });

  it("refuses scale transform", () => {
    const { doc, id } = with_rect({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      transform: "scale(2)",
    });
    expect(is_rotatable(doc, id)).toEqual({
      kind: "refuse",
      reason: "non-trivial-transform",
    });
  });

  it("refuses rotate-before-translate (order matters)", () => {
    const { doc, id } = with_rect({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      transform: "rotate(15) translate(10 0)",
    });
    expect(is_rotatable(doc, id)).toEqual({
      kind: "refuse",
      reason: "non-trivial-transform",
    });
  });

  it("refuses unparseable transform (returns null from parser)", () => {
    const { doc, id } = with_rect({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      transform: "foo(1)",
    });
    expect(is_rotatable(doc, id)).toEqual({
      kind: "refuse",
      reason: "non-trivial-transform",
    });
  });

  it("refuses <text> with a per-glyph rotate attribute", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg"><text rotate="30 60 90">hi</text></svg>`
    );
    const id = doc.element_children_of(doc.root)[0];
    expect(is_rotatable(doc, id)).toEqual({
      kind: "refuse",
      reason: "text-with-glyph-rotate",
    });
  });

  it('refuses an element with style="transform: ..." CSS-property', () => {
    const { doc, id } = with_rect({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      style: "fill: red; transform: rotate(30deg)",
    });
    expect(is_rotatable(doc, id)).toEqual({
      kind: "refuse",
      reason: "css-property-transform",
    });
  });

  it("refuses an element with a child <animateTransform>", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg">` +
        `<rect x="0" y="0" width="10" height="10">` +
        `<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="2s"/>` +
        `</rect></svg>`
    );
    const id = doc.element_children_of(doc.root)[0];
    expect(is_rotatable(doc, id)).toEqual({
      kind: "refuse",
      reason: "animated-transform",
    });
  });
});

describe("capture_rotate_baseline + apply_rotate", () => {
  it("writes a rotate token around the pivot for a clean rect", () => {
    const { doc, id } = with_rect({ x: 0, y: 0, width: 10, height: 10 });
    const baseline = capture_rotate_baseline(doc, id, { x: 5, y: 5 });
    expect(baseline).toEqual({
      transform: null,
      leading_translate: null,
      current_rotation_deg: 0,
      pivot: { x: 5, y: 5 },
    });
    apply_rotate(doc, id, baseline, 30 * DEG);
    expect(doc.get_attr(id, "transform")).toBe("rotate(30 5 5)");
  });

  it("preserves the leading translate around the pivot's pre-translate space", () => {
    const { doc, id } = with_rect({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      transform: "translate(20 30)",
    });
    const baseline = capture_rotate_baseline(doc, id, { x: 25, y: 35 });
    expect(baseline.leading_translate).toEqual({ x: 20, y: 30 });
    apply_rotate(doc, id, baseline, 90 * DEG);
    // cx,cy = pivot - leading_translate = (5, 5)
    expect(doc.get_attr(id, "transform")).toBe(
      "translate(20 30) rotate(90 5 5)"
    );
  });

  it("accumulates onto a pre-existing rotation (replaces pivot with new)", () => {
    const { doc, id } = with_rect({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      transform: "rotate(30 5 5)",
    });
    const baseline = capture_rotate_baseline(doc, id, { x: 5, y: 5 });
    expect(baseline.current_rotation_deg).toBe(30);
    apply_rotate(doc, id, baseline, 60 * DEG);
    // total = 30 + 60 = 90, pivot is the new bbox-center pivot (5, 5).
    expect(doc.get_attr(id, "transform")).toBe("rotate(90 5 5)");
  });

  it("identity-restores byte-equal when angle = 0 and no prior rotation", () => {
    const { doc, id } = with_rect({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      transform: "translate(20 30)",
    });
    const baseline = capture_rotate_baseline(doc, id, { x: 25, y: 35 });
    apply_rotate(doc, id, baseline, 0);
    // No new rotation, no pre-existing rotation → restore original verbatim.
    expect(doc.get_attr(id, "transform")).toBe("translate(20 30)");
  });

  it("identity-restores null transform byte-equal when source had none", () => {
    const { doc, id } = with_rect({ x: 0, y: 0, width: 10, height: 10 });
    const baseline = capture_rotate_baseline(doc, id, { x: 5, y: 5 });
    apply_rotate(doc, id, baseline, 0);
    expect(doc.get_attr(id, "transform")).toBeNull();
  });

  it("emits canonical 3-arg form even when pivot = origin (explicit_pivot survives re-parse)", () => {
    const { doc, id } = with_rect({ x: 0, y: 0, width: 10, height: 10 });
    const baseline = capture_rotate_baseline(doc, id, { x: 0, y: 0 });
    apply_rotate(doc, id, baseline, 45 * DEG);
    expect(doc.get_attr(id, "transform")).toBe("rotate(45 0 0)");
  });
});

describe("is_resizable_node — transform-aware capability check", () => {
  it("accepts a clean rect", () => {
    const { doc, id } = with_rect({ x: 0, y: 0, width: 10, height: 10 });
    expect(is_resizable_node(doc, id)).toBe(true);
  });

  it("accepts a rect with a leading translate (translate doesn't affect resize math)", () => {
    const { doc, id } = with_rect({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      transform: "translate(20 0)",
    });
    expect(is_resizable_node(doc, id)).toBe(true);
  });

  it("accepts a rotated rect when pivot is explicit (3-arg form)", () => {
    // The editor itself writes `rotate(θ cx cy)` (always 3-arg, canonical).
    // The resize gate accepts this because pivot recomposition can update
    // (cx, cy) on commit.
    const { doc, id } = with_rect({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      transform: "rotate(30 5 5)",
    });
    expect(is_resizable_node(doc, id)).toBe(true);
  });

  it("accepts translate-then-rotate when pivot is explicit", () => {
    const { doc, id } = with_rect({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      transform: "translate(20 30) rotate(30 5 5)",
    });
    expect(is_resizable_node(doc, id)).toBe(true);
  });

  it("refuses user-authored `rotate(θ)` (1-arg, no explicit pivot)", () => {
    // Re-emitting this would canonicalize to `rotate(30 0 0)`, churning
    // user-authored source. Refuse at the gate; resize is a silent no-op.
    const { doc, id } = with_rect({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      transform: "rotate(30)",
    });
    expect(is_resizable_node(doc, id)).toBe(false);
  });

  it("refuses translate-then-rotate when rotate has no explicit pivot", () => {
    const { doc, id } = with_rect({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      transform: "translate(20 30) rotate(30)",
    });
    expect(is_resizable_node(doc, id)).toBe(false);
  });

  it("refuses a rect with matrix transform", () => {
    const { doc, id } = with_rect({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      transform: "matrix(1 0 0 1 5 5)",
    });
    expect(is_resizable_node(doc, id)).toBe(false);
  });

  it("refuses a rect with scale", () => {
    const { doc, id } = with_rect({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      transform: "scale(2)",
    });
    expect(is_resizable_node(doc, id)).toBe(false);
  });

  it("refuses a <g> tag regardless of transform", () => {
    const doc = new SvgDocument(
      `<svg xmlns="http://www.w3.org/2000/svg"><g></g></svg>`
    );
    const id = doc.element_children_of(doc.root)[0];
    expect(is_resizable_node(doc, id)).toBe(false);
  });
});

describe("resize → rotate composition (no pivot drift)", () => {
  // Load-bearing invariant for the chunk: after a resize on a rotated rect,
  // the rotate-pipeline's next gesture composes correctly onto the
  // recomposed transform. Pre-fix, the pivot stayed at the OLD local
  // center, so a subsequent rotate gesture would swing the artwork off
  // the cursor.
  it("rect: resize then rotate composes the angle and pivots around current center", () => {
    const { doc, id } = with_rect({
      x: 60,
      y: 80,
      width: 60,
      height: 60,
      transform: "rotate(30 90 110)",
    });
    const resize_baseline = capture_resize_baseline(doc, id, {
      x: 60,
      y: 80,
      width: 60,
      height: 60,
    });
    apply_resize(doc, id, resize_baseline, 80 / 60, 1, { x: 60, y: 80 });
    // Pivot now matches the post-compensation local center; angle preserved.
    const transform_after_resize = doc.get_attr(id, "transform")!;
    expect(transform_after_resize.startsWith("rotate(30 ")).toBe(true);

    // The next rotate captures whichever pivot the orchestrator provides
    // (typically the gesture-time bbox center); composition adds the angle
    // to the captured `current_rotation_deg`.
    const x_now = parseFloat(doc.get_attr(id, "x")!);
    const y_now = parseFloat(doc.get_attr(id, "y")!);
    const w_now = parseFloat(doc.get_attr(id, "width")!);
    const h_now = parseFloat(doc.get_attr(id, "height")!);
    const center = { x: x_now + w_now / 2, y: y_now + h_now / 2 };
    const rotate_baseline = capture_rotate_baseline(doc, id, center);
    expect(rotate_baseline.current_rotation_deg).toBe(30);
    apply_rotate(doc, id, rotate_baseline, 15 * DEG);
    // After: angle = 30 + 15 = 45; pivot = the new bbox center.
    expect(doc.get_attr(id, "transform")).toBe(
      `rotate(45 ${center.x} ${center.y})`
    );
  });
});
