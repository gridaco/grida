// Resize revert = byte-exact snapshot restore (`intent.restore`), NOT
// an identity-scale re-application. Regression suite for the class of
// bugs where revert routed through `intent.apply(..., 1, 1, ...)` and
// silently no-op'd whenever a per-tag handler refused the gesture
// shape:
//
//   - text resized via the HUD could not be undone (resize_text
//     refuses non-corner input, and sx = sy = 1 is non-corner);
//   - Escape-cancel mid-gesture left the text resized (Preview.discard
//     drives the same revert);
//   - undo after a committed resize of a rotated element kept the
//     commit-phase pivot renormalization (revert never wrote
//     `transform`);
//   - undo fabricated attrs that were absent before the gesture
//     (e.g. `font-size="16"` on a <text> that inherited its size).
//
// The HUD cases drive `ResizeOrchestrator` wired exactly like the DOM
// adapter (dom.ts); the RPC case goes through `commands.resize_by`.

import { describe, expect, it } from "vitest";
import { ResizeOrchestrator } from "../src/core/resize-pipeline";
import type { ResizeOptions } from "../src/core/resize-pipeline";
import { createSvgEditorWithInternals, first_tag } from "./_helpers";
import type { Rect } from "../src/types";

const OPTS: ResizeOptions = {
  pixel_grid_quantum: null,
  snap_enabled: false,
  snap_threshold_px: 10,
};

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect x="10" y="10" width="100" height="50"/><text x="50" y="100" font-size="16">hello</text></svg>`;

/** Mirror of the DOM adapter's orchestrator wiring (dom.ts), with a
 *  fixed world bbox per node — the orchestrator captures it once at
 *  gesture open, so a static map is faithful to a real gesture. */
function make_orchestrator(
  editor: ReturnType<typeof createSvgEditorWithInternals>,
  bboxes: Record<string, Rect>
): ResizeOrchestrator {
  return new ResizeOrchestrator({
    get_doc: () => editor._internal.doc,
    emit: () => editor._internal.emit(),
    open_preview: (label) => editor._internal.history.preview(label),
    open_snap: () => null,
    options: () => OPTS,
    bbox_world: (id) => bboxes[id] ?? { x: 0, y: 0, width: 0, height: 0 },
  });
}

/** Preview frame + commit, like a real handle drag. */
function drag_se(
  orch: ResizeOrchestrator,
  id: string,
  target_width: number,
  target_height: number,
  phase: "commit" | "preview-only" = "commit"
): void {
  const input = {
    ids: [id],
    direction: "se" as const,
    target_width,
    target_height,
  };
  const modifiers = {
    aspect_lock: "off",
    from_center: false,
    force_disable_snap: false,
  } as const;
  orch.drive(input, modifiers, { phase: "preview", snap: false });
  if (phase === "commit") {
    orch.drive(input, modifiers, { phase: "commit", snap: false });
  }
}

describe("HUD resize → undo restores", () => {
  it("rect: undo restores width/height", () => {
    const editor = createSvgEditorWithInternals({ svg: SVG });
    const rect_id = first_tag(editor, "rect");
    const orch = make_orchestrator(editor, {
      [rect_id]: { x: 10, y: 10, width: 100, height: 50 },
    });

    drag_se(orch, rect_id, 200, 100);
    expect(editor.document.get_attr(rect_id, "width")).toBe("200");
    expect(editor.state.can_undo).toBe(true);

    editor.commands.undo();
    expect(editor.document.get_attr(rect_id, "width")).toBe("100");
    expect(editor.document.get_attr(rect_id, "height")).toBe("50");
  });

  it("text: undo restores x/y/font-size (corner drag scales uniformly)", () => {
    const editor = createSvgEditorWithInternals({ svg: SVG });
    const text_id = first_tag(editor, "text");
    const orch = make_orchestrator(editor, {
      [text_id]: { x: 50, y: 84, width: 40, height: 20 },
    });

    drag_se(orch, text_id, 80, 40); // s = min(2, 2) = 2
    expect(editor.document.get_attr(text_id, "font-size")).toBe("32");
    expect(editor.state.can_undo).toBe(true);

    editor.commands.undo();
    expect(editor.document.get_attr(text_id, "font-size")).toBe("16");
    expect(editor.document.get_attr(text_id, "x")).toBe("50");
    expect(editor.document.get_attr(text_id, "y")).toBe("100");
  });

  it("text: redo re-applies after undo", () => {
    const editor = createSvgEditorWithInternals({ svg: SVG });
    const text_id = first_tag(editor, "text");
    const orch = make_orchestrator(editor, {
      [text_id]: { x: 50, y: 84, width: 40, height: 20 },
    });

    drag_se(orch, text_id, 80, 40);
    editor.commands.undo();
    editor.commands.redo();
    expect(editor.document.get_attr(text_id, "font-size")).toBe("32");
    editor.commands.undo();
    expect(editor.document.get_attr(text_id, "font-size")).toBe("16");
  });

  it("text without font-size attr: undo REMOVES the attr instead of fabricating the 16px fallback", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><text x="50" y="100">hello</text></svg>`;
    const editor = createSvgEditorWithInternals({ svg });
    const text_id = first_tag(editor, "text");
    const orch = make_orchestrator(editor, {
      [text_id]: { x: 50, y: 84, width: 40, height: 20 },
    });

    drag_se(orch, text_id, 80, 40);
    expect(editor.document.get_attr(text_id, "font-size")).toBe("32");

    editor.commands.undo();
    expect(editor.document.get_attr(text_id, "font-size")).toBeNull();
  });

  it("rotated rect (explicit pivot): undo restores the transform byte-exact after commit-phase pivot renormalization", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect x="10" y="10" width="100" height="50" transform="rotate(30 60 35)"/></svg>`;
    const editor = createSvgEditorWithInternals({ svg });
    const rect_id = first_tag(editor, "rect");
    const orch = make_orchestrator(editor, {
      [rect_id]: { x: 10, y: 10, width: 100, height: 50 },
    });

    drag_se(orch, rect_id, 200, 100);
    // commit moved the pivot to the new local center
    expect(editor.document.get_attr(rect_id, "transform")).not.toBe(
      "rotate(30 60 35)"
    );

    editor.commands.undo();
    expect(editor.document.get_attr(rect_id, "transform")).toBe(
      "rotate(30 60 35)"
    );
    expect(editor.document.get_attr(rect_id, "x")).toBe("10");
    expect(editor.document.get_attr(rect_id, "y")).toBe("10");
    expect(editor.document.get_attr(rect_id, "width")).toBe("100");
    expect(editor.document.get_attr(rect_id, "height")).toBe("50");
  });
});

describe("HUD resize → Escape-cancel restores", () => {
  it("text: cancel mid-gesture rolls the preview back", () => {
    const editor = createSvgEditorWithInternals({ svg: SVG });
    const text_id = first_tag(editor, "text");
    const orch = make_orchestrator(editor, {
      [text_id]: { x: 50, y: 84, width: 40, height: 20 },
    });

    drag_se(orch, text_id, 80, 40, "preview-only");
    expect(editor.document.get_attr(text_id, "font-size")).toBe("32");

    // Escape → DomSurface calls resize_orchestrator.cancel() →
    // preview.discard() → delta.revert()
    orch.cancel();
    expect(editor.document.get_attr(text_id, "font-size")).toBe("16");
    expect(editor.state.can_undo).toBe(false);
  });
});

describe("commands.resize_by (RPC path) → undo restores", () => {
  it("text: undo after a both-axes resize_by restores font-size", () => {
    const editor = createSvgEditorWithInternals({ svg: SVG });
    const text_id = first_tag(editor, "text");
    // resize_by needs a geometry provider; supply the text bbox directly.
    editor._internal.set_geometry({
      bounds_of: (id) =>
        id === text_id ? { x: 50, y: 84, width: 40, height: 20 } : null,
    });

    editor.commands.select([text_id], { mode: "set" });
    expect(editor.commands.resize_by({ dw: 40, dh: 20 })).toBe(true); // s = 2
    expect(editor.document.get_attr(text_id, "font-size")).toBe("32");

    editor.commands.undo();
    expect(editor.document.get_attr(text_id, "font-size")).toBe("16");
    expect(editor.document.get_attr(text_id, "x")).toBe("50");
  });
});
