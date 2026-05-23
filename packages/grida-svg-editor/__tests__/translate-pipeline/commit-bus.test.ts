// Translate-commit bus. The bus is the wire NudgeDwellWatcher listens
// on instead of `subscribe_geometry`. It must fire on nudge and RPC
// `commands.translate` (the post-commit-affordance UX), and NOT fire
// on non-translate mutations (set_text, undo of a non-translate
// change, property writes). Drag commits are intentionally OFF the
// bus — drag has live in-gesture snap guides that clear on release,
// so the dwell would only add an unwanted 500 ms hold after every
// drag. See `nudge-dwell-watcher.ts` header.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../../src/index";
import { first_rect } from "../_helpers";

type WithInternal = ReturnType<typeof createSvgEditor> & {
  _internal: { subscribe_translate_commit: (cb: () => void) => () => void };
};

const SVG_BASE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="10" y="10" width="20" height="20"/><text x="50" y="50">hi</text></svg>`;

function attach(editor: ReturnType<typeof createSvgEditor>) {
  let count = 0;
  const off = (editor as WithInternal)._internal.subscribe_translate_commit(
    () => {
      count++;
    }
  );
  return {
    get count() {
      return count;
    },
    off,
  };
}

describe("translate-commit bus", () => {
  it("fires on commands.nudge", () => {
    const editor = createSvgEditor({ svg: SVG_BASE });
    const id = first_rect(editor);
    editor.commands.select([id], { mode: "set" });
    const bus = attach(editor);
    editor.commands.nudge({ dx: 1, dy: 0 });
    expect(bus.count).toBe(1);
    bus.off();
  });

  it("fires on commands.translate (RPC)", () => {
    const editor = createSvgEditor({ svg: SVG_BASE });
    const id = first_rect(editor);
    editor.commands.select([id], { mode: "set" });
    const bus = attach(editor);
    editor.commands.translate({ dx: 0.4, dy: 0 });
    expect(bus.count).toBe(1);
    bus.off();
  });

  it("does NOT fire on no-op nudge (empty selection)", () => {
    const editor = createSvgEditor({ svg: SVG_BASE });
    const bus = attach(editor);
    editor.commands.nudge({ dx: 1, dy: 0 });
    expect(bus.count).toBe(0);
    bus.off();
  });

  it("does NOT fire on no-op nudge (zero delta)", () => {
    const editor = createSvgEditor({ svg: SVG_BASE });
    const id = first_rect(editor);
    editor.commands.select([id], { mode: "set" });
    const bus = attach(editor);
    editor.commands.nudge({ dx: 0, dy: 0 });
    expect(bus.count).toBe(0);
    bus.off();
  });

  it("does NOT fire on commands.set_text (content edit, not a translate)", () => {
    const editor = createSvgEditor({ svg: SVG_BASE });
    // pick the <text> via tree
    let text_id = "";
    for (const [id, n] of editor.tree().nodes) {
      if (n.tag === "text") {
        text_id = id;
        break;
      }
    }
    expect(text_id).not.toBe("");
    editor.commands.select([text_id], { mode: "set" });
    const bus = attach(editor);
    editor.commands.set_text("changed");
    expect(bus.count).toBe(0);
    bus.off();
  });

  it("does NOT fire on undo of a non-translate change", () => {
    const editor = createSvgEditor({ svg: SVG_BASE });
    const id = first_rect(editor);
    editor.commands.select([id], { mode: "set" });
    editor.commands.set_paint("fill", {
      kind: "color",
      value: { kind: "rgb", value: "rgb(255, 0, 0)" },
    });
    const bus = attach(editor);
    editor.commands.undo();
    expect(bus.count).toBe(0);
    bus.off();
  });

  it("unsubscribe stops further notifications", () => {
    const editor = createSvgEditor({ svg: SVG_BASE });
    const id = first_rect(editor);
    editor.commands.select([id], { mode: "set" });
    const bus = attach(editor);
    editor.commands.nudge({ dx: 1, dy: 0 });
    bus.off();
    editor.commands.nudge({ dx: 1, dy: 0 });
    expect(bus.count).toBe(1);
  });
});

// Pin the design choice: a drag commit driven through the
// `TranslateOrchestrator` must NOT publish to the commit bus. Drag
// shows live in-gesture guides and clears them on release; routing
// drag commits through the dwell watcher would add a 500 ms hold
// after every release. The orchestrator-level mechanism for this is
// simply "the orchestrator has no `on_commit` hook" — the test
// asserts it from the editor-bus side.
import { TranslateOrchestrator } from "../../src/core/translate-pipeline/orchestrator";

describe("TranslateOrchestrator drag-commit does not wake the bus", () => {
  it("a phase=commit drive does NOT increment the editor's translate-commit bus", () => {
    const editor = createSvgEditor({ svg: SVG_BASE });
    const id = first_rect(editor);
    editor.commands.select([id], { mode: "set" });
    const bus = attach(editor);
    const internal = (
      editor as unknown as {
        _internal: {
          doc: unknown;
          history: { preview: (l: string) => unknown };
          emit: () => void;
        };
      }
    )._internal;
    const orch = new TranslateOrchestrator({
      get_doc: () => internal.doc as never,
      emit: () => internal.emit(),
      open_preview: (label) => internal.history.preview(label) as never,
      open_snap: () => null,
      options: () => ({
        pixel_grid_quantum: null,
        snap_enabled: false,
        snap_threshold_px: 6,
      }),
    });
    orch.drive(
      { ids: [id], movement: [5, 0] },
      { axis_lock: "off", force_disable_snap: false },
      { phase: "commit", policy: "aligned", snap: false, label: "test" }
    );
    expect(bus.count).toBe(0);
    bus.off();
  });
});
