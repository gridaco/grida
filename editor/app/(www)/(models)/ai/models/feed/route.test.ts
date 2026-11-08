import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogueView } from "@/lib/gg/public-models/cache";
import { catalogueFixture } from "@/lib/gg/public-models/fixtures";
const reader = vi.hoisted(() => vi.fn<() => Promise<CatalogueView>>());
vi.mock("@/lib/gg/public-models/server", () => ({ readPublicModels: reader }));
import { GET } from "./route";
afterEach(() => reader.mockReset());

describe("public models page refresh", () => {
  it("returns the shared unfiltered view with no-store and no credential authority", async () => {
    reader.mockResolvedValue({
      state: "fresh",
      catalogue: catalogueFixture(),
      served_at: 1,
      validated_at: 1,
      refresh_at: 2,
      expires_at: 3,
    });
    const result = await GET(
      new Request("https://grida.co/ai/models/feed", {
        headers: { Authorization: "Bearer arbitrary", Cookie: "arbitrary=1" },
      })
    );
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(result.headers.has("set-cookie")).toBe(false);
    expect(reader).toHaveBeenCalledWith();
    expect((await result.json()).catalogue.data).toHaveLength(3);
  });
  it("does not forward query variants and does not turn an unavailable feed into an empty list", async () => {
    expect(
      (await GET(new Request("https://grida.co/ai/models/feed?q=anything")))
        .status
    ).toBe(400);
    expect(reader).not.toHaveBeenCalled();
    reader.mockResolvedValue({
      state: "unavailable",
      catalogue: null,
      served_at: 1,
      validated_at: null,
      refresh_at: 2,
      expires_at: 1,
    });
    const result = await GET(new Request("https://grida.co/ai/models/feed"));
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({
      state: "unavailable",
      catalogue: null,
    });
  });
});
