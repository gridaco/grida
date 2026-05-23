// Covers `commands.select(ids, { mode })` semantics for the three HUD-aligned
// modes: `replace` (default), `add`, `toggle`. The toggle case is the bug
// fix — `shift+click` on an already-selected node should remove it, not
// silently re-add (no-op).

import { describe, expect, it } from "vitest";
import { createSvgEditor } from "../src";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect id="a" x="0" y="0" width="10" height="10"/>
  <rect id="b" x="20" y="0" width="10" height="10"/>
  <rect id="c" x="40" y="0" width="10" height="10"/>
</svg>`;

function findId(
  editor: ReturnType<typeof createSvgEditor>,
  name: string
): string {
  const found = [...editor.tree().nodes.values()].find((n) => n.name === name);
  if (!found) throw new Error(`no node named "${name}"`);
  return found.id;
}

describe("commands.select — SelectMode", () => {
  it("default (no opts) replaces selection", () => {
    const e = createSvgEditor({ svg: SVG });
    const a = findId(e, "a");
    const b = findId(e, "b");
    e.commands.select(a);
    e.commands.select(b);
    expect([...e.state.selection]).toEqual([b]);
  });

  it("mode: 'replace' is the default behavior", () => {
    const e = createSvgEditor({ svg: SVG });
    const a = findId(e, "a");
    const b = findId(e, "b");
    e.commands.select(a);
    e.commands.select(b, { mode: "replace" });
    expect([...e.state.selection]).toEqual([b]);
  });

  it("mode: 'add' unions ids without removing existing members", () => {
    const e = createSvgEditor({ svg: SVG });
    const a = findId(e, "a");
    const b = findId(e, "b");
    const c = findId(e, "c");
    e.commands.select(a);
    e.commands.select(b, { mode: "add" });
    e.commands.select(c, { mode: "add" });
    expect([...e.state.selection].sort()).toEqual([a, b, c].sort());
  });

  it("mode: 'add' on an already-selected id is a no-op", () => {
    const e = createSvgEditor({ svg: SVG });
    const a = findId(e, "a");
    e.commands.select(a);
    e.commands.select(a, { mode: "add" });
    expect([...e.state.selection]).toEqual([a]);
  });

  it("mode: 'toggle' adds a non-member", () => {
    const e = createSvgEditor({ svg: SVG });
    const a = findId(e, "a");
    const b = findId(e, "b");
    e.commands.select(a);
    e.commands.select(b, { mode: "toggle" });
    expect([...e.state.selection].sort()).toEqual([a, b].sort());
  });

  it("mode: 'toggle' removes an already-selected member (shift+click deselect)", () => {
    const e = createSvgEditor({ svg: SVG });
    const a = findId(e, "a");
    const b = findId(e, "b");
    e.commands.select([a, b], { mode: "add" });
    e.commands.select(b, { mode: "toggle" });
    expect([...e.state.selection]).toEqual([a]);
  });

  it("mode: 'toggle' on the sole selection drops to empty", () => {
    const e = createSvgEditor({ svg: SVG });
    const a = findId(e, "a");
    e.commands.select(a);
    e.commands.select(a, { mode: "toggle" });
    expect([...e.state.selection]).toEqual([]);
  });

  it("mode: 'toggle' on multiple ids flips each independently", () => {
    const e = createSvgEditor({ svg: SVG });
    const a = findId(e, "a");
    const b = findId(e, "b");
    const c = findId(e, "c");
    // start with [a, b]; toggle [b, c] → [a, c]
    e.commands.select([a, b], { mode: "add" });
    e.commands.select([b, c], { mode: "toggle" });
    expect([...e.state.selection].sort()).toEqual([a, c].sort());
  });
});
