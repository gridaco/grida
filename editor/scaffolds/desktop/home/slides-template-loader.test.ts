import { afterEach, describe, expect, it, vi } from "vitest";

describe("loadSlidesTemplates", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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

    const { loadSlidesTemplates } = await import("./slides-template-loader");

    await expect(loadSlidesTemplates()).rejects.toThrow(
      "/templates/slides/index.json: 503"
    );
    await expect(loadSlidesTemplates()).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
