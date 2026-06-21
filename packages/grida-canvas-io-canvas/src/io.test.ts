import { describe, expect, it } from "vitest";
import { iocanvas } from "./index";

const { read, write } = iocanvas;

/** A trivial in-memory bundle. Satisfies the `WritableFs` port structurally. */
class MemFs implements iocanvas.WritableFs {
  private readonly files: Map<string, string>;
  constructor(init: Record<string, string> = {}) {
    this.files = new Map(Object.entries(init));
  }
  async list(): Promise<string[]> {
    return [...this.files.keys()];
  }
  async read(path: string): Promise<string | null> {
    return this.files.has(path) ? this.files.get(path)! : null;
  }
  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
  raw(path: string): string | undefined {
    return this.files.get(path);
  }
}

describe("read", () => {
  it("read a fixture bundle (canvas.json + 000.svg/001.svg + thumbnail.png)", async () => {
    const fs = new MemFs({
      "canvas.json": JSON.stringify({
        type: "svg-slides",
        documents: [
          { src: "000.svg" },
          { src: "001.svg", layout: { x: 10, y: 20, w: 1920, h: 1080, z: 1 } },
        ],
      }),
      "000.svg": "<svg/>",
      "001.svg": "<svg/>",
      "thumbnail.png": "PNG",
    });

    const c = await read(fs);
    expect(c.mode).toBe("declared");
    expect(c.type).toBe("svg-slides");
    expect(c.documents.map((d) => d.src)).toEqual(["000.svg", "001.svg"]);
    expect(c.documents.every((d) => d.origin === "manifest")).toBe(true);
    expect(c.documents[1].layout).toEqual({
      x: 10,
      y: 20,
      w: 1920,
      h: 1080,
      z: 1,
    });
    expect(c.thumbnail).toBe("thumbnail.png");
    expect(c.warnings).toEqual([]);
  });

  it("missing canvas.json → implicit mode, no warning", async () => {
    const fs = new MemFs({ "000.svg": "<svg/>" });
    const c = await read(fs);
    expect(c.mode).toBe("implicit");
    expect(c.type).toBe("unknown");
    expect(c.documents.map((d) => [d.src, d.origin])).toEqual([
      ["000.svg", "disk"],
    ]);
    expect(c.warnings).toEqual([]);
  });

  it("malformed canvas.json → implicit mode + manifest_malformed", async () => {
    const fs = new MemFs({ "canvas.json": "{ not json", "000.svg": "<svg/>" });
    const c = await read(fs);
    expect(c.mode).toBe("implicit");
    expect(c.warnings[0].code).toBe("manifest_malformed");
    // Still degrades to a disk-derived deck.
    expect(c.documents.map((d) => d.src)).toEqual(["000.svg"]);
  });

  it("canvas.json that is valid JSON but not an object → malformed", async () => {
    const fs = new MemFs({ "canvas.json": "[1,2,3]" });
    const c = await read(fs);
    expect(c.mode).toBe("implicit");
    expect(c.warnings[0].code).toBe("manifest_malformed");
  });
});

describe("write", () => {
  it("write then read round-trips order + layout + ext", async () => {
    const manifest: iocanvas.Manifest = {
      type: "svg-slides",
      documents: [{ src: "b.svg", layout: { x: 1, y: 2 } }, { src: "a.svg" }],
      ext: { vendor: { k: 1 } },
    };
    const fs = new MemFs({ "a.svg": "x", "b.svg": "y" });

    await write(fs, manifest);
    expect(fs.raw("canvas.json")?.endsWith("\n")).toBe(true);

    const c = await read(fs);
    expect(c.documents.map((d) => d.src)).toEqual(["b.svg", "a.svg"]);
    expect(c.documents.every((d) => d.origin === "manifest")).toBe(true);
    expect(c.documents[0].layout).toEqual({ x: 1, y: 2 });
    expect(c.ext).toEqual({ vendor: { k: 1 } });
    expect(c.manifest).toEqual(manifest);
  });
});
