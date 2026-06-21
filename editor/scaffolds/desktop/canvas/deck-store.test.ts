import { describe, expect, it } from "vitest";
import { iocanvas } from "@grida/io-canvas";
import { workspaceBundleFs } from "./workspace-bundle-fs";
import { CanvasDeck, type WorkspaceDeckClient } from "./deck-store";

// A Map-backed stand-in for the desktop `workspaces` bridge. Mirrors the
// bare-path, root-relative contract the real bridge exposes.
class FakeWorkspace implements WorkspaceDeckClient {
  files = new Map<string, string>();
  private mtime = 0;
  constructor(init: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(init)) this.files.set(k, v);
  }
  async readdir(_w: string, relPath?: string) {
    // Immediate children of `relPath` (workspace root when omitted), with
    // full workspace-relative `rel_path` — matching the real bridge.
    const prefix = relPath ? `${relPath}/` : "";
    return [...this.files.keys()]
      .filter(
        (k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/")
      )
      .map((rel_path) => ({ rel_path }));
  }
  async readFile(_w: string, relPath: string) {
    const content = this.files.get(relPath);
    if (content === undefined) throw new Error(`ENOENT: ${relPath}`);
    return { content, mtime: this.mtime };
  }
  async writeFile(_w: string, relPath: string, content: string) {
    this.files.set(relPath, content);
    return { mtime: ++this.mtime };
  }
  async trashEntry(_w: string, relPath: string) {
    this.files.delete(relPath);
  }
  manifest(): iocanvas.Manifest {
    return JSON.parse(this.files.get("canvas.json") ?? "{}");
  }
}

describe("workspaceBundleFs — bridge → io-canvas port", () => {
  it("addresses files with bare paths (no leading-slash translation)", async () => {
    const ws = new FakeWorkspace();
    await iocanvas.write(workspaceBundleFs("w", ws), { type: "svg-slides" });
    expect(ws.files.has("canvas.json")).toBe(true);
    const c = await iocanvas.read(workspaceBundleFs("w", ws));
    expect(c.type).toBe("svg-slides");
  });

  it("read returns null for an absent file (→ implicit mode)", async () => {
    const ws = new FakeWorkspace({ "000.svg": "<svg/>" });
    const c = await iocanvas.read(workspaceBundleFs("w", ws));
    expect(c.mode).toBe("implicit");
    expect(c.documents.map((d) => d.src)).toEqual(["000.svg"]);
  });

  it("scopes to basePath: lists bundle-relative, reads/writes under the subdir", async () => {
    const ws = new FakeWorkspace({ "decks/d.canvas/000.svg": "<svg/>" });
    const fs = workspaceBundleFs("w", ws, "decks/d.canvas");
    expect(await fs.list()).toEqual(["000.svg"]); // stripped to bundle-relative
    await fs.write("canvas.json", "{}");
    expect(ws.files.has("decks/d.canvas/canvas.json")).toBe(true); // prefixed
    expect(await fs.read("000.svg")).toBe("<svg/>");
  });
});

describe("CanvasDeck — stateless read-modify-write (dogfoods transforms)", () => {
  it("load reflects manifest order", async () => {
    const ws = new FakeWorkspace({
      "canvas.json": JSON.stringify({
        type: "svg-slides",
        documents: [
          { src: "b.svg", id: "b" },
          { src: "a.svg", id: "a" },
        ],
      }),
      "a.svg": "<svg/>",
      "b.svg": "<svg/>",
    });
    const deck = new CanvasDeck("w", ws);
    await deck.load();
    expect(deck.getSlides().map((s) => s.src)).toEqual(["b.svg", "a.svg"]);
  });

  it("addSlide writes the SVG file and appends it to canvas.json (via iocanvas.add)", async () => {
    const ws = new FakeWorkspace({
      "canvas.json": JSON.stringify({ type: "svg-slides", documents: [] }),
    });
    const deck = new CanvasDeck("w", ws);
    await deck.load();
    const id = await deck.addSlide("<svg id='new'/>");
    await deck.flush();
    expect(ws.files.get(`${id}.svg`)).toBe("<svg id='new'/>");
    expect(deck.getSlides().map((s) => s.id)).toEqual([id]);
    expect(ws.manifest().documents?.map((d) => d.src)).toEqual([`${id}.svg`]);
  });

  it("reorder permutes the slides view and canvas.json", async () => {
    const ws = new FakeWorkspace({
      "canvas.json": JSON.stringify({
        type: "svg-slides",
        documents: [
          { src: "a.svg", id: "a" },
          { src: "b.svg", id: "b" },
        ],
      }),
      "a.svg": "<svg/>",
      "b.svg": "<svg/>",
    });
    const deck = new CanvasDeck("w", ws);
    await deck.load();
    await deck.reorder(["b", "a"]); // identities (id ?? src)
    await deck.flush();
    expect(deck.getSlides().map((s) => s.src)).toEqual(["b.svg", "a.svg"]);
    expect(ws.manifest().documents?.map((d) => d.src)).toEqual([
      "b.svg",
      "a.svg",
    ]);
  });

  it("removeSlide trashes the file and drops it from canvas.json", async () => {
    const ws = new FakeWorkspace({
      "canvas.json": JSON.stringify({
        type: "svg-slides",
        documents: [
          { src: "a.svg", id: "a" },
          { src: "b.svg", id: "b" },
        ],
      }),
      "a.svg": "<svg/>",
      "b.svg": "<svg/>",
    });
    const deck = new CanvasDeck("w", ws);
    await deck.load();
    await deck.removeSlide("a");
    await deck.flush();
    expect(ws.files.has("a.svg")).toBe(false); // trashed
    expect(deck.getSlides().map((s) => s.id)).toEqual(["b"]);
    expect(ws.manifest().documents?.map((d) => d.src)).toEqual(["b.svg"]);
  });

  it("preserves a web-authored per-slide name through reorder", async () => {
    const ws = new FakeWorkspace({
      "canvas.json": JSON.stringify({
        type: "svg-slides",
        documents: [
          { src: "a.svg", id: "a", name: "Intro" },
          { src: "b.svg", id: "b" },
        ],
      }),
      "a.svg": "<svg/>",
      "b.svg": "<svg/>",
    });
    const deck = new CanvasDeck("w", ws);
    await deck.load();
    expect(deck.getSlides()[0].name).toBe("Intro");
    await deck.reorder(["b", "a"]); // identities
    await deck.flush();
    const a = ws.manifest().documents?.find((d) => d.id === "a");
    expect(a?.name).toBe("Intro"); // unknown field survived the transform
  });

  it("reconciles against disk on load: drops missing slides, appends disk-only ones", async () => {
    const ws = new FakeWorkspace({
      "canvas.json": JSON.stringify({
        type: "svg-slides",
        documents: [
          { src: "a.svg", id: "a", name: "Intro" },
          { src: "missing.svg", id: "gone" }, // declared but absent on disk
        ],
      }),
      "a.svg": "<svg/>",
      "c.svg": "<svg/>", // on disk but not in the manifest (added externally)
    });
    const deck = new CanvasDeck("w", ws);
    await deck.load();
    // The rendered view follows disk: the missing slide is gone, the disk-only
    // one is appended, and the surviving entry keeps its name.
    expect(deck.getSlides().map((s) => s.src)).toEqual(["a.svg", "c.svg"]);
    expect(deck.getSlides()[0].name).toBe("Intro");

    // A later persist writes the reconciled state, not the stale manifest.
    await deck.reorder(["a", "c.svg"]); // identities (id ?? src)
    await deck.flush();
    expect(ws.manifest().documents?.map((d) => d.src)).toEqual([
      "a.svg",
      "c.svg",
    ]);
    expect(ws.manifest().documents?.find((d) => d.id === "a")?.name).toBe(
      "Intro"
    );
  });

  it("operates on a `.canvas` nested at basePath, not the workspace root", async () => {
    const ws = new FakeWorkspace({
      "decks/intro.canvas/canvas.json": JSON.stringify({
        type: "svg-slides",
        documents: [{ src: "000.svg", id: "a" }],
      }),
      "decks/intro.canvas/000.svg": "<svg/>",
      "other/notes.txt": "x", // sibling content the deck must ignore
    });
    const deck = new CanvasDeck("w", ws, "decks/intro.canvas");
    await deck.load();
    expect(deck.getSlides().map((s) => s.src)).toEqual(["000.svg"]);

    const id = await deck.addSlide("<svg id='new'/>");
    await deck.flush();
    // The new slide file lands under the bundle dir, not the workspace root.
    expect(ws.files.has(`decks/intro.canvas/${id}.svg`)).toBe(true);
    expect(ws.files.has(`${id}.svg`)).toBe(false);
    // canvas.json under the bundle dir; its `src` stays bundle-relative (portable).
    const manifest = JSON.parse(
      ws.files.get("decks/intro.canvas/canvas.json")!
    ) as iocanvas.Manifest;
    expect(manifest.documents?.map((d) => d.src)).toEqual([
      "000.svg",
      `${id}.svg`,
    ]);
  });
});
