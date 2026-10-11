// GRIDA-EE: billing — see ee-billing
/**
 * `methods.generateVideo` — hosted video through the seam.
 *
 * Pins: request validation (unknown/unlisted model, aspect, duration
 * bounds, resolution label mapping, unpriced (label,mode) pairs,
 * image_url shape), pre-priced billing (rate × duration, gate BEFORE
 * the provider call, ingest with the exact mills), and the base64
 * result contract. Expected mills are computed from the REAL catalog
 * card so price updates don't rot the test.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProductBillingError } from "@/lib/platform/product-billing";
import { catalog as ai_models } from "@grida/ai-models/grida";

const billing = vi.hoisted(() => ({
  entitlement: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  begin: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  complete: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock("@/lib/platform/product-consumer", () => ({
  platformProductBilling: () => billing,
}));
vi.mock("@/lib/supabase/server", () => ({
  createLibraryClient: vi.fn<(...args: never[]) => unknown>(),
}));
vi.mock("@/lib/auth/organization", () => ({
  requireOrganizationId: vi.fn<(...args: never[]) => unknown>(),
}));
vi.mock("ai", async (orig) => ({
  ...(await orig<typeof import("ai")>()),
  experimental_generateVideo: vi.fn<(...args: never[]) => unknown>(),
}));

import { experimental_generateVideo } from "ai";
import { methods, InvalidAiRequestError } from "../server";
import ai from "@/lib/ai";

const mockedGenerate = vi.mocked(experimental_generateVideo);
const mockedGetEntitlement = billing.entitlement;
const mockedCompletion = billing.complete;

const MODEL_ID = "google/veo-3.1";
const CARD = ai_models.video.models[MODEL_ID]!;
const BINDING = ai_models.video.binding(CARD, "vercel")!;

const ORG = 7;

function stubGeneration() {
  mockedGenerate.mockResolvedValue({
    video: { base64: "AAAA", mediaType: "video/mp4" },
    videos: [{ base64: "AAAA", mediaType: "video/mp4" }],
    warnings: [],
    responses: [],
    providerMetadata: {},
  } as never);
}

beforeEach(() => {
  billing.begin.mockReset();
  billing.begin.mockImplementation(async (context) => {
    const decision = (await billing.entitlement(
      (context as { organizationId: number }).organizationId
    )) as { allowed: boolean };
    if (!decision.allowed) throw new ProductBillingError("blocked");
    return { id: "execution-synthetic", claim: {} };
  });
  mockedGenerate.mockReset();
  mockedGetEntitlement.mockReset();
  mockedCompletion.mockReset();
  mockedGetEntitlement.mockResolvedValue({
    allowed: true,
    cachedBalanceCents: 500,
    cachedAt: null,
  } as never);
  mockedCompletion.mockResolvedValue(undefined);
  stubGeneration();
});

describe("methods.generateVideo", () => {
  it("happy path: gates, generates via the Vercel AI Gateway binding, records completion for rate×duration", async () => {
    const duration = CARD.default.duration;
    const result = await methods.generateVideo(ORG, {
      model_id: MODEL_ID,
      prompt: "a calm ocean",
    });

    expect(result).toEqual({
      model_id: MODEL_ID,
      provider_id: "vercel",
      videos: [{ base64: "AAAA", media_type: "video/mp4" }],
    });
    expect(mockedGetEntitlement).toHaveBeenCalledWith(ORG);

    const mode = CARD.default.audio ? "audio" : "silent";
    const rate =
      BINDING.pricing.usd_per_second[CARD.default.resolution]![mode]!;
    const expectedMills = ai.toMills(rate * duration);
    expect(mockedCompletion).toHaveBeenCalledTimes(1);
    expect(mockedCompletion.mock.calls[0]![0]).toEqual({
      id: "execution-synthetic",
      claim: {},
    });
    expect(mockedCompletion.mock.calls[0]![1]).toBe(expectedMills);
    expect(billing.begin).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        organizationId: ORG,
        requestDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
    );
    expect(billing.begin.mock.invocationCallOrder[0]).toBeLessThan(
      mockedGenerate.mock.invocationCallOrder[0]!
    );
    expect(mockedGenerate.mock.invocationCallOrder[0]!).toBeLessThan(
      mockedCompletion.mock.invocationCallOrder[0]
    );
    expect(mockedCompletion.mock.calls[0]![2]).toMatchObject({
      costMills: expectedMills,
    });

    const args = mockedGenerate.mock.calls[0]![0] as {
      prompt: unknown;
      duration: number;
    };
    expect(args.prompt).toBe("a calm ocean");
    expect(args.duration).toBe(duration);
  });

  it("maps an explicit {width}x{height} resolution to the pricing label", async () => {
    await methods.generateVideo(ORG, {
      model_id: MODEL_ID,
      prompt: "x",
      resolution: "1280x720",
    });
    const mode = CARD.default.audio ? "audio" : "silent";
    const rate = BINDING.pricing.usd_per_second["720p"]![mode]!;
    expect(mockedCompletion.mock.calls[0]![1]).toBe(
      ai.toMills(rate * CARD.default.duration)
    );
  });

  it("rejects unknown models, bad aspect ratios, and out-of-bounds durations", async () => {
    await expect(
      methods.generateVideo(ORG, { model_id: "nope/none", prompt: "x" })
    ).rejects.toBeInstanceOf(InvalidAiRequestError);
    await expect(
      methods.generateVideo(ORG, {
        model_id: MODEL_ID,
        prompt: "x",
        aspect_ratio: "7:3",
      })
    ).rejects.toBeInstanceOf(InvalidAiRequestError);
    await expect(
      methods.generateVideo(ORG, {
        model_id: MODEL_ID,
        prompt: "x",
        duration: CARD.max_duration + 1,
      })
    ).rejects.toBeInstanceOf(InvalidAiRequestError);
    await expect(
      methods.generateVideo(ORG, {
        model_id: MODEL_ID,
        prompt: "x",
        resolution: "999x111",
      })
    ).rejects.toBeInstanceOf(InvalidAiRequestError);
    expect(mockedGenerate).not.toHaveBeenCalled();
    expect(mockedCompletion).not.toHaveBeenCalled();
  });

  it("rejects image-to-video (t2v-only v1 — no server-side URL fetch)", async () => {
    await expect(
      methods.generateVideo(ORG, {
        model_id: MODEL_ID,
        prompt: "x",
        image_url: "https://example.com/frame.png",
      })
    ).rejects.toBeInstanceOf(InvalidAiRequestError);
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("does not dispatch or complete when durable admission fails", async () => {
    billing.begin.mockRejectedValueOnce(new ProductBillingError());
    await expect(
      methods.generateVideo(ORG, { model_id: MODEL_ID, prompt: "x" })
    ).rejects.toMatchObject({ code: "billing_unavailable" });
    expect(billing.begin).toHaveBeenCalledTimes(1);
    expect(mockedGenerate).not.toHaveBeenCalled();
    expect(mockedCompletion).not.toHaveBeenCalled();
  });

  it("blocked orgs never reach the provider", async () => {
    mockedGetEntitlement.mockResolvedValue({
      allowed: false,
      reason: "below_floor",
      cachedBalanceCents: 5,
      cachedAt: null,
    } as never);
    await expect(
      methods.generateVideo(ORG, { model_id: MODEL_ID, prompt: "x" })
    ).rejects.toMatchObject({ code: "blocked" });
    expect(billing.complete).not.toHaveBeenCalled();
    expect(mockedGenerate).not.toHaveBeenCalled();
  });
});
