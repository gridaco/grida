// Vector sub-selection write/read API (gridaco/grida#790).
//
// Two layers are exercised here, both headless (no DOM surface — see
// __tests__/README.md):
//
//   1. The pure core (`apply_subselection` / `validate_subselection`):
//      validation + session mutation against a real `VectorEditSession` +
//      `PathModel`. This is where the load-bearing logic lives, so this is
//      where the bugs must reproduce (core-first testing doctrine).
//   2. The editor wiring (`commands.set_vector_selection`,
//      `enter_content_edit(id, opts)`, and the read channel
//      `subscribe_vector_subselection` / `vector_subselection()`): the
//      surface-private session can't be mounted headlessly, so we stub the
//      drivers and assert the editor delegates / fans out correctly. The
//      end-to-end surface path is a manual case in `test/`.

import { describe, expect, it, vi } from "vitest";
import { createSvgEditor } from "../src/index";
import {
  PathModel,
  VectorEditSession,
  apply_subselection,
  validate_subselection,
} from "../src/core/vector-edit";
import type { VectorSubSelection, VectorSubSelectionInput } from "../src/types";

// 3 vertices, 3 segments (closed triangle).
const D = "M0,0 L10,0 L10,10 Z";

function session(): VectorEditSession {
  return new VectorEditSession("p1", { kind: "path", d: D }, D);
}
function model(): PathModel {
  return PathModel.fromSvgPathD(D);
}

describe("validate_subselection — strict range check", () => {
  const m = model();

  it("accepts in-range vertices / segments / tangents", () => {
    expect(validate_subselection({ vertices: [0, 1, 2] }, m)).toBe(true);
    expect(validate_subselection({ segments: [0, 1, 2] }, m)).toBe(true);
    expect(
      validate_subselection(
        {
          tangents: [
            [0, 0],
            [2, 1],
          ],
        },
        m
      )
    ).toBe(true);
  });

  it("accepts an empty input (clears in replace mode)", () => {
    expect(validate_subselection({}, m)).toBe(true);
  });

  it("rejects an out-of-range vertex", () => {
    expect(validate_subselection({ vertices: [3] }, m)).toBe(false);
    expect(validate_subselection({ vertices: [-1] }, m)).toBe(false);
  });

  it("rejects an out-of-range segment", () => {
    expect(validate_subselection({ segments: [3] }, m)).toBe(false);
  });

  it("rejects a bad tangent ref (vertex out of range or side not 0/1)", () => {
    expect(validate_subselection({ tangents: [[9, 0]] }, m)).toBe(false);
    expect(validate_subselection({ tangents: [[0, 2 as 0 | 1]] }, m)).toBe(
      false
    );
  });

  it("rejects non-integer indices", () => {
    expect(validate_subselection({ vertices: [1.5] }, m)).toBe(false);
  });

  it("refuses the WHOLE input if any one index is out of range", () => {
    // Strict: a partially-valid input is rejected, not partially applied.
    expect(validate_subselection({ vertices: [0, 1, 99] }, m)).toBe(false);
  });
});

describe("apply_subselection — mutation semantics", () => {
  it("replace swaps in the whole triple and clears omitted tracks", () => {
    const s = session();
    s.set_selection({ vertices: [2], segments: [2], tangents: [[2, 1]] });
    const changed = apply_subselection(
      s,
      model(),
      { vertices: [0, 1] },
      "replace"
    );
    expect(changed).toBe(true);
    expect(s.selected_vertices).toEqual([0, 1]);
    expect(s.selected_segments).toEqual([]); // omitted track cleared
    expect(s.selected_tangents).toEqual([]);
  });

  it("add folds into the existing selection, leaving omitted tracks intact", () => {
    const s = session();
    s.set_selection({ vertices: [0], segments: [1], tangents: [] });
    apply_subselection(s, model(), { vertices: [2] }, "add");
    expect(s.selected_vertices).toEqual([0, 2]);
    expect(s.selected_segments).toEqual([1]); // intact — not in input
  });

  it("toggle removes an already-selected vertex", () => {
    const s = session();
    s.set_selection({ vertices: [0, 1], segments: [], tangents: [] });
    apply_subselection(s, model(), { vertices: [0] }, "toggle");
    expect(s.selected_vertices).toEqual([1]);
  });

  it("returns false (no mutation) on out-of-range input — strict refusal", () => {
    const s = session();
    s.set_selection({ vertices: [0], segments: [], tangents: [] });
    const changed = apply_subselection(
      s,
      model(),
      { vertices: [99] },
      "replace"
    );
    expect(changed).toBe(false);
    expect(s.selected_vertices).toEqual([0]); // untouched
  });

  it("returns false when the write resolves to the current selection", () => {
    const s = session();
    s.set_selection({ vertices: [0, 1], segments: [], tangents: [] });
    const changed = apply_subselection(
      s,
      model(),
      { vertices: [0, 1] },
      "replace"
    );
    expect(changed).toBe(false);
  });
});

// ─── Editor wiring (headless, driver-stubbed) ────────────────────────────────

type Internal = {
  set_vector_subselect_driver: (
    fn: ((input: VectorSubSelectionInput, mode?: string) => boolean) | null
  ) => void;
  set_content_edit_driver: (
    fn: ((id: string, opts?: VectorSubSelectionInput) => boolean) | null
  ) => void;
  push_vector_subselection: (sel: VectorSubSelection | null) => void;
};

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path id="p" d="M0,0 L10,0 L10,10 Z"/>
</svg>`;

function pathId(editor: ReturnType<typeof createSvgEditor>): string {
  for (const [id, node] of editor.tree().nodes) {
    if (node.tag === "path") return id;
  }
  throw new Error("no <path>");
}

function internal(editor: ReturnType<typeof createSvgEditor>): Internal {
  return (editor as unknown as { _internal: Internal })._internal;
}

describe("commands.set_vector_selection — delegates to the surface driver", () => {
  it("forwards input + mode and returns the driver's result", () => {
    const editor = createSvgEditor({ svg: SVG });
    const driver = vi.fn<
      (input: VectorSubSelectionInput, mode?: string) => boolean
    >(() => true);
    internal(editor).set_vector_subselect_driver(driver);

    const input = { vertices: [0, 2] };
    expect(editor.commands.set_vector_selection(input, "add")).toBe(true);
    expect(driver).toHaveBeenCalledWith(input, "add");
  });

  it("is a no-op returning false when no surface (driver) is attached", () => {
    const editor = createSvgEditor({ svg: SVG });
    expect(editor.commands.set_vector_selection({ vertices: [0] })).toBe(false);
  });

  it("propagates a driver refusal (false)", () => {
    const editor = createSvgEditor({ svg: SVG });
    internal(editor).set_vector_subselect_driver(() => false);
    expect(editor.commands.set_vector_selection({ vertices: [99] })).toBe(
      false
    );
  });
});

describe("enter_content_edit(id, opts) — threads the initial sub-selection", () => {
  it("forwards opts to the content-edit driver", () => {
    const editor = createSvgEditor({ svg: SVG });
    const id = pathId(editor);
    const driver = vi.fn<
      (id: string, opts?: VectorSubSelectionInput) => boolean
    >(() => true);
    internal(editor).set_content_edit_driver(driver);

    const opts = { vertices: [1] };
    expect(editor.enter_content_edit(id, opts)).toBe(true);
    expect(driver).toHaveBeenCalledWith(id, opts);
  });

  it("still works with no opts (back-compat)", () => {
    const editor = createSvgEditor({ svg: SVG });
    const id = pathId(editor);
    const driver = vi.fn<
      (id: string, opts?: VectorSubSelectionInput) => boolean
    >(() => true);
    internal(editor).set_content_edit_driver(driver);
    expect(editor.enter_content_edit(id)).toBe(true);
    expect(driver).toHaveBeenCalledWith(id, undefined);
  });
});

describe("vector sub-selection read channel", () => {
  it("subscribe fires with the pushed value, accessor reflects it", () => {
    const editor = createSvgEditor({ svg: SVG });
    const seen: (VectorSubSelection | null)[] = [];
    const unsub = editor.subscribe_vector_subselection((s) => seen.push(s));

    const sel: VectorSubSelection = {
      node_id: pathId(editor),
      vertices: [0, 1],
      segments: [],
      tangents: [],
    };
    internal(editor).push_vector_subselection(sel);
    expect(seen).toEqual([sel]);
    expect(editor.vector_subselection()).toBe(sel);

    internal(editor).push_vector_subselection(null);
    expect(editor.vector_subselection()).toBe(null);

    unsub();
    internal(editor).push_vector_subselection(sel);
    expect(seen.length).toBe(2); // no further fire after unsubscribe
  });

  it("does NOT bump state.version (off the version stream — P4)", () => {
    const editor = createSvgEditor({ svg: SVG });
    const v0 = editor.state.version;
    internal(editor).push_vector_subselection({
      node_id: pathId(editor),
      vertices: [0],
      segments: [],
      tangents: [],
    });
    expect(editor.state.version).toBe(v0);
  });

  it("starts null", () => {
    const editor = createSvgEditor({ svg: SVG });
    expect(editor.vector_subselection()).toBe(null);
  });
});
