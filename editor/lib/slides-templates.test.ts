import { afterEach, describe, expect, it, vi } from "vitest";
import { zipSync } from "fflate";

describe("SlidesTemplates", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("clears a rejected index load so a later call can retry", async () => {
    const fetch = vi.fn<() => Promise<Response>>();
    fetch
      .mockResolvedValueOnce(
        new Response("missing", { status: 503, statusText: "Unavailable" })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    vi.stubGlobal("fetch", fetch);

    const { SlidesTemplates } = await import("./slides-templates");

    await expect(SlidesTemplates.loadAll()).rejects.toThrow(
      "/templates/slides/index.json: 503"
    );
    await expect(SlidesTemplates.loadAll()).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("loads a named dotcanvas bundle and exposes page SVG text", async () => {
    const enc = new TextEncoder();
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><title>Cover</title></svg>';
    const zip = zipSync({
      ".canvas.json": enc.encode(
        JSON.stringify({
          version: "1",
          editor: "slides",
          documents: [{ src: "001.svg", id: "cover", name: "Cover" }],
          ext: {
            "co.grida.templates": {
              title: "Custom",
              system: "test",
              activeId: "cover",
            },
          },
        })
      ),
      "001.svg": enc.encode(svg),
    });

    const fetch = vi.fn<(url: string) => Promise<Response>>((url: string) => {
      expect(url).toBe("/templates/slides/custom.canvas.zip");
      return Promise.resolve(
        new Response(zip.slice(), {
          status: 200,
          headers: { "content-type": "application/zip" },
        })
      );
    });
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:template");

    const { SlidesTemplates } = await import("./slides-templates");
    const template = await SlidesTemplates.load("custom");

    expect(template.name).toBe("custom.canvas");
    expect(template.title).toBe("Custom");
    expect(template.system).toBe("test");
    expect(template.activeId).toBe("cover");
    expect(template.pages).toEqual([
      {
        id: "cover",
        name: "Cover",
        text: svg,
        url: "blob:template",
      },
    ]);
    expect(template.files.map((f) => f.path).sort()).toEqual([
      ".canvas.json",
      "001.svg",
    ]);
  });
});
