// GG product video submission; no provider keys or native receipt charging.
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { ProductBillingError } from "@/lib/platform/product-billing";
const h = vi.hoisted(() => ({
  fetch:
    vi.fn<
      (
        ctx: unknown,
        path: string,
        init: { body: string },
        identity: string
      ) => Promise<Response>
    >(),
  wait: vi.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>(),
  download: vi.fn<(...args: unknown[]) => Promise<{ data: Uint8Array }>>(),
  begin: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  complete: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  entitlement: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock("../gateway-product", async (original) => ({
  ...(await original<typeof import("../gateway-product")>()),
  gatewayFetch: h.fetch,
  gatewayWait: h.wait,
}));
vi.mock("../gg-three-d-http", () => ({
  GgThreeDHttp: {
    productAssets: () => ({ downloadProviderAsset: h.download }),
  },
}));
vi.mock("@/lib/platform/product-consumer", () => ({
  platformProductBilling: () => h,
}));
vi.mock("@/lib/supabase/server", () => ({
  createLibraryClient: vi.fn<(...args: never[]) => unknown>(),
}));
vi.mock("@/lib/auth/organization", () => ({
  requireOrganizationId: vi.fn<(...args: never[]) => unknown>(),
}));
import { methods, InvalidAiRequestError } from "../server";
beforeEach(() => {
  vi.clearAllMocks();
  h.fetch.mockResolvedValue(Response.json({ id: "req_video" }));
  h.wait.mockResolvedValue({
    id: "req_video",
    result: {
      videos: [{ url: "https://fal.media/video.mp4", media_type: "video/mp4" }],
    },
  });
  h.download.mockResolvedValue({ data: Uint8Array.of(1, 2, 3) });
});
afterEach(() => vi.restoreAllMocks());
describe("GG product video", () => {
  it("submits one original job, retrieves its result and leaves all charging to GG", async () => {
    const result = await methods.generateVideo(7, {
      model_id: "google/veo-3.1",
      prompt: "an ocean",
    });
    expect(result).toEqual({
      model_id: "google/veo-3.1",
      provider_id: "gg",
      videos: [{ base64: "AQID", media_type: "video/mp4" }],
    });
    expect(h.fetch).toHaveBeenCalledTimes(1);
    const [ctx, path, init, identity] = h.fetch.mock.calls[0];
    expect(ctx).toMatchObject({ organizationId: 7 });
    expect(path).toBe("/v1/videos");
    expect(identity).toBeTypeOf("string");
    expect(JSON.parse(init.body)).toMatchObject({
      model: "google/veo-3.1",
      providerOptions: { gg: { resolutionTier: "1080p" } },
    });
    expect(h.wait).toHaveBeenCalledWith(ctx, "req_video");
    expect(h.begin).not.toHaveBeenCalled();
    expect(h.complete).not.toHaveBeenCalled();
  });
  it("preserves explicit resolution through the declared GG tier selector", async () => {
    await methods.generateVideo(7, {
      model_id: "google/veo-3.1",
      prompt: "ocean",
      resolution: "1920x1080",
    });
    expect(JSON.parse(h.fetch.mock.calls[0][2].body)).toMatchObject({
      providerOptions: { gg: { resolutionTier: "1080p" } },
    });
  });
  it.each([
    { model_id: "unknown/model" },
    { model_id: "google/veo-3.1", aspect_ratio: "1:1" },
    { model_id: "google/veo-3.1", duration: 1000 },
    { model_id: "google/veo-3.1", image_url: "https://example.test/a.png" },
    { model_id: "google/veo-3.1", fps: 30 },
  ])("rejects unsupported native input before submission %j", async (input) => {
    await expect(
      methods.generateVideo(7, { prompt: "ocean", ...input } as never)
    ).rejects.toBeInstanceOf(InvalidAiRequestError);
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("does not retrieve or redispatch when shared-credit admission fails", async () => {
    h.fetch.mockRejectedValue(new ProductBillingError("blocked"));
    await expect(
      methods.generateVideo(7, { model_id: "google/veo-3.1", prompt: "ocean" })
    ).rejects.toMatchObject({ status: 402 });
    expect(h.wait).not.toHaveBeenCalled();
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.complete).not.toHaveBeenCalled();
  });
  it("failed product download cannot trigger a new generation or native charge", async () => {
    h.download.mockRejectedValue(new Error("asset unavailable"));
    await expect(
      methods.generateVideo(7, { model_id: "google/veo-3.1", prompt: "ocean" })
    ).rejects.toThrow("Do not repeat accepted work");
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.complete).not.toHaveBeenCalled();
  });
});
