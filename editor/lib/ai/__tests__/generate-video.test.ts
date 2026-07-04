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
import { models as ai_models } from "@grida/ai-models";

vi.mock("@/lib/billing/metronome", () => ({
  getEntitlement: vi.fn<(...args: never[]) => unknown>(),
  ingestUsageEvent: vi.fn<(...args: never[]) => unknown>(),
  refreshBalance: vi.fn<(...args: never[]) => unknown>(),
  BillingMetronomeError: class BillingMetronomeError extends Error {
    code: string;
    status: number;
    constructor(message: string, code: string, status = 500) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
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
import { getEntitlement, ingestUsageEvent } from "@/lib/billing/metronome";
import { methods, InvalidAiRequestError } from "../server";
import ai from "@/lib/ai";

const mockedGenerate = vi.mocked(experimental_generateVideo);
const mockedGetEntitlement = vi.mocked(getEntitlement);
const mockedIngest = vi.mocked(ingestUsageEvent);

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
  mockedGenerate.mockReset();
  mockedGetEntitlement.mockReset();
  mockedIngest.mockReset();
  mockedGetEntitlement.mockResolvedValue({
    allowed: true,
    cachedBalanceCents: 500,
    cachedAt: null,
  } as never);
  mockedIngest.mockResolvedValue({ transactionId: "tx" } as never);
  stubGeneration();
});

describe("methods.generateVideo", () => {
  it("happy path: gates, generates via the vercel binding, ingests rate×duration", async () => {
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
    expect(mockedIngest).toHaveBeenCalledTimes(1);
    expect(mockedIngest.mock.calls[0]![0]).toBe(ORG);
    expect(mockedIngest.mock.calls[0]![1]).toBe(expectedMills);

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
    expect(mockedIngest.mock.calls[0]![1]).toBe(
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
    expect(mockedIngest).not.toHaveBeenCalled();
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
    expect(mockedGenerate).not.toHaveBeenCalled();
  });
});
