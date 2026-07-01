import { describe, expect, it } from "vitest";
import { dotcanvas } from "dotcanvas";
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
    // Immediate children of `relPath` (workspace root when omitted), with full
    // workspace-relative `rel_path` and a `kind` — matching the real bridge. A
    // leaf key is a file; a deeper key surfaces its first segment as a directory.
    const prefix = relPath ? `${relPath}/` : "";
    const seen = new Set<string>();
    const out: { rel_path: string; kind: "file" | "directory" }[] = [];
    for (const k of this.files.keys()) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash === -1) {
        out.push({ rel_path: k, kind: "file" });
      } else {
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
    return { content, mtime: this.mtime };
  }
  async writeFile(_w: string, relPath: string, content: string) {
    this.files.set(relPath, content);
    return { mtime: ++this.mtime };
  }
  async trashEntry(_w: string, relPath: string) {
    this.files.delete(relPath);
  }
  manifest(): dotcanvas.Manifest {
    return JSON.parse(this.files.get(".canvas.json") ?? "{}");
  }
}

describe("workspaceBundleFs — bridge → dotcanvas port", () => {
  it("addresses files with bare paths (no leading-slash translation)", async () => {
    const ws = new FakeWorkspace();
    await dotcanvas.write(workspaceBundleFs("w", ws), { editor: "slides" });
    expect(ws.files.has(".canvas.json")).toBe(true);
    const c = await dotcanvas.read(workspaceBundleFs("w", ws));
    expect(c.editor).toBe("slides");
  });

  it("read returns null for an absent file (→ implicit mode)", async () => {
    const ws = new FakeWorkspace({ "001.svg": "<svg/>" });
    const c = await dotcanvas.read(workspaceBundleFs("w", ws));
    expect(c.mode).toBe("implicit");
    expect(c.documents.map((d) => d.src)).toEqual(["001.svg"]);
  });

  it("scopes to basePath: lists bundle-relative, reads/writes under the subdir", async () => {
    const ws = new FakeWorkspace({ "decks/d.canvas/001.svg": "<svg/>" });
    const fs = workspaceBundleFs("w", ws, "decks/d.canvas");
    expect(await fs.list()).toEqual(["001.svg"]); // stripped to bundle-relative
    await fs.write(".canvas.json", "{}");
    expect(ws.files.has("decks/d.canvas/.canvas.json")).toBe(true); // prefixed
    expect(await fs.read("001.svg")).toBe("<svg/>");
  });

  it("list() walks subdirectories so a nested src resolves (not missing_src)", async () => {
    const ws = new FakeWorkspace({
      ".canvas.json": JSON.stringify({
        editor: "slides",
        documents: [{ src: "slides/001.svg" }],
      }),
      "slides/001.svg": "<svg/>",
    });
    const c = await dotcanvas.read(workspaceBundleFs("w", ws));
    // The shallow bridge readdir would miss `slides/001.svg`; the recursive
    // walk finds it, so it resolves as present rather than `missing_src`.
    expect(c.documents.map((d) => d.src)).toEqual(["slides/001.svg"]);
    expect(c.warnings).toEqual([]);
  });
});

describe("CanvasDeck — stateless read-modify-write (dogfoods transforms)", () => {
  it("load reflects manifest order", async () => {
    const ws = new FakeWorkspace({
      ".canvas.json": JSON.stringify({
        editor: "slides",
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

  it("excludes a URI doc from the slides view but keeps it in the manifest", async () => {
    // A board's library pin (URL src) must NOT be read as a slide file (the
    // `coffee-promo.canvas/https://…` ENOENT) — but it must survive a persist.
    const ws = new FakeWorkspace({
      ".canvas.json": JSON.stringify({
        editor: "slides",
        documents: [
          { src: "https://cdn.example.com/ref.jpg", id: "ref" },
          { src: "a.svg", id: "a" },
        ],
      }),
      "a.svg": "<svg/>",
    });
    const deck = new CanvasDeck("w", ws);
    await deck.load();
    // view excludes the URL pin (would otherwise drive a readfile of a URL)
    expect(deck.getSlides().map((s) => s.src)).toEqual(["a.svg"]);
    // but a mutation persists the FULL manifest — the URL doc is not lost
    await deck.addSlide("<svg id='new'/>");
    await deck.flush();
    expect(ws.manifest().documents?.map((d) => d.src)).toContain(
      "https://cdn.example.com/ref.jpg"
    );
  });

  it("addSlide writes the SVG file and appends it to .canvas.json (via dotcanvas.add)", async () => {
    const ws = new FakeWorkspace({
      ".canvas.json": JSON.stringify({ editor: "slides", documents: [] }),
    });
    const deck = new CanvasDeck("w", ws);
    await deck.load();
    const id = await deck.addSlide("<svg id='new'/>");
    await deck.flush();
    expect(ws.files.get(`${id}.svg`)).toBe("<svg id='new'/>");
    expect(deck.getSlides().map((s) => s.id)).toEqual([id]);
    expect(ws.manifest().documents?.map((d) => d.src)).toEqual([`${id}.svg`]);
  });

  it("reorder permutes the slides view and .canvas.json", async () => {
    const ws = new FakeWorkspace({
      ".canvas.json": JSON.stringify({
        editor: "slides",
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

  it("removeSlide trashes the file and drops it from .canvas.json", async () => {
    const ws = new FakeWorkspace({
      ".canvas.json": JSON.stringify({
        editor: "slides",
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
      ".canvas.json": JSON.stringify({
        editor: "slides",
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
      ".canvas.json": JSON.stringify({
        editor: "slides",
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
      "decks/intro.canvas/.canvas.json": JSON.stringify({
        editor: "slides",
        documents: [{ src: "001.svg", id: "a" }],
      }),
      "decks/intro.canvas/001.svg": "<svg/>",
      "other/notes.txt": "x", // sibling content the deck must ignore
    });
    const deck = new CanvasDeck("w", ws, "decks/intro.canvas");
    await deck.load();
    expect(deck.getSlides().map((s) => s.src)).toEqual(["001.svg"]);

    const id = await deck.addSlide("<svg id='new'/>");
    await deck.flush();
    // The new slide file lands under the bundle dir, not the workspace root.
    expect(ws.files.has(`decks/intro.canvas/${id}.svg`)).toBe(true);
    expect(ws.files.has(`${id}.svg`)).toBe(false);
    // .canvas.json under the bundle dir; its `src` stays bundle-relative (portable).
    const manifest = JSON.parse(
      ws.files.get("decks/intro.canvas/.canvas.json")!
    ) as dotcanvas.Manifest;
    expect(manifest.documents?.map((d) => d.src)).toEqual([
      "001.svg",
      `${id}.svg`,
    ]);
  });
});
