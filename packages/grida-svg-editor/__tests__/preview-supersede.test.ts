// Supersession contract between preview sessions and discrete writes.
//
// A preview session (`preview_property` / `preview_paint`) is a continuous
// gesture; a discrete write (`set_paint` / `set_property`) on the SAME
// property is the user's final intent and supersedes the in-flight
// gesture. Without this, the canonical popover shape — drag the picker,
// click a preset, close the popover (commit) — replays the stale dragged
// value over the preset and splits undo across the gesture.
//
// The defended invariant: one user gesture = one history step, and the
// last write the user made is the one that sticks.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src/index";

const TRIVIAL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="50" height="40" fill="red" stroke="black"/></svg>`;

function setup() {
  const editor = createSvgEditor({ svg: TRIVIAL });
  const rect = [...editor.tree().nodes.values()].find((n) => n.tag === "rect")!;
  editor.commands.select(rect.id);
  return { editor, id: rect.id };
}

const hex = (v: string) =>
  ({ kind: "color", value: { kind: "rgb", value: v } }) as const;

describe("discrete write supersedes an open preview session on the same property", () => {
  it("set_paint during an open preview_paint drag wins — commit() on the stale session replays nothing", () => {
    const { editor, id } = setup();
    const session = editor.commands.preview_paint("fill");
    session.update(hex("#111111"));
    session.update(hex("#222222"));
    // Preset click — discrete write, same channel, no manual discard.
    editor.commands.set_paint("fill", hex("#3b82f6"));
    // Popover close — the session's commit must not replay #222222.
    session.commit();
    expect(editor.node_paint(id, "fill").declared).toBe("#3b82f6");
  });

  it("drag → preset → close is exactly ONE history step, and undo restores the pre-gesture value", () => {
    const { editor, id } = setup();
    const session = editor.commands.preview_paint("fill");
    session.update(hex("#111111"));
    editor.commands.set_paint("fill", hex("#3b82f6"));
    session.commit();
    expect(editor.state.can_undo).toBe(true);
    editor.commands.undo();
    // One undo lands on the original — not on the dragged intermediate.
    expect(editor.node_paint(id, "fill").declared).toBe("red");
    expect(editor.state.can_undo).toBe(false);
    editor.commands.redo();
    expect(editor.node_paint(id, "fill").declared).toBe("#3b82f6");
  });

  it("a defensive manual discard() before the discrete write stays valid as a no-op", () => {
    const { editor, id } = setup();
    const session = editor.commands.preview_paint("fill");
    session.update(hex("#111111"));
    session.discard();
    editor.commands.set_paint("fill", hex("#3b82f6"));
    // Already-ended session: every further call is a no-op, never a throw.
    expect(() => {
      session.discard();
      session.commit();
      session.update(hex("#999999"));
    }).not.toThrow();
    expect(editor.node_paint(id, "fill").declared).toBe("#3b82f6");
  });

  it("update() after supersession is a no-op — a late drag frame cannot dirty the document", () => {
    const { editor, id } = setup();
    const session = editor.commands.preview_paint("fill");
    session.update(hex("#111111"));
    editor.commands.set_paint("fill", hex("#3b82f6"));
    session.update(hex("#222222")); // straggler pointer-move after the preset click
    session.commit();
    expect(editor.node_paint(id, "fill").declared).toBe("#3b82f6");
  });

  it("set_property supersedes preview_property on the same name (generic property path)", () => {
    const { editor, id } = setup();
    // Baseline: no authored opacity — the editor surfaces the initial
    // value ("1", carrier "defaulted"). Undo must restore exactly this.
    const baseline = editor.node_properties(id, ["opacity"]).opacity;
    expect(baseline.provenance.carrier).toBe("defaulted");
    const session = editor.commands.preview_property("opacity");
    session.update("0.2");
    editor.commands.set_property("opacity", "0.8");
    session.commit();
    expect(editor.node_properties(id, ["opacity"]).opacity.declared).toBe(
      "0.8"
    );
    editor.commands.undo();
    const after = editor.node_properties(id, ["opacity"]).opacity;
    expect(after.declared).toBe(baseline.declared);
    expect(after.provenance.carrier).toBe("defaulted");
  });

  it("set_paint_from_gradient supersedes an open preview on the same channel", () => {
    const { editor, id } = setup();
    const session = editor.commands.preview_paint("fill");
    session.update(hex("#111111"));
    const { gradient_id } = editor.commands.set_paint_from_gradient("fill", {
      kind: "linear",
      stops: [
        { offset: 0, color: "#ff6b35" },
        { offset: 1, color: "#7fb8e0" },
      ],
    });
    session.commit();
    expect(editor.node_paint(id, "fill").declared).toBe(`url(#${gradient_id})`);
  });
});

describe("discrete writes do NOT touch preview sessions on other properties", () => {
  it("a stroke write leaves an open fill preview alive through commit", () => {
    const { editor, id } = setup();
    const session = editor.commands.preview_paint("fill");
    session.update(hex("#111111"));
    editor.commands.set_paint("stroke", hex("#00ff00"));
    session.update(hex("#222222"));
    session.commit();
    expect(editor.node_paint(id, "fill").declared).toBe("#222222");
    expect(editor.node_paint(id, "stroke").declared).toBe("#00ff00");
    // Two independent gestures → two history steps.
    editor.commands.undo();
    expect(editor.node_paint(id, "fill").declared).toBe("red");
    expect(editor.node_paint(id, "stroke").declared).toBe("#00ff00");
    editor.commands.undo();
    expect(editor.node_paint(id, "stroke").declared).toBe("black");
  });
});

describe("opening a second session on the same property supersedes the first", () => {
  it("the first session's commit replays nothing; the second reverts to the true pre-gesture state on discard", () => {
    const { editor, id } = setup();
    const first = editor.commands.preview_paint("fill");
    first.update(hex("#111111"));
    const second = editor.commands.preview_paint("fill");
    // The first session died when the second opened.
    first.commit();
    expect(editor.node_paint(id, "fill").declared).toBe("red");
    second.update(hex("#222222"));
    second.discard();
    // Reverts to the document state, not to the first session's #111111.
    expect(editor.node_paint(id, "fill").declared).toBe("red");
    expect(editor.state.can_undo).toBe(false);
  });
});
