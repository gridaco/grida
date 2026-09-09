// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
/**
 * POST /api/v1/ai/images/generations — token-gated hosted image
 * generation through the REAL image billing middleware (fake gateway
 * model): pre-priced mills reach ingest, blocked orgs 402 before the
 * provider, unknown/unbound models 404, base64 results in the shared
 * protocol shape, and NO library upload (the daemon owns persistence).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Rate limits are pinned by their own module; route tests must NEVER
// reach the real Upstash instance (vitest loads .env.local).
vi.mock("@/lib/ai/openai-compat/limits", () => ({
  allowAiRequest: async () => ({ success: true }),
}));

const h = vi.hoisted(() => ({
  imageCalls: 0,
  lastOptions: null as unknown,
  reportedCost: undefined as unknown,
}));

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
  service_role: {},
}));
vi.mock("@/lib/auth/organization", () => ({
  requireOrganizationId: vi.fn<(...args: never[]) => unknown>(),
}));

// One transparent grayscale+alpha pixel; the response must preserve its bytes.
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

vi.mock("@/lib/ai/models", async (orig) => {
  const real = await orig<typeof import("@/lib/ai/models")>();
  return {
    ...real,
    byok: null,
    isByokActive: () => false,
    gateway: {
      languageModel: () => {
        throw new Error("unused");
      },
      imageModel: (modelId: string) => ({
        specificationVersion: "v3" as const,
        provider: "fake-gateway",
        modelId,
        maxImagesPerCall: 4,
        doGenerate: async (options: unknown) => {
          h.imageCalls += 1;
          h.lastOptions = options;
          return {
            images: [PNG_B64],
            warnings: [],
            providerMetadata: { gateway: { cost: h.reportedCost } },
            response: {
              timestamp: new Date(),
              modelId,
              headers: {},
            },
          };
        },
      }),
      textEmbeddingModel: () => {
        throw new Error("unused");
      },
    },
  };
});

import { POST } from "./route";
import { getEntitlement, ingestUsageEvent } from "@/lib/billing/metronome";
import { signGgToken } from "@/lib/auth/gg-token";
import { computeImageCostMills } from "@/lib/ai/image-cost";
import ai from "@/lib/ai";

const mockedGetEntitlement = vi.mocked(getEntitlement);
const mockedIngest = vi.mocked(ingestUsageEvent);

const SECRET = "images-secret-0123456789abcdef0123456789abcdef";

// A real listed card with a vercel binding — resolved dynamically so
// catalog churn doesn't rot the test.
const CARD = ai.image
  .listed_models()
  .find((card) => ai.image.binding(card, "vercel"))!;

function request(body: unknown, token?: string): Request {
  return new Request("http://grida.test/api/v1/ai/images/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.GG_TOKEN_SECRET = SECRET;
  h.imageCalls = 0;
  h.lastOptions = null;
  h.reportedCost = undefined;
  mockedGetEntitlement.mockReset();
  mockedIngest.mockReset();
  mockedGetEntitlement.mockResolvedValue({
    allowed: true,
    cachedBalanceCents: 500,
    cachedAt: null,
  } as never);
  mockedIngest.mockResolvedValue({ transactionId: "tx" } as never);
});

describe("POST /api/v1/ai/images/generations", () => {
  it.each([0, "0", 0.21072, "0.01317"])(
    "bills the upstream receipt %j once instead of the image-count estimate",
    async (cost) => {
      h.reportedCost = cost;
      const { token } = await signGgToken("user-1", 7);
      const res = await POST(
        request(
          {
            model_id: "openai/gpt-image-2.5-sunburst",
            prompt: "x",
            n: 2,
            quality: "max",
            // Caller-controlled receipt-shaped data is never authoritative.
            providerMetadata: { gateway: { cost: 0 } },
          },
          token
        )
      );
      expect(res.status).toBe(200);
      expect(mockedIngest).toHaveBeenCalledTimes(1);
      expect(mockedIngest.mock.calls[0]![1]).toBe(Number(cost) * 1000);
    }
  );

  it.each([undefined, null, "", " ", "invalid", -1, "-1", Infinity, true, {}])(
    "retains the documented estimate when the receipt is invalid or absent: %j",
    async (cost) => {
      h.reportedCost = cost;
      const { token } = await signGgToken("user-1", 7);
      const res = await POST(
        request({ model_id: CARD.id, prompt: "x" }, token)
      );
      expect(res.status).toBe(200);
      expect(mockedIngest.mock.calls[0]![1]).toBe(
        computeImageCostMills(CARD, {})
      );
    }
  );

  it("generates through the billed middleware with pre-priced mills", async () => {
    const { token } = await signGgToken("user-1", 7);
    const res = await POST(
      request({ model_id: CARD.id, prompt: "a red square", n: 2 }, token)
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      model_id: string;
      provider_id: string;
      images: Array<{ base64: string; media_type: string }>;
    };
    expect(body.model_id).toBe(CARD.id);
    expect(body.provider_id).toBe("vercel");
    expect(body.images.length).toBeGreaterThan(0);
    expect(body.images[0]!.base64).toBe(PNG_B64);
    expect(body.images[0]!.media_type).toContain("image/");

    expect(mockedGetEntitlement).toHaveBeenCalledWith(7);
    const expected = computeImageCostMills(CARD, { n: 2 });
    // n=2 with maxImagesPerCall=4 → one SDK call, one middleware pass.
    expect(mockedIngest).toHaveBeenCalledTimes(1);
    expect(mockedIngest.mock.calls[0]![0]).toBe(7);
    expect(mockedIngest.mock.calls[0]![1]).toBe(expected);
  });

  it.each(["high", "auto"])(
    "forwards quality %s to the origin provider",
    async (quality) => {
      const { token } = await signGgToken("user-1", 7);
      const res = await POST(
        request({ model_id: CARD.id, prompt: "x", quality }, token)
      );
      expect(res.status).toBe(200);
      // The billed tier must actually reach the provider (Vercel AI Gateway
      // keys providerOptions by origin provider, e.g. `openai`).
      const originProvider = CARD.id.slice(0, CARD.id.indexOf("/"));
      const opts = h.lastOptions as {
        providerOptions?: Record<string, Record<string, unknown>>;
      };
      expect(opts.providerOptions?.[originProvider]?.quality).toBe(quality);
    }
  );

  it.each(["transparent", "opaque"])(
    "rejects unverified %s background before billing or inference",
    async (background) => {
      const { token } = await signGgToken("user-1", 7);
      const res = await POST(
        request(
          { model_id: "openai/gpt-image-2", prompt: "x", background },
          token
        )
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_request_error");
      expect(h.imageCalls).toBe(0);
      expect(mockedGetEntitlement).not.toHaveBeenCalled();
      expect(mockedIngest).not.toHaveBeenCalled();
    }
  );

  it.each([null, true, "remove", 1, {}])(
    "rejects malformed background %j",
    async (background) => {
      const { token } = await signGgToken("user-1", 7);
      const res = await POST(
        request({ model_id: CARD.id, prompt: "x", background }, token)
      );
      expect(res.status).toBe(400);
      expect(h.imageCalls).toBe(0);
      expect(mockedGetEntitlement).not.toHaveBeenCalled();
      expect(mockedIngest).not.toHaveBeenCalled();
    }
  );

  it("keeps auto background equivalent to the omitted default", async () => {
    const { token } = await signGgToken("user-1", 7);
    const res = await POST(
      request({ model_id: CARD.id, prompt: "x", background: "auto" }, token)
    );
    expect(res.status).toBe(200);
    const opts = h.lastOptions as {
      providerOptions?: Record<string, Record<string, unknown>>;
    };
    expect(opts.providerOptions?.openai?.background).toBeUndefined();
    expect(opts.providerOptions?.openai?.output_format).toBeUndefined();
  });

  it.each(["openai/gpt-image-2.5-flare", "openai/gpt-image-2.5-sunburst"])(
    "serves %s with native transparency, alpha-safe PNG and hosted billing",
    async (modelId) => {
      const { token } = await signGgToken("user-1", 7);
      const res = await POST(
        request(
          {
            model_id: modelId,
            prompt: "x",
            background: "transparent",
            output_format: "jpeg",
          },
          token
        )
      );
      expect(res.status).toBe(200);
      expect((await res.json()).images[0]).toEqual({
        base64: PNG_B64,
        media_type: "image/png",
      });
      expect(h.imageCalls).toBe(1);
      expect(mockedGetEntitlement).toHaveBeenCalledWith(7);
      const card = ai.image.findImageModelCard(modelId)!;
      expect(mockedIngest.mock.calls[0]![1]).toBe(
        computeImageCostMills(card, {})
      );
      const opts = h.lastOptions as {
        providerOptions?: Record<string, Record<string, unknown>>;
      };
      expect(opts.providerOptions?.openai).toEqual({
        background: "transparent",
        output_format: "png",
      });
    }
  );

  it("401 without token; 404 for unknown models — provider untouched", async () => {
    expect(
      (await POST(request({ model_id: CARD.id, prompt: "x" }))).status
    ).toBe(401);
    const { token } = await signGgToken("user-1", 7);
    const res = await POST(
      request({ model_id: "nope/unknown", prompt: "x" }, token)
    );
    expect(res.status).toBe(404);
    expect(h.imageCalls).toBe(0);
    expect(mockedGetEntitlement).not.toHaveBeenCalled();
  });

  it.each(["auto", "low", "medium", "high", "xhigh", "max"])(
    "forwards GPT Image 2.5 quality %s to OpenAI",
    async (quality) => {
      const { token } = await signGgToken("user-1", 7);
      const res = await POST(
        request(
          { model_id: "openai/gpt-image-2.5-sunburst", prompt: "x", quality },
          token
        )
      );
      expect(res.status).toBe(200);
      expect(h.lastOptions).toMatchObject({
        providerOptions: { openai: { quality } },
      });
    }
  );

  it("rejects an unsupported declared quality before billing or inference", async () => {
    const { token } = await signGgToken("user-1", 7);
    const res = await POST(
      request(
        {
          model_id: "openai/gpt-image-2.5-flare",
          prompt: "x",
          quality: "ultra",
        },
        token
      )
    );
    expect(res.status).toBe(400);
    expect(h.imageCalls).toBe(0);
    expect(mockedGetEntitlement).not.toHaveBeenCalled();
    expect(mockedIngest).not.toHaveBeenCalled();
  });

  it("refuses a model without a Vercel binding before billing", async () => {
    const binding = vi.spyOn(ai.image, "binding").mockReturnValue(null);
    try {
      const { token } = await signGgToken("user-1", 7);
      const res = await POST(
        request({ model_id: CARD.id, prompt: "x" }, token)
      );
      expect(res.status).toBe(404);
      expect(h.imageCalls).toBe(0);
      expect(mockedGetEntitlement).not.toHaveBeenCalled();
      expect(mockedIngest).not.toHaveBeenCalled();
    } finally {
      binding.mockRestore();
    }
  });

  it("402 for blocked orgs, before the provider call", async () => {
    mockedGetEntitlement.mockResolvedValue({
      allowed: false,
      reason: "no_balance",
      cachedBalanceCents: 0,
      cachedAt: null,
    } as never);
    const { token } = await signGgToken("user-1", 7);
    const res = await POST(request({ model_id: CARD.id, prompt: "x" }, token));
    expect(res.status).toBe(402);
    expect(h.imageCalls).toBe(0);
    expect(mockedIngest).not.toHaveBeenCalled();
  });
});
