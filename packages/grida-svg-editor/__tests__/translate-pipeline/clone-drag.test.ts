// Alt-drag translate-with-clone — the TranslateOrchestrator's clone
// state machine (gridaco/grida#817; spec:
// docs/wg/feat-svg-editor/subtree-clone.md). Driven frame-by-frame
// against a real headless editor's `_internal.{doc, history, emit}`,
// the same harness shape as commit-bus.test.ts.
//
// Pins: lazy clone on the first modifier-held frame (origin back at
// rest, clone displaced, selection + snap retargeted), mid-drag toggle
// (off removes clones and the origins resume; re-press = fresh clones),
// Escape while cloned = byte-exact restore, commit while cloned =
// exactly ONE undo step (undo removes clone + move, redo restores
// both), and zero-movement alt commit = duplicate-in-place.

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../../src/index";
import { TranslateOrchestrator } from "../../src/core/translate-pipeline/orchestrator";
import type { SvgDocument } from "../../src/core/document";
import type { NodeId } from "../../src/types";
import { first_rect } from "../_helpers";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect id="a" x="10" y="10" width="20" height="20"/><rect id="b" x="100" y="100" width="20" height="20"/></svg>`;

type Internal = {
  doc: SvgDocument;
  history: { preview: (label: string) => unknown };
  emit: () => void;
};

const MODS = {
  off: { axis_lock: "off" as const, force_disable_snap: false, clone: false },
  on: { axis_lock: "off" as const, force_disable_snap: false, clone: true },
};

function harness(opts?: { snap?: boolean }) {
  const editor = createSvgEditor({ svg: SVG });
  const internal = (editor as unknown as { _internal: Internal })._internal;
  const selection_calls: NodeId[][] = [];
  const snap_calls: NodeId[][] = [];
  const orch = new TranslateOrchestrator({
    get_doc: () => internal.doc,
    emit: () => internal.emit(),
    open_preview: (label) => internal.history.preview(label) as never,
    open_snap: (ids) => {
      snap_calls.push([...ids]);
      return null;
    },
    options: () => ({
      pixel_grid_quantum: null,
      snap_enabled: false,
      snap_threshold_px: 6,
    }),
    set_selection: (ids) => {
      selection_calls.push([...ids]);
      editor.commands.select([...ids]);
    },
  });
  const snap = opts?.snap ?? false;
  const drive = (
    ids: NodeId[],
    movement: [number, number],
    mods: (typeof MODS)["off"],
    phase: "preview" | "commit" = "preview"
  ) =>
    orch.drive({ ids, movement }, mods, {
      phase,
      policy: "engine",
      snap,
      label: "move",
    });
  return { editor, orch, drive, selection_calls, snap_calls };
}

const rect_x = (editor: ReturnType<typeof createSvgEditor>, id: string) =>
  editor.document.get_attr(id, "x");
const rect_count = (editor: ReturnType<typeof createSvgEditor>) =>
  editor.serialize().match(/<rect/g)?.length ?? 0;

describe("clone-drag — mid-gesture toggle", () => {
  it("alt ON mid-drag: origin returns to rest, the CLONE carries the displacement, selection retargets", () => {
    const { editor, orch, drive, selection_calls } = harness();
    const a = first_rect(editor);
    editor.commands.select([a]);

    drive([a], [5, 0], MODS.off);
    expect(rect_x(editor, a)).toBe("15");

    orch.redrive_modifiers(MODS.on);
    expect(rect_count(editor)).toBe(3);
    expect(rect_x(editor, a)).toBe("10"); // origin at rest
    const clone = selection_calls.at(-1)![0];
    expect(clone).not.toBe(a);
    expect(rect_x(editor, clone)).toBe("15"); // clone carries the delta
    expect(editor.state.selection).toEqual([clone]);
  });

  it("alt OFF mid-drag: clones removed, origins resume following the cursor", () => {
    const { editor, orch, drive } = harness();
    const a = first_rect(editor);
    editor.commands.select([a]);

    drive([a], [5, 0], MODS.on); // alt held from the start
    expect(rect_count(editor)).toBe(3);
    expect(rect_x(editor, a)).toBe("10");

    orch.redrive_modifiers(MODS.off);
    expect(rect_count(editor)).toBe(2);
    expect(rect_x(editor, a)).toBe("15"); // origin moves again
    expect(editor.state.selection).toEqual([a]);
  });

  it("alt ON → OFF → ON creates FRESH clones", () => {
    const { editor, orch, drive, selection_calls } = harness();
    const a = first_rect(editor);
    editor.commands.select([a]);

    drive([a], [5, 0], MODS.on);
    const first_clone = selection_calls.at(-1)![0];
    orch.redrive_modifiers(MODS.off);
    orch.redrive_modifiers(MODS.on);
    const second_clone = selection_calls.at(-1)![0];
    expect(second_clone).not.toBe(first_clone);
    expect(rect_count(editor)).toBe(3); // stale clone never serialized
  });

  it("snap session reopens against the movers on each toggle edge", () => {
    const { editor, orch, drive, snap_calls, selection_calls } = harness({
      snap: true,
    });
    const a = first_rect(editor);
    editor.commands.select([a]);

    drive([a], [5, 0], MODS.off);
    expect(snap_calls).toEqual([[a]]); // at open: origins

    orch.redrive_modifiers(MODS.on);
    const clone = selection_calls.at(-1)![0];
    expect(snap_calls.at(-1)).toEqual([clone]); // cloned: clone is the mover

    orch.redrive_modifiers(MODS.off);
    expect(snap_calls.at(-1)).toEqual([a]); // back to origins
  });
});

describe("clone-drag — cancel (Escape)", () => {
  it("cancel while cloned restores the document byte-exact and reselects the origins", () => {
    const { editor, orch, drive } = harness();
    const baseline = editor.serialize();
    const a = first_rect(editor);
    editor.commands.select([a]);

    drive([a], [5, 0], MODS.off);
    orch.redrive_modifiers(MODS.on);
    orch.redrive_modifiers({ ...MODS.on }); // extra frame, same state
    orch.cancel();

    expect(editor.serialize()).toBe(baseline);
    expect(editor.state.selection).toEqual([a]);
    expect(editor.state.can_undo).toBe(false); // nothing committed
  });
});

describe("clone-drag — commit", () => {
  it("commit while cloned is exactly ONE undo step: undo removes clone + move, redo restores both", () => {
    const { editor, orch, drive, selection_calls } = harness();
    const baseline = editor.serialize();
    const a = first_rect(editor);
    editor.commands.select([a]);

    drive([a], [3, 0], MODS.off); // plain frame first
    orch.redrive_modifiers(MODS.on); // then alt
    drive([a], [5, 0], MODS.on, "commit");

    const clone = selection_calls.at(-1)![0];
    expect(rect_count(editor)).toBe(3);
    expect(rect_x(editor, a)).toBe("10");
    expect(rect_x(editor, clone)).toBe("15");
    expect(editor.state.selection).toEqual([clone]);

    editor.commands.undo();
    expect(editor.serialize()).toBe(baseline);
    expect(editor.state.selection).toEqual([a]);
    expect(editor.state.can_undo).toBe(false); // exactly one step

    editor.commands.redo();
    expect(rect_count(editor)).toBe(3);
    expect(rect_x(editor, clone)).toBe("15");
    expect(editor.state.selection).toEqual([clone]);
  });

  it("alt held from gesture start: clone moves, origin never moves", () => {
    const { editor, drive, selection_calls } = harness();
    const a = first_rect(editor);
    editor.commands.select([a]);

    drive([a], [4, 2], MODS.on);
    drive([a], [8, 4], MODS.on, "commit");

    const clone = selection_calls.at(-1)![0];
    expect(rect_x(editor, a)).toBe("10");
    expect(rect_x(editor, clone)).toBe("18");
    expect(editor.document.get_attr(clone, "y")).toBe("14");
  });

  it("zero-movement alt commit = duplicate-in-place, one undo step", () => {
    const { editor, drive } = harness();
    const baseline = editor.serialize();
    const a = first_rect(editor);
    editor.commands.select([a]);

    drive([a], [0, 0], MODS.on, "commit");
    expect(rect_count(editor)).toBe(3);

    editor.commands.undo();
    expect(editor.serialize()).toBe(baseline);
    expect(editor.state.can_undo).toBe(false);
  });

  it("alt toggled OFF before commit: a plain move commits, no clone in the document", () => {
    const { editor, orch, drive } = harness();
    const a = first_rect(editor);
    editor.commands.select([a]);

    drive([a], [5, 0], MODS.on);
    orch.redrive_modifiers(MODS.off);
    drive([a], [5, 0], MODS.off, "commit");

    expect(rect_count(editor)).toBe(2);
    expect(rect_x(editor, a)).toBe("15");

    editor.commands.undo();
    expect(rect_x(editor, a)).toBe("10");
    expect(rect_count(editor)).toBe(2);
  });

  it("multi-selection clone-drag moves every clone and leaves every origin", () => {
    const { editor, drive, selection_calls } = harness();
    const ids = [...editor.tree().nodes.entries()]
      .filter(([, n]) => n.tag === "rect")
      .map(([id]) => id);
    expect(ids).toHaveLength(2);
    editor.commands.select(ids);

    drive(ids, [5, 0], MODS.on, "commit");
    expect(rect_count(editor)).toBe(4);
    const clones = selection_calls.at(-1)!;
    expect(clones).toHaveLength(2);
    expect(rect_x(editor, ids[0])).toBe("10");
    expect(rect_x(editor, ids[1])).toBe("100");
    expect(rect_x(editor, clones[0])).toBe("15");
    expect(rect_x(editor, clones[1])).toBe("105");
  });
});
