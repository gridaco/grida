import { describe, expect, it } from "vitest";
import { dotcanvas } from "./index";

const { read, write, heal } = dotcanvas;

/** A trivial in-memory bundle. Satisfies the `WritableFs` port structurally. */
class MemFs implements dotcanvas.WritableFs {
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
  it("read a fixture bundle (.canvas.json + 001.svg/002.svg + thumbnail.png)", async () => {
    const fs = new MemFs({
      ".canvas.json": JSON.stringify({
        editor: "slides",
        documents: [
          { src: "001.svg" },
          { src: "002.svg", layout: { x: 10, y: 20, w: 1920, h: 1080, z: 1 } },
        ],
      }),
      "001.svg": "<svg/>",
      "002.svg": "<svg/>",
      "thumbnail.png": "PNG",
    });

    const c = await read(fs);
    expect(c.mode).toBe("declared");
    expect(c.editor).toBe("slides");
    expect(c.documents.map((d) => d.src)).toEqual(["001.svg", "002.svg"]);
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

  it("missing marker → implicit mode, no warning", async () => {
    const fs = new MemFs({ "001.svg": "<svg/>" });
    const c = await read(fs);
    expect(c.mode).toBe("implicit");
    expect(c.editor).toBe("unknown");
    expect(c.documents.map((d) => [d.src, d.origin])).toEqual([
      ["001.svg", "disk"],
    ]);
    expect(c.warnings).toEqual([]);
  });

  it("malformed .canvas.json → implicit mode + manifest_malformed", async () => {
    const fs = new MemFs({
      ".canvas.json": "{ not json",
      "001.svg": "<svg/>",
    });
    const c = await read(fs);
    expect(c.mode).toBe("implicit");
    expect(c.warnings[0].code).toBe("manifest_malformed");
    expect(c.warnings[0].path).toBe(".canvas.json");
    // Still degrades to a disk-derived deck.
    expect(c.documents.map((d) => d.src)).toEqual(["001.svg"]);
  });

  it(".canvas.json that is valid JSON but not an object → malformed", async () => {
    const fs = new MemFs({ ".canvas.json": "[1,2,3]" });
    const c = await read(fs);
    expect(c.mode).toBe("implicit");
    expect(c.warnings[0].code).toBe("manifest_malformed");
  });
});

describe("write", () => {
  it("write then read round-trips order + layout + ext", async () => {
    const manifest: dotcanvas.Manifest = {
      editor: "slides",
      documents: [{ src: "b.svg", layout: { x: 1, y: 2 } }, { src: "a.svg" }],
      ext: { vendor: { k: 1 } },
    };
    const fs = new MemFs({ "a.svg": "x", "b.svg": "y" });

    await write(fs, manifest);
    expect(fs.raw(".canvas.json")?.endsWith("\n")).toBe(true);

    const c = await read(fs);
    expect(c.documents.map((d) => d.src)).toEqual(["b.svg", "a.svg"]);
    expect(c.documents.every((d) => d.origin === "manifest")).toBe(true);
    expect(c.documents[0].layout).toEqual({ x: 1, y: 2 });
    expect(c.ext).toEqual({ vendor: { k: 1 } });
    expect(c.manifest).toEqual(manifest);
  });
});

describe("heal — self-heal through write/read", () => {
  it("write(fs, heal(parsed, entries)) is consistent with disk", async () => {
    // .canvas.json lists a missing slide and omits a real one; a vendor ext and
    // an unknown top-level field must survive the heal.
    const fs = new MemFs({
      ".canvas.json": JSON.stringify({
        editor: "slides",
        foo: "keep",
        documents: [
          { src: "a.svg", id: "n_a", name: "Intro" },
          { src: "gone.svg" },
        ],
        ext: { vendor: { k: 1 } },
      }),
      "a.svg": "<svg/>",
      "b.svg": "<svg/>", // disk-only → appended by heal
    });

    const before = await read(fs);
    await write(fs, heal(before.manifest, await fs.list()));

    const after = await read(fs);
    // .canvas.json now agrees with disk: missing dropped, disk-only appended.
    expect(after.documents.map((d) => d.src)).toEqual(["a.svg", "b.svg"]);
    expect(after.warnings).toEqual([]); // no more missing_src
    // Per-document, top-level, and ext data all survived the round-trip.
    expect(after.documents[0].meta?.name).toBe("Intro");
    expect(after.manifest?.foo).toBe("keep");
    expect(after.ext).toEqual({ vendor: { k: 1 } });
  });
});

describe("generic ext typing (R1)", () => {
  it("read<TExt> types ext; transforms preserve Manifest<TExt> through a chain", async () => {
    type MyExt = { vendor: { version: number } };

    const fs = new MemFs({
      ".canvas.json": JSON.stringify({
        documents: [{ src: "a.svg" }],
        ext: { vendor: { version: 3 } },
      }),
      "a.svg": "<svg/>",
    });

    // `read<MyExt>` types `ext` — these field accesses compile WITHOUT a cast,
    // which is the whole point (a typo in `MyExt` would fail `tsc`). The cast is
    // trusted, not validated (see `resolve` doc): the package owns the unsoundness.
    const c = await read<MyExt>(fs);
    const version: number = c.ext.vendor.version;
    expect(version).toBe(3);

    // The transforms thread `<MyExt>`: `m` stays `Manifest<MyExt>` across the
    // chain, so `m.ext.vendor.version` is still typed (no cast at the call site).
    let m: dotcanvas.Manifest<MyExt> = { ext: { vendor: { version: 1 } } };
    m = dotcanvas.add(m, { src: "b.svg" });
    m = dotcanvas.reorder(m, ["b.svg"]);
    const threaded: number | undefined = m.ext?.vendor.version;
    expect(threaded).toBe(1);
  });
});
