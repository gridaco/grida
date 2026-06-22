import { describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { dotcanvas } from "./index";

// Reads the on-disk demo bundle through a node:fs-backed `ReadableFs`. Using
// node:fs HERE (in a test) is fine — the package itself never touches the
// filesystem (anti-goal); the port is the seam. This both validates the fixture
// and exercises the reader against real files, complementing the in-memory tests.

const DEMO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/test-canvas/demo.canvas"
);

function nodeReadableFs(dir: string): dotcanvas.ReadableFs {
  return {
    list: () => fs.readdir(dir),
    read: async (p) => {
      try {
        return await fs.readFile(path.join(dir, p), "utf8");
      } catch {
        return null;
      }
    },
  };
}

describe("fixtures/test-canvas/demo.canvas", () => {
  it("reads as a clean 3-slide svg-slides deck", async () => {
    const c = await dotcanvas.read(nodeReadableFs(DEMO));

    expect(c.mode).toBe("declared");
    expect(c.type).toBe("svg-slides");
    // Order is the manifest order; identity is each doc's id (≠ filename stem).
    expect(c.documents.map((d) => d.id)).toEqual(["intro", "chart", "thanks"]);
    expect(c.documents.map((d) => d.src)).toEqual([
      "001.svg",
      "002.svg",
      "003.svg",
    ]);
    expect(c.documents.every((d) => d.origin === "manifest" && d.exists)).toBe(
      true
    );
    // Slide 2 carries a canvas-view layout.
    expect(c.documents[1].layout).toEqual({
      x: 0,
      y: 0,
      w: 1920,
      h: 1080,
      z: 0,
    });
    // Thumbnail resolved by the filename convention (no explicit field).
    expect(c.thumbnail).toBe("thumbnail.svg");
    // App view-state rides in ext, preserved verbatim.
    expect((c.ext["co.grida.svg-demo"] as { activeId?: string }).activeId).toBe(
      "intro"
    );
    // A well-formed bundle degrades to nothing — no warnings.
    expect(c.warnings).toEqual([]);
  });
});
