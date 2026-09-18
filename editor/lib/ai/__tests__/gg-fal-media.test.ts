// GRIDA-EE: billing — organization-funded media and actual provider charges.
// GRIDA-GG: gateway — synthetic provider responses through the real SDK and billing seam.
// GRIDA-SEC-003 / GRIDA-SEC-006 — no live credentials, requests, or billing calls.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderHttp } from "@grida/ai";

const transport = vi.hoisted(() => ({
  create: vi.fn<(key: string) => ProviderHttp>(),
  request: vi.fn<typeof fetch>(),
  download: vi.fn<typeof fetch>(),
}));
vi.mock("../gg-fal-http", () => ({
  GgFalHttp: { create: transport.create },
}));
vi.mock("replicate", () => ({ default: class {} }));
vi.mock("@/lib/billing/metronome", () => ({
  getEntitlement: vi.fn<(...args: never[]) => unknown>(),
  ingestUsageEvent: vi.fn<(...args: never[]) => unknown>(),
  refreshBalance: vi.fn<(...args: never[]) => unknown>(),
  BillingMetronomeError: class extends Error {
    constructor(
      message: string,
      readonly code: string,
      readonly status = 500
    ) {
      super(message);
    }
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createLibraryClient: vi.fn<(...args: never[]) => unknown>(),
}));
vi.mock("@/lib/auth/organization", () => ({
  requireOrganizationId: vi.fn<(...args: never[]) => unknown>(),
}));
import { getEntitlement, ingestUsageEvent } from "@/lib/billing/metronome";
import { requireOrganizationId } from "@/lib/auth/organization";
import { GgFalMedia } from "../gg-fal-media";
import { methods } from "../server";

const model = "openai/gpt-image-2.5-flare";
const endpoint = "openai/gpt-image-2.5/flare/text-to-image";
const png = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
  0, 0, 1, 8, 6, 0, 0, 0,
]);
// A minimal ISO base-media header lets the SDK exercise its real video download path.
const mp4 = Uint8Array.from([
  0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50, 0, 0, 0, 0, 109, 112, 52,
  50, 105, 115, 111, 109,
]);
let video = false;
const submitted: { endpoint: string; input: Record<string, unknown> }[] = [];
let price = 0.0271;
let posts = 0;
let missing = false;
let billingDenied = false;
let resultInvalid = false;
let failSecond = false;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("GG_FAL_KEY", "synthetic:inference-key");
  vi.stubEnv("GG_FAL_ADMIN_KEY", "synthetic:admin-key");
  vi.stubEnv("FAL_KEY", "synthetic-unprefixed-key-never-used");
  price = 0.0271;
  posts = 0;
  missing = false;
  billingDenied = false;
  resultInvalid = false;
  failSecond = false;
  video = false;
  submitted.length = 0;
  vi.mocked(getEntitlement).mockResolvedValue({
    allowed: true,
    cachedBalanceCents: 10000,
    cachedAt: null,
  });
  vi.mocked(ingestUsageEvent).mockResolvedValue({
    transactionId: "synthetic-ingest",
  });
  transport.create.mockImplementation(
    () =>
      new ProviderHttp({
        request: transport.request,
        download: transport.download,
      })
  );
  transport.download.mockImplementation(
    async () =>
      new Response(video ? mp4 : png, {
        headers: { "content-type": video ? "video/mp4" : "image/png" },
      })
  );
  transport.request.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    if (url.hostname === "api.fal.ai") {
      expect(headers.get("authorization")).toBe("Key synthetic:admin-key");
      if (billingDenied) return new Response(null, { status: 403 });
      const request = url.searchParams.get("request_id");
      return Response.json({
        billing_events:
          request === "grida-billing-preflight" || missing
            ? []
            : [
                {
                  request_id: request,
                  endpoint_id: url.searchParams.get("endpoint_id"),
                  cost_total: price,
                },
              ],
        has_more: false,
        next_cursor: null,
      });
    }
    expect(headers.get("authorization")).toBe("Key synthetic:inference-key");
    const prefix = url.pathname.split("/").slice(1, 3).join("/");
    if (init?.method === "POST") {
      posts++;
      submitted.push({
        endpoint: url.pathname.slice(1),
        input: JSON.parse(String(init.body)),
      });
      if (failSecond && posts === 2) return new Response(null, { status: 500 });
      return Response.json({
        request_id: `job-${posts}`,
        status_url: `https://queue.fal.run/${prefix}/requests/job-${posts}/status`,
        response_url: `https://queue.fal.run/${prefix}/requests/job-${posts}`,
      });
    }
    if (url.pathname.endsWith("/status"))
      return Response.json({ status: "COMPLETED" });
    if (resultInvalid) return Response.json({ invalid: true });
    if (video)
      return Response.json({
        video: {
          url: "https://v3.fal.media/video.mp4",
          content_type: "video/mp4",
        },
      });
    return Response.json({
      images: [
        { url: "https://v3.fal.media/image.png", content_type: "image/png" },
      ],
    });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function generate() {
  return GgFalMedia.image(7, model, endpoint, { prompt: "chair" });
}
function charged(mills: number) {
  expect(ingestUsageEvent).toHaveBeenCalledExactlyOnceWith(7, mills, {
    transactionId: expect.any(String),
  });
  expect(requireOrganizationId).not.toHaveBeenCalled();
}
describe("GG fal actual-charge execution", () => {
  it("gates before all provider work and never accepts a caller organization substitute", async () => {
    vi.mocked(getEntitlement).mockResolvedValue({
      allowed: false,
      reason: "no_balance",
      cachedBalanceCents: 0,
      cachedAt: null,
    });
    await expect(generate()).rejects.toMatchObject({ status: 402 });
    expect(transport.create).not.toHaveBeenCalled();
    await expect(
      GgFalMedia.image(0, model, endpoint, { prompt: "chair" })
    ).rejects.toMatchObject({ code: "missing_organization_id" });
    expect(transport.request).not.toHaveBeenCalled();
  });
  it.each(["GG_FAL_KEY", "GG_FAL_ADMIN_KEY"])(
    "requires %s despite unprefixed keys",
    async (name) => {
      vi.stubEnv(name, "");
      await expect(generate()).rejects.toMatchObject({
        code: "provider_unavailable",
      });
      expect(posts).toBe(0);
    }
  );
  it("checks billing authority before submitting paid work", async () => {
    billingDenied = true;
    await expect(generate()).rejects.toMatchObject({
      code: "provider_unavailable",
    });
    expect(posts).toBe(0);
    expect(ingestUsageEvent).not.toHaveBeenCalled();
  });
  it.each([0, 0.0271, 0.29])(
    "uses the actual request charge %s, including true zero",
    async (cost) => {
      price = cost;
      const result = await generate();
      expect(result.images).toEqual([{ data: png, media_type: "image/png" }]);
      expect(posts).toBe(1);
      charged(Math.ceil(Math.round(cost * 1e9) / 1e6));
    }
  );
  it("ingests a paid completion even if its image download fails; never resubmits", async () => {
    transport.download.mockRejectedValue(new Error("secret-signed-url"));
    const error = await generate().catch((error) => error);
    expect(error).toMatchObject({
      code: "generation_failed",
      task_id: "job-1",
    });
    expect(String(error)).not.toContain("secret");
    charged(28);
    expect(posts).toBe(1);
  });
  it("settles completed first batches even if the next submission fails", async () => {
    failSecond = true;
    await expect(
      GgFalMedia.image(7, "bfl/flux-2-pro", "fal-ai/flux-2-pro", {
        prompt: "chair",
        n: 2,
      })
    ).rejects.toMatchObject({ code: "generation_failed" });
    charged(28);
    expect(posts).toBe(2);
  });
  it("rounds total actual charges once for multiple single-image jobs", async () => {
    price = 0.0004;
    await GgFalMedia.image(7, "bfl/flux-2-pro", "fal-ai/flux-2-pro", {
      prompt: "chair",
      n: 2,
    });
    charged(1);
    expect(posts).toBe(2);
  });
  it("does not fabricate zero or estimated usage when receipts never arrive", async () => {
    vi.useFakeTimers();
    missing = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = generate().catch((error) => error);
    await vi.advanceTimersByTimeAsync(22_000);
    expect(await result).toMatchObject({
      code: "usage_unavailable",
      task_id: "job-1",
    });
    expect(ingestUsageEvent).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "[gg-fal-media] usage_reconciliation_required",
      expect.objectContaining({ organizationId: 7, task_id: "job-1" })
    );
    expect(posts).toBe(1);
  });
});

describe("server hosted media selection", () => {
  it("serves exact image dimensions with a redundant ratio through fal", async () => {
    const result = await methods.generateImage(7, {
      model_id: model,
      prompt: "chair",
      width: 1024,
      height: 1024,
      aspect_ratio: "1:1",
      quality: "high",
      background: "transparent",
    });
    expect(result).toMatchObject({ model_id: model, provider_id: "fal" });
    expect(result.images).toEqual([
      { base64: Buffer.from(png).toString("base64"), media_type: "image/png" },
    ]);
    expect(submitted).toEqual([
      {
        endpoint,
        input: {
          prompt: "chair",
          num_images: 1,
          image_size: { width: 1024, height: 1024 },
          quality: "high",
          background: "transparent",
          output_format: "png",
        },
      },
    ]);
    charged(28);
  });

  it.each([
    [
      "google/gemini-omni-1.1-flash",
      "google/gemini-omni-flash/v1.1/text-to-video",
      8,
    ],
    ["bytedance/seedance-2.0", "bytedance/seedance-2.0/text-to-video", "5"],
    ["bytedance/seedance-2.5", "bytedance/seedance-2.5/text-to-video", "5"],
  ])(
    "serves fal-only %s without a Vercel binding",
    async (model_id, endpoint, duration) => {
      video = true;
      const result = await methods.generateVideo(7, {
        model_id: String(model_id),
        prompt: "a moving chair",
      });
      expect(result).toEqual({
        model_id,
        provider_id: "fal",
        videos: [
          {
            base64: Buffer.from(mp4).toString("base64"),
            media_type: "video/mp4",
          },
        ],
      });
      expect(submitted).toEqual([
        {
          endpoint,
          input: {
            prompt: "a moving chair",
            aspect_ratio: "16:9",
            resolution: "720p",
            duration,
          },
        },
      ]);
      charged(28);
    }
  );

  it.each([
    ["google/veo-3.1", "fal-ai/veo3.1", "8s"],
    ["alibaba/wan-3.0", "alibaba/wan-3.0/text-to-video", 5],
  ])(
    "preserves the 1080p Grida default for %s in portrait output",
    async (model_id, endpoint, duration) => {
      video = true;
      const result = await methods.generateVideo(7, {
        model_id: String(model_id),
        prompt: "a moving chair",
        aspect_ratio: "9:16",
      });
      expect(result.provider_id).toBe("fal");
      expect(submitted).toEqual([
        {
          endpoint,
          input: {
            prompt: "a moving chair",
            aspect_ratio: "9:16",
            resolution: "1080p",
            duration,
          },
        },
      ]);
      charged(28);
    }
  );
  it.each([
    {
      model_id: "openai/gpt-image-2.5-flare",
      width: 1024,
      height: 1024,
      aspect_ratio: "16:9",
    },
    { model_id: "openai/gpt-image-2.5-flare", aspect_ratio: "99999:1" },
    { model_id: "bfl/flux-2-pro", aspect_ratio: "99999:1" },
    { model_id: "openai/gpt-image-2.5-flare", width: 999999, height: 999999 },
    { model_id: "bfl/flux-2-pro", width: 999999, height: 999999 },
    { model_id: "google/gemini-3-pro-image", width: 999999, height: 999999 },
    { model_id: "openai/gpt-image-2.5-flare", width: 0, height: 1024 },
    { model_id: "openai/gpt-image-2.5-flare", n: 5 },
  ])(
    "never moves invalid image inputs to a paid compatibility route: %j",
    async (input) => {
      await expect(
        methods.generateImage(7, { prompt: "chair", ...input })
      ).rejects.toMatchObject({ code: "invalid_request" });
      expect(transport.request).not.toHaveBeenCalled();
      expect(ingestUsageEvent).not.toHaveBeenCalled();
    }
  );
  it("does not switch providers after a fal operation has been submitted", async () => {
    transport.download.mockRejectedValue(
      new Error("synthetic-download-failure")
    );
    await expect(
      methods.generateImage(7, { model_id: model, prompt: "chair" })
    ).rejects.toMatchObject({ code: "generation_failed", task_id: "job-1" });
    expect(posts).toBe(1);
    charged(28);
  });
});
