// Reset semantics — `editor.reset()` snaps back to the **last** `load()`
// input, not the original constructor input. This is what the README
// promises, and the right user expectation for a file editor.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src/index";

const A = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="50" height="40" fill="red"/></svg>`;
const B = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="50" cy="50" r="20" fill="blue"/></svg>`;

describe("editor.reset()", () => {
  it("reverts to original constructor input when never reloaded", () => {
    const editor = createSvgEditor({ svg: A });
    const rect = [...editor.tree().nodes.values()].find(
      (n) => n.tag === "rect"
    )!;
    editor.commands.select(rect.id);
    editor.commands.set_paint("fill", {
      kind: "color",
      value: { kind: "rgb", value: "green" },
    });
    expect(editor.serialize()).not.toBe(A);
    editor.reset();
    expect(editor.serialize()).toBe(A);
    expect(editor.state.can_undo).toBe(false);
  });

  it("reverts to the **last** load() input — not the constructor input", () => {
    const editor = createSvgEditor({ svg: A });
    editor.load(B);
    // mutate after load
    const circle = [...editor.tree().nodes.values()].find(
      (n) => n.tag === "circle"
    )!;
    editor.commands.select(circle.id);
    editor.commands.set_paint("fill", {
      kind: "color",
      value: { kind: "rgb", value: "purple" },
    });
    expect(editor.serialize()).not.toBe(B);
    editor.reset();
    // README contract: `reset()` returns "back to last load() input".
    expect(editor.serialize()).toBe(B);
    expect(editor.serialize()).not.toBe(A);
    expect(editor.state.can_undo).toBe(false);
  });
});
