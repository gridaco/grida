// `@grida/hud/cursors` — default renderer + tree-shake invariant.
//
// Two test goals:
//
// 1. **Renderer behavior** — each `CursorIcon` variant maps to a
//    non-empty CSS cursor value, the renderer is deterministic, and
//    the fallback keyword still lives at the tail of every data-URL
//    value (so a browser that fails the URL load lands on a sensible
//    native cursor, not `auto`).
// 2. **Tree-shake invariant** — nothing in `surface/`, `event/`, or
//    `primitives/` imports from `cursors/`. This is the architectural
//    rule that lets hosts not using the cursor module pay zero bundle
//    cost. Asserted by static import-graph scan, so any future drift
//    fails the build.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  cursors,
  defaultRenderer,
  svgDataUrl,
  type CursorRenderer,
} from "../cursors";
import type { CursorIcon } from "../event/cursor";
import { cursorToCss } from "../event/cursor";

// `btoa` is browser-only; provide a tiny Node shim for these tests so
// the renderer works under vitest's node environment. Keeps the
// production module free of conditional polyfills.
if (typeof globalThis.btoa === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).btoa = (s: string) =>
    Buffer.from(s, "binary").toString("base64");
}

describe("svgDataUrl", () => {
  it("encodes an SVG string as a base64 data URL", () => {
    const url = svgDataUrl(`<svg/>`);
    expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
  });
});

describe("defaultRenderer", () => {
  const render: CursorRenderer = defaultRenderer();

  it("returns native CSS keywords for static cursor variants", () => {
    const passthrough: CursorIcon[] = [
      "default",
      "pointer",
      "move",
      "crosshair",
      "grab",
      "grabbing",
      "text",
    ];
    for (const icon of passthrough) {
      expect(render(icon)).toBe(cursorToCss(icon));
    }
  });

  it("returns a data-URL cursor with fallback keyword for rotate variants", () => {
    for (const corner of ["nw", "ne", "se", "sw"] as const) {
      const css = render({ kind: "rotate", corner });
      expect(css).toMatch(/^url\(data:image\/svg\+xml;base64,/);
      // Hotspot embedded.
      expect(css).toMatch(/\) 12 12,/);
      // Tail-keyword fallback (legacy `cursorToCss` value).
      expect(css.endsWith(", crosshair")).toBe(true);
    }
  });

  it("returns a data-URL cursor with direction-keyword fallback for resize variants", () => {
    for (const direction of [
      "n",
      "ne",
      "e",
      "se",
      "s",
      "sw",
      "w",
      "nw",
    ] as const) {
      const css = render({ kind: "resize", direction });
      expect(css).toMatch(/^url\(data:image\/svg\+xml;base64,/);
      expect(css).toMatch(/\) 16 16,/);
      // Tail keyword matches what `cursorToCss` would return.
      expect(css.endsWith(`, ${direction}-resize`)).toBe(true);
    }
  });

  it("produces 4 distinct rotate cursors (per-corner orientation)", () => {
    const out = new Set(
      (["nw", "ne", "se", "sw"] as const).map((c) =>
        render({ kind: "rotate", corner: c })
      )
    );
    expect(out.size).toBe(4);
  });

  it("opposite resize directions share the same SVG (bidirectional arrow)", () => {
    // The arrow is bidirectional: N/S share the SVG, E/W share the
    // SVG, NE/SW share, NW/SE share. 8 directions → 4 distinct SVGs.
    // Full CSS strings differ because the fallback keyword (`n-resize`
    // vs `s-resize`) is part of the value — so we extract just the
    // data URL portion to assert the SVG-level invariant.
    const url_of = (css: string) =>
      css.match(/^url\((data:[^)]+)\)/)?.[1] ?? "";
    const svgs = new Set(
      (["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const).map((d) =>
        url_of(render({ kind: "resize", direction: d }))
      )
    );
    expect(svgs.size).toBe(4);

    // Sanity: full CSS strings are all distinct (fallback keyword carries
    // the unique direction tag).
    const full = new Set(
      (["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const).map((d) =>
        render({ kind: "resize", direction: d })
      )
    );
    expect(full.size).toBe(8);
  });

  it("is deterministic — same input twice → same output", () => {
    const a = render({ kind: "rotate", corner: "nw" });
    const b = render({ kind: "rotate", corner: "nw" });
    expect(a).toBe(b);
  });

  it("namespace export mirrors named exports", () => {
    expect(cursors.defaultRenderer).toBe(defaultRenderer);
    expect(cursors.svgDataUrl).toBe(svgDataUrl);
    expect(cursors.hotspots.rotate).toEqual([12, 12]);
    expect(cursors.hotspots.resize).toEqual([16, 16]);
  });

  // ── Angle-aware rendering (Phase A.5) ────────────────────────────────────
  // During the rotate gesture, the state machine bumps `baseAngle`
  // every frame; the renderer must produce a visibly different SVG so
  // the cursor visually tracks the rotation. Without this, the cursor
  // freezes at the gesture-start orientation while the element rotates
  // under it.

  it("rotate cursor differs when baseAngle changes by more than one bucket", () => {
    const at_0 = render({ kind: "rotate", corner: "nw", baseAngle: 0 });
    const at_90 = render({
      kind: "rotate",
      corner: "nw",
      baseAngle: Math.PI / 2,
    });
    expect(at_0).not.toBe(at_90);
  });

  it("rotate cursor with baseAngle === 0 matches the no-baseAngle case", () => {
    // Backwards-compat: pre-Phase-A.5 icons (no `baseAngle`) and
    // explicit `baseAngle: 0` must produce identical CSS output, so
    // hover-idle cursors don't change behavior.
    const a = render({ kind: "rotate", corner: "ne" });
    const b = render({ kind: "rotate", corner: "ne", baseAngle: 0 });
    expect(a).toBe(b);
  });

  it("rotate cursor with sub-bucket angle changes returns the SAME string", () => {
    // 0.5° = π/360 rad is the bucket size. Two icons within the same
    // bucket must produce identical output so the renderer's LRU cache
    // and the state machine's `cursorEquals` agree.
    // π/1440 = 0.125° — quarter of a bucket. (Half a bucket lands on
    // the bucket boundary; `Math.round` ties go away from zero in JS,
    // so π/720 would map to bucket 1, not 0.)
    const epsilon = Math.PI / 1440;
    const a = render({ kind: "rotate", corner: "se", baseAngle: 0 });
    const b = render({ kind: "rotate", corner: "se", baseAngle: epsilon });
    expect(a).toBe(b);
  });

  it("resize cursor angle-aware path also works (used by Phase B)", () => {
    const at_0 = render({ kind: "resize", direction: "n", baseAngle: 0 });
    const at_45 = render({
      kind: "resize",
      direction: "n",
      baseAngle: Math.PI / 4,
    });
    expect(at_0).not.toBe(at_45);
  });

  it("repeated calls with the same bucket return identical strings", () => {
    // The renderer is stateless — re-emit gating lives in `cursorEquals`
    // upstream, not here. Two calls with the same bucket must still
    // produce value-identical CSS (deterministic templates).
    const r = defaultRenderer();
    const a = r({ kind: "rotate", corner: "nw", baseAngle: 0.1 });
    const b = r({ kind: "rotate", corner: "nw", baseAngle: 0.1 });
    expect(a).toBe(b);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Tree-shake invariant
//
// Anything inside `surface/`, `event/`, or `primitives/` must NOT import
// from `cursors/`. The cursor module is a leaf — it imports from
// `event/` but nothing imports it. This lets bundlers tree-shake it out
// for hosts that never touch `@grida/hud/cursors`.
//
// Scanned via static text grep over `.ts` files. Cheap, deterministic.
// ────────────────────────────────────────────────────────────────────────────

describe("tree-shake invariant", () => {
  const PKG_ROOT = resolve(__dirname, "..");
  const FORBIDDEN_ROOTS = ["surface", "event", "primitives"];

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full, out);
      else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
    }
    return out;
  }

  it("no surface/event/primitives file imports from `cursors/`", () => {
    const offenders: Array<{ file: string; line: string }> = [];
    for (const root of FORBIDDEN_ROOTS) {
      for (const file of walk(join(PKG_ROOT, root))) {
        const text = readFileSync(file, "utf-8");
        for (const line of text.split("\n")) {
          // Match `from "../cursors..."`, `from "./cursors..."`,
          // `import "...cursors..."` patterns; ignore comments.
          if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;
          if (/from\s+["'][^"']*cursors\b/.test(line)) {
            offenders.push({ file, line: line.trim() });
          }
        }
      }
    }
    if (offenders.length > 0) {
      const msg = offenders.map((o) => `  ${o.file}: ${o.line}`).join("\n");
      throw new Error(
        `cursors/ must not be imported from surface/event/primitives:\n${msg}`
      );
    }
    expect(offenders).toEqual([]);
  });
});
