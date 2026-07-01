import { describe, expect, it } from "vitest";
import { dotcanvas } from "dotcanvas";
import { CanvasBoard, isUriSrc } from "./board-store";
import type { WorkspaceFsClient } from "./workspace-bundle-fs";

/** Map-backed stand-in for the desktop `workspaces` bridge (board needs only
 *  the read/write fs surface — no trash). */
class FakeWorkspace implements WorkspaceFsClient {
  files = new Map<string, string>();
  private mtime = 0;
  constructor(init: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(init)) this.files.set(k, v);
  }
  async readdir(_w: string, relPath?: string) {
    const prefix = relPath ? `${relPath}/` : "";
    const seen = new Set<string>();
    const out: { rel_path: string; kind: "file" | "directory" }[] = [];
    for (const k of this.files.keys()) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash === -1) out.push({ rel_path: k, kind: "file" });
      else {
        const dir = prefix + rest.slice(0, slash);
        if (!seen.has(dir)) {
          seen.add(dir);
          out.push({ rel_path: dir, kind: "directory" });
        }
      }
    }
    return out;
  }
  async readFile(_w: string, relPath: string) {
    const content = this.files.get(relPath);
    if (content === undefined) throw new Error(`ENOENT: ${relPath}`);
    return { content };
  }
  async writeFile(_w: string, relPath: string, content: string) {
    this.files.set(relPath, content);
    return { mtime: ++this.mtime };
  }
  manifest(): dotcanvas.Manifest {
    return JSON.parse(this.files.get(".canvas.json") ?? "{}");
  }
}

const URL = "https://cdn.example.com/library/ref.jpg";

describe("isUriSrc", () => {
  it("distinguishes a URL from a bundle path", () => {
    expect(isUriSrc(URL)).toBe(true);
    expect(isUriSrc("outputs/hero.png")).toBe(false);
    expect(isUriSrc("./a.svg")).toBe(false);
  });
});

describe("CanvasBoard", () => {
  it("adds a URI pin (manifest-only, no file authored) and a placed file pin", async () => {
    const ws = new FakeWorkspace({ "outputs/hero.png": "PNGBYTES" });
    const board = new CanvasBoard("w", ws);
    await board.load();

    await board.addFrame(URL, { x: 0, y: 0, w: 480, h: 320 });
    await board.addFrame("outputs/hero.png", { x: 520, y: 0, w: 768, h: 512 });
    await board.flush();

    const frames = board.getFrames();
    expect(frames.map((f) => f.src)).toEqual([URL, "outputs/hero.png"]);
    // a URI pin authors no file; only the manifest + the pre-existing output exist
    expect([...ws.files.keys()].sort()).toEqual([
      ".canvas.json",
      "outputs/hero.png",
    ]);
    expect(ws.manifest().editor).toBe("board");
  });

  it("places / moves a pin via setLayout and round-trips through reload", async () => {
    const ws = new FakeWorkspace();
    const board = new CanvasBoard("w", ws);
    await board.load();
    await board.addFrame(URL);
    await board.setLayout(URL, { x: 5, y: 6, w: 100, h: 80 });
    await board.flush();

    // a fresh store over the same disk sees the placement (persisted)
    const reopened = new CanvasBoard("w", ws);
    await reopened.load();
    expect(reopened.getFrames()).toEqual([
      { id: URL, src: URL, layout: { x: 5, y: 6, w: 100, h: 80 } },
    ]);
  });

  it("removes a pin from the manifest (file/URL left in place)", async () => {
    const ws = new FakeWorkspace({ "outputs/hero.png": "PNGBYTES" });
    const board = new CanvasBoard("w", ws);
    await board.load();
    await board.addFrame("outputs/hero.png");
    await board.removeFrame("outputs/hero.png");
    await board.flush();

    expect(board.getFrames()).toEqual([]);
    expect(ws.files.has("outputs/hero.png")).toBe(true); // not trashed
  });
});
