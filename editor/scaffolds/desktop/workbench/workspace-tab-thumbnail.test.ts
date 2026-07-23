import { describe, expect, it } from "vitest";
import { dotcanvas } from "dotcanvas";
import { WorkspaceTabThumbnail } from "./workspace-tab-thumbnail";

describe("WorkspaceTabThumbnail.canvasModel", () => {
  it("uses a bundle-local authored cover before a slide fallback", () => {
    const resolved = dotcanvas.resolve(
      {
        editor: "slides",
        thumbnail: "cover/hero.webp",
        documents: [{ src: "slides/001.svg" }],
      },
      ["cover/hero.webp", "slides/001.svg"]
    );

    expect(WorkspaceTabThumbnail.canvasModel(resolved)).toEqual({
      cover: "cover/hero.webp",
      fallback: { kind: "slide", src: "slides/001.svg" },
    });
  });

  it("rejects a thumbnail path that escapes the bundle", () => {
    const resolved = dotcanvas.resolve(
      {
        editor: "slides",
        thumbnail: "../outside.png",
        documents: [{ src: "001.svg" }],
      },
      ["001.svg"]
    );

    expect(WorkspaceTabThumbnail.canvasModel(resolved)).toEqual({
      cover: null,
      fallback: { kind: "slide", src: "001.svg" },
    });
  });

  it("derives a board overview when no cover exists", () => {
    const resolved = dotcanvas.resolve(
      {
        editor: "board",
        documents: [
          {
            id: "left",
            src: "left.png",
            layout: { x: -100, y: 20, w: 200, h: 100, z: 2 },
          },
          {
            id: "right",
            src: "right.png",
            layout: { x: 300, y: 120, w: 50, h: 80 },
          },
        ],
      },
      ["left.png", "right.png"]
    );

    const model = WorkspaceTabThumbnail.canvasModel(resolved);
    expect(model.cover).toBeNull();
    expect(model.fallback.kind).toBe("board");
    if (model.fallback.kind !== "board") return;
    expect(model.fallback.overview.bounds).toEqual({
      x: -100,
      y: 20,
      width: 450,
      height: 180,
    });
    expect(model.fallback.overview.frames[0]).toMatchObject({
      id: "left",
      width: 200,
      height: 100,
      z: 2,
    });
  });

  it("bounds pathological board previews and cascades unplaced frames", () => {
    const documents = Array.from({ length: 40 }, (_, index) => ({
      src: `${index}.png`,
      id: `${index}.png`,
      layout: null,
      exists: true as const,
      origin: "disk" as const,
    }));

    const overview = WorkspaceTabThumbnail.boardOverview(documents);
    expect(overview.frames).toHaveLength(12);
    expect(overview.omitted).toBe(28);
    expect(overview.frames[1]).toMatchObject({
      x: 40,
      y: 40,
      width: 320,
      height: 240,
    });
    // Bounds still describe every frame, including the 28 omitted from paint.
    expect(overview.bounds.width).toBe(1880);
    expect(overview.bounds.height).toBe(1800);
  });

  it("clamps extreme authored geometry before projecting it to CSS", () => {
    const overview = WorkspaceTabThumbnail.boardOverview([
      {
        src: "extreme.png",
        id: "extreme.png",
        layout: {
          x: Number.MAX_VALUE,
          y: -Number.MAX_VALUE,
          w: Number.MAX_VALUE,
          h: Number.MAX_VALUE,
          z: Number.MAX_VALUE,
        },
        exists: true,
        origin: "manifest",
      },
    ]);

    expect(overview.frames[0]).toMatchObject({
      x: 1_000_000,
      y: -1_000_000,
      width: 1_000_000,
      height: 1_000_000,
      z: 1_000_000,
    });
    expect(Object.values(overview.bounds).every(Number.isFinite)).toBe(true);
  });
});

describe("WorkspaceTabThumbnail.Cache", () => {
  it("deduplicates a recent load and reloads after bundle invalidation", async () => {
    const cache = new WorkspaceTabThumbnail.Cache(60_000);
    let calls = 0;
    const load = async (): Promise<WorkspaceTabThumbnail.CanvasModel> => {
      calls++;
      return { cover: null, fallback: { kind: "empty" } };
    };

    const first = cache.canvas("workspace", "deck.canvas", load);
    const second = cache.canvas("workspace", "deck.canvas", load);
    expect(second).toBe(first);
    await first;
    expect(calls).toBe(1);

    cache.invalidateBundle("workspace", "deck.canvas");
    await cache.canvas("workspace", "deck.canvas", load);
    expect(calls).toBe(2);
  });

  it("drops rejected work instead of caching a permanent failure", async () => {
    const cache = new WorkspaceTabThumbnail.Cache(60_000);
    let calls = 0;
    const load = async (): Promise<WorkspaceTabThumbnail.CanvasModel> => {
      calls++;
      if (calls === 1) throw new Error("transient");
      return { cover: null, fallback: { kind: "empty" } };
    };

    await expect(cache.canvas("w", "d.canvas", load)).rejects.toThrow(
      "transient"
    );
    await expect(cache.canvas("w", "d.canvas", load)).resolves.toEqual({
      cover: null,
      fallback: { kind: "empty" },
    });
    expect(calls).toBe(2);
  });

  it("invalidates a canvas model when any path inside its bundle changes", async () => {
    const cache = new WorkspaceTabThumbnail.Cache(60_000);
    let calls = 0;
    const load = async (): Promise<WorkspaceTabThumbnail.CanvasModel> => {
      calls++;
      return { cover: null, fallback: { kind: "empty" } };
    };

    await cache.canvas("w", "deck.canvas", load);
    cache.invalidateChangedPath("w", "deck.canvas/slides/001.svg");
    await cache.canvas("w", "deck.canvas", load);
    expect(calls).toBe(2);

    cache.invalidateChangedPath("other", "deck.canvas/slides/001.svg");
    await cache.canvas("w", "deck.canvas", load);
    expect(calls).toBe(2);
  });

  it("drops SVG projection work cancelled before its deferred start", async () => {
    const cache = new WorkspaceTabThumbnail.Cache();
    const calls: string[] = [];

    const first = cache.svgProjection(async () => {
      calls.push("first");
      return "first";
    });
    const skipped = cache.svgProjection(async () => {
      calls.push("skipped");
      return "skipped";
    });
    const latest = cache.svgProjection(async () => {
      calls.push("latest");
      return "latest";
    });
    first.cancel();

    expect(calls).toEqual([]);
    await expect(first.promise).resolves.toBeNull();
    await expect(skipped.promise).resolves.toBeNull();

    await expect(latest.promise).resolves.toBe("latest");
    expect(calls).toEqual(["latest"]);
  });

  it("serializes an active SVG projection and keeps only the latest waiter", async () => {
    const cache = new WorkspaceTabThumbnail.Cache();
    const calls: string[] = [];
    let finishFirst!: (value: string) => void;

    const first = cache.svgProjection(
      () =>
        new Promise<string>((resolve) => {
          calls.push("first");
          finishFirst = resolve;
        })
    );
    await Promise.resolve();
    expect(calls).toEqual(["first"]);

    const skipped = cache.svgProjection(async () => {
      calls.push("skipped");
      return "skipped";
    });
    const latest = cache.svgProjection(async () => {
      calls.push("latest");
      return "latest";
    });
    first.cancel();

    await expect(first.promise).resolves.toBeNull();
    await expect(skipped.promise).resolves.toBeNull();
    expect(calls).toEqual(["first"]);

    finishFirst("first");
    await expect(latest.promise).resolves.toBe("latest");
    expect(calls).toEqual(["first", "latest"]);
  });
});
