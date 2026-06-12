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
import { first_rect } from "./_helpers";

const TRIVIAL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="50" height="40" fill="red" stroke="black"/></svg>`;

function setup() {
  const editor = createSvgEditor({ svg: TRIVIAL });
  const id = first_rect(editor);
  editor.commands.select(id);
  return { editor, id };
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

  it("supersession is keyed by NAME, not API family — set_property('fill') kills preview_paint('fill')", () => {
    const { editor, id } = setup();
    const session = editor.commands.preview_paint("fill");
    session.update(hex("#111111"));
    editor.commands.set_property("fill", "#3b82f6");
    session.commit();
    expect(session.live).toBe(false);
    expect(editor.node_paint(id, "fill").declared).toBe("#3b82f6");
  });

  it("…and symmetrically: set_paint('fill') kills preview_property('fill')", () => {
    const { editor, id } = setup();
    const session = editor.commands.preview_property("fill");
    session.update("#111111");
    editor.commands.set_paint("fill", hex("#3b82f6"));
    session.commit();
    expect(session.live).toBe(false);
    expect(editor.node_paint(id, "fill").declared).toBe("#3b82f6");
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

describe("sessions ended by history or by deletion are no-ops, never throws", () => {
  it("undo during an open session ends it — commit() replays nothing and never throws", () => {
    const { editor, id } = setup();
    editor.commands.set_paint("fill", hex("#3b82f6")); // step 1
    const session = editor.commands.preview_paint("fill");
    session.update(hex("#111111"));
    // History discards every in-flight preview before undoing step 1 —
    // a liveness flag local to the editor cannot see this discard.
    editor.commands.undo();
    expect(editor.node_paint(id, "fill").declared).toBe("red");
    expect(() => session.commit()).not.toThrow();
    expect(editor.node_paint(id, "fill").declared).toBe("red");
    expect(editor.state.can_redo).toBe(true); // commit pushed nothing
  });

  it("a discrete write after a history-killed session supersedes cleanly", () => {
    const { editor, id } = setup();
    editor.commands.set_paint("fill", hex("#3b82f6"));
    const session = editor.commands.preview_paint("fill");
    session.update(hex("#111111"));
    editor.commands.undo();
    expect(() =>
      editor.commands.set_paint("fill", hex("#00aa00"))
    ).not.toThrow();
    expect(editor.node_paint(id, "fill").declared).toBe("#00aa00");
    session.commit(); // long dead — still a no-op
    expect(editor.node_paint(id, "fill").declared).toBe("#00aa00");
  });

  it("deleting the selection ends open sessions on EVERY name — close-time commit() pushes no dead step", () => {
    const { editor, id } = setup();
    const fill = editor.commands.preview_paint("fill");
    fill.update(hex("#111111"));
    const opacity = editor.commands.preview_property("opacity");
    opacity.update("0.5");
    editor.commands.remove();
    fill.commit();
    opacity.commit();
    // Exactly ONE step (the remove): undo restores the rect with its
    // authored values, not the previewed ones, and nothing remains.
    editor.commands.undo();
    expect(editor.node_paint(id, "fill").declared).toBe("red");
    expect(
      editor.node_properties(id, ["opacity"]).opacity.provenance.carrier
    ).toBe("defaulted");
    expect(editor.state.can_undo).toBe(false);
  });
});

describe("session.live reflects the lifecycle", () => {
  it("true while open; false after commit, discard, supersession, and undo", () => {
    const { editor } = setup();
    const a = editor.commands.preview_paint("fill");
    expect(a.live).toBe(true);
    a.commit();
    expect(a.live).toBe(false);

    const b = editor.commands.preview_paint("fill");
    editor.commands.set_paint("fill", hex("#3b82f6")); // supersedes b
    expect(b.live).toBe(false);

    const c = editor.commands.preview_paint("fill");
    c.update(hex("#111111"));
    editor.commands.undo(); // history kills c
    expect(c.live).toBe(false);
  });
});

describe("a session writes only the selection captured at open", () => {
  const TWO = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="5" height="5" fill="red"/><circle r="3" fill="blue"/></svg>`;

  it("reselecting mid-gesture never paints the new selection, so revert is always complete", () => {
    const editor = createSvgEditor({ svg: TWO });
    const rect_id = first_rect(editor);
    const circle_id = [...editor.tree().nodes.values()].find(
      (n) => n.tag === "circle"
    )!.id;
    editor.commands.select(rect_id);
    const session = editor.commands.preview_property("opacity");
    session.update("0.3");
    editor.commands.select(circle_id); // selection changes mid-gesture
    session.update("0.6");
    // The previewed writes stayed on the open-time target.
    expect(editor.node_properties(rect_id, ["opacity"]).opacity.declared).toBe(
      "0.6"
    );
    expect(
      editor.node_properties(circle_id, ["opacity"]).opacity.provenance.carrier
    ).toBe("defaulted");
    session.commit();
    editor.commands.undo();
    expect(
      editor.node_properties(rect_id, ["opacity"]).opacity.provenance.carrier
    ).toBe("defaulted");
  });
});

describe("document swap and node-detaching commands end open sessions", () => {
  it("load() ends open sessions — close-time commit() pushes nothing into the fresh document's history", () => {
    const { editor } = setup();
    const session = editor.commands.preview_paint("fill");
    session.update(hex("#111111"));
    const NEXT = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="9" height="9" fill="green"/></svg>`;
    editor.load(NEXT);
    expect(session.live).toBe(false);
    session.commit();
    expect(editor.state.can_undo).toBe(false);
    expect(editor.node_paint(first_rect(editor), "fill").declared).toBe(
      "green"
    );
  });

  it("reset() ends open sessions the same way", () => {
    const { editor, id } = setup();
    editor.commands.set_paint("fill", hex("#3b82f6"));
    const session = editor.commands.preview_paint("fill");
    session.update(hex("#111111"));
    editor.reset();
    expect(session.live).toBe(false);
    session.commit();
    expect(editor.state.can_undo).toBe(false);
    expect(editor.node_paint(id, "fill").declared).toBe("red");
  });

  it("cut during an open session captures the committed document — clipboard payload and undo agree", () => {
    const { editor, id } = setup();
    const session = editor.commands.preview_paint("fill");
    session.update(hex("#111111"));
    const payload = editor.commands.cut();
    // The preview was discarded BEFORE the payload was captured.
    expect(payload).toContain('fill="red"');
    expect(payload).not.toContain("#111111");
    session.commit();
    editor.commands.undo(); // exactly one step: the cut
    expect(editor.node_paint(id, "fill").declared).toBe("red");
    expect(editor.state.can_undo).toBe(false);
  });

  it("ungroup ends open sessions — a previewed group transform is neither baked nor resurrected by undo", () => {
    const GROUPED = `<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(1 2)"><rect width="5" height="5"/></g></svg>`;
    const editor = createSvgEditor({ svg: GROUPED });
    const g_id = [...editor.tree().nodes.values()].find(
      (n) => n.tag === "g"
    )!.id;
    const rect_id = first_rect(editor);
    editor.commands.select(g_id);
    // `transform` is on ungroup's own-attribute allowlist, so a transform
    // preview is the one gesture that can reach the dissolve.
    const session = editor.commands.preview_property("transform");
    session.update("translate(5 5)");
    expect(editor.commands.ungroup()).toBe(true);
    expect(session.live).toBe(false);
    // The baked child transform composes the AUTHORED group transform,
    // not the previewed one.
    const baked = editor.node_properties(rect_id, ["transform"]).transform
      .declared!;
    expect(baked).toContain("translate(1 2)");
    expect(baked).not.toContain("translate(5 5)");
    session.commit(); // dead — pushes nothing
    editor.commands.undo(); // exactly one step: the ungroup
    expect(editor.node_properties(g_id, ["transform"]).transform.declared).toBe(
      "translate(1 2)"
    );
    expect(editor.state.can_undo).toBe(false);
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

describe("non-property previews survive a document swap without throwing", () => {
  it("load() ends an in-flight insert preview — later calls are no-ops and the incoming document is untouched", () => {
    const { editor } = setup();
    const ins = editor.commands.insert_preview("rect", { x: "1", y: "1" });
    const NEXT = `<svg xmlns="http://www.w3.org/2000/svg"><rect x="7" y="7" width="9" height="9" fill="green"/></svg>`;
    editor.load(NEXT);
    // history.clear() ran BEFORE the swap, so the insert preview's
    // revert removed the pending node from the OLD document — the
    // incoming document keeps its authored attributes.
    expect(() => {
      ins.update({ x: "5" });
      ins.commit();
    }).not.toThrow();
    const rect_id = first_rect(editor);
    expect(editor.node_properties(rect_id, ["x"]).x.declared).toBe("7");
    expect(editor.state.can_undo).toBe(false);
  });
});

describe("an empty-selection cut is a complete no-op", () => {
  it("returns null and does NOT end open preview sessions", () => {
    const { editor } = setup();
    const session = editor.commands.preview_paint("fill");
    session.update(hex("#111111"));
    editor.commands.deselect();
    expect(editor.commands.cut()).toBe(null);
    // The cut did nothing — the in-flight gesture is untouched.
    expect(session.live).toBe(true);
    session.discard();
  });
});

describe("history-driven notifications survive a document swap", () => {
  it("undo after load() still notifies subscribers — can_undo UI cannot go stale", () => {
    const { editor } = setup();
    const NEXT = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="9" height="9" fill="green"/></svg>`;
    editor.load(NEXT);
    const seen: boolean[] = [];
    editor.subscribe((s) => seen.push(s.can_undo));
    editor.commands.select(first_rect(editor));
    editor.commands.set_paint("fill", hex("#3b82f6"));
    expect(seen[seen.length - 1]).toBe(true); // post-push onChange emit fired
    const before_undo = seen.length;
    editor.commands.undo();
    expect(seen.length).toBeGreaterThan(before_undo); // undo emitted at all
    expect(seen[seen.length - 1]).toBe(false);
  });
});
