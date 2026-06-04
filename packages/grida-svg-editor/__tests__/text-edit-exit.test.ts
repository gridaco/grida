// Empty-equals-delete decision (pure policy) + text-insert default attrs.
// The DOM surface only dispatches `resolve_text_exit`'s action, so these
// headless tests are the spec for the rule itself.
// Design: docs/wg/feat-svg-editor/text-tool.md.

import { describe, expect, it } from "vitest";
import { resolve_text_exit } from "../src/core/text-edit";
import { insertions } from "../src/core/insertions";

describe("resolve_text_exit — empty-equals-delete policy", () => {
  it("fresh + empty discards the insert (no node, no history entry)", () => {
    expect(
      resolve_text_exit({ origin: "fresh", result: "", original: "" })
    ).toEqual({ kind: "discard_insert" });
  });

  it("fresh + content commits the insert as one step", () => {
    expect(
      resolve_text_exit({ origin: "fresh", result: "hello", original: "" })
    ).toEqual({ kind: "commit_insert" });
  });

  it("a typed space is content — fresh + space commits, not discards", () => {
    expect(
      resolve_text_exit({ origin: "fresh", result: " ", original: "" })
    ).toEqual({ kind: "commit_insert" });
  });

  it("existing + emptied is removed (undo restores original content)", () => {
    expect(
      resolve_text_exit({ origin: "existing", result: "", original: "hello" })
    ).toEqual({ kind: "remove" });
  });

  it("existing + already-empty-and-unchanged is still removed (unconditional rule)", () => {
    expect(
      resolve_text_exit({ origin: "existing", result: "", original: "" })
    ).toEqual({ kind: "remove" });
  });

  it("existing + changed content writes the new text", () => {
    expect(
      resolve_text_exit({ origin: "existing", result: "new", original: "old" })
    ).toEqual({ kind: "set_text", value: "new" });
  });

  it("existing + unchanged content is a no-op", () => {
    expect(
      resolve_text_exit({
        origin: "existing",
        result: "same",
        original: "same",
      })
    ).toEqual({ kind: "noop" });
  });

  it("whitespace is content — existing edited from empty to a space writes it", () => {
    expect(
      resolve_text_exit({ origin: "existing", result: " ", original: "" })
    ).toEqual({ kind: "set_text", value: " " });
  });
});

describe("insertions.default_text_attrs", () => {
  it("anchors at the world point and carries the default font appearance", () => {
    expect(insertions.default_text_attrs({ x: 12, y: 34 })).toEqual({
      x: "12",
      y: "34",
      "font-size": "16",
      "font-family": "sans-serif",
      fill: "#000000",
    });
  });

  it("rounds fractional world coordinates (IEEE-754 noise suppression)", () => {
    const attrs = insertions.default_text_attrs({
      x: 0.30000000000000004,
      y: 1,
    });
    expect(attrs.x).toBe("0.3");
  });
});
