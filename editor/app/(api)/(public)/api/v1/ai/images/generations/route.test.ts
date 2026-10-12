// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
/**
 * POST /api/v1/ai/images/generations — token-gated hosted image
 * generation through the REAL image billing middleware (fake Vercel AI Gateway
 * model): pre-priced mills reach ingest, blocked orgs 402 before the
 * provider, unknown/unbound models 404, base64 results in the shared
 * protocol shape, and NO library upload (the daemon owns persistence).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ProductBilling } from "@/lib/platform/product-billing";

// Rate limits are pinned by their own module; route tests must NEVER
// reach the real Upstash instance (vitest loads .env.local).
vi.mock("@/lib/ai/openai-compat/limits", () => ({
  allowAiRequest: async () => ({ success: true }),
}));

const h = vi.hoisted(() => ({
  begin: vi.fn<ProductBilling["begin"]>(),
  complete: vi.fn<ProductBilling["complete"]>(),
  entitlement: vi.fn<ProductBilling["entitlement"]>(),
  imageCalls: 0,
  lastOptions: null as unknown,
  reportedCost: undefined as unknown,
  shared: false,
  denied: false,
}));

vi.mock("@/lib/platform/product-consumer", () => ({
  platformProductBilling: () => h,
}));
vi.mock("@/lib/supabase/server", () => ({
  service_role: {
    workspace: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === "platform_source_work_begin")
          return { data: { created: true, id: args.work_id }, error: null };
        if (
          name === "platform_source_work_capture" ||
          name === "platform_source_work_finish"
        )
          return { data: { accepted: true }, error: null };
        throw new Error("unexpected source RPC: " + name);
      },
    },
  },
  createLibraryClient: vi.fn<(...args: never[]) => unknown>(),
}));
vi.mock("@/lib/auth/organization", () => ({
  requireOrganizationId: vi.fn<(...args: never[]) => unknown>(),
}));

// Keep the shared catalog immutable; override only the route's binding seam.
vi.mock("@/lib/ai", async (orig) => {
  const real = await orig<typeof import("@/lib/ai")>();
  return {
    ...real,
    default: {
      ...real.default,
      image: {
        ...real.default.image,
        binding: vi.fn<typeof real.default.image.binding>(
          real.default.image.binding
        ),
      },
    },
  };
});

// One transparent grayscale+alpha pixel; the response must preserve its bytes.
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

import { POST } from "./route";
import { signGgToken } from "@/lib/auth/gg-token";
import ai from "@/lib/ai";

const mockedAdmission = h.begin;
const mockedCompletion = h.complete;

const SECRET = "images-secret-0123456789abcdef0123456789abcdef";

// A real listed card with a Vercel AI Gateway binding — resolved dynamically so
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
  h.shared = false;
  h.denied = false;
  vi.stubEnv("GRIDA_AI_GATEWAY_ORIGIN", "http://127.0.0.1:1");
  vi.stubEnv("GRIDA_AI_GATEWAY_ALLOW_LOCAL", "1");
  vi.stubEnv("GRIDA_AI_GATEWAY_KEY_ID", "local-m2");
  vi.stubEnv("GRIDA_AI_GATEWAY_TOKEN", "a".repeat(43));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url).includes("/v1/jobs/"))
        return Response.json({
          id: "req_image",
          request_id: "req_image",
          status: "succeeded",
          result_status: "unavailable",
          billing: {
            status: "settled",
            charged_mills: "0.5",
            authorized_mills: "100",
          },
        });
      if (h.denied)
        return Response.json(
          { error: { code: "insufficient_credit" } },
          { status: 402 }
        );
      const body = JSON.parse(String(init?.body));
      h.imageCalls += 1;
      h.lastOptions = body;
      return Response.json(
        {
          data: Array.from({ length: body.n }, () => ({
            b64_json: PNG_B64,
            media_type: "image/png",
          })),
        },
        { headers: { "X-Request-ID": "req_image" } }
      );
    })
  );
  vi.mocked(ai.image.binding).mockReset();
  mockedAdmission.mockReset();
  mockedCompletion.mockReset();
  mockedAdmission.mockImplementation(async (context) => ({
    id: "route-execution",
    claim: {
      organization_id: String(context.organizationId),
      product: "grida-ai",
      operation: context.feature,
      model: context.model_id,
      unit: "cost_mills",
      policy_version: h.shared ? "shared-ai-v1" : "legacy-ai-v1",
      ...(h.shared
        ? {
            authorized_mills: context.authorizedMills,
            expense_bound_mills: context.expenseBoundMills,
            tariff_revision: context.tariffRevision,
          }
        : {}),
      request_digest: context.requestDigest,
      admission_observed_at: "2026-10-06T00:00:00Z",
      admission_expires_at: "2026-10-06T00:01:00Z",
    },
  }));
  mockedCompletion.mockImplementation(async ({ claim }, quantity) => ({
    organization_id: claim.organization_id,
    product: claim.product,
    operation: claim.operation,
    model: claim.model,
    unit: claim.unit,
    policy_version: claim.policy_version,
    outcome: "succeeded",
    quantity: String(quantity),
    occurred_at: "2026-10-06T00:00:01Z",
    evidence_digest: "b".repeat(64),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/v1/ai/images/generations", () => {
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
    expect(body.provider_id).toBe("gg");
    expect(body.images.length).toBeGreaterThan(0);
    expect(body.images[0]!.base64).toBe(PNG_B64);
    expect(body.images[0]!.media_type).toContain("image/");

    expect(mockedAdmission).not.toHaveBeenCalled();
    expect(mockedCompletion).not.toHaveBeenCalled();
  });

  it.each(["high", "auto"])(
    "forwards quality %s to the origin provider",
    async (quality) => {
      const { token } = await signGgToken("user-1", 7);
      const res = await POST(
        request({ model_id: CARD.id, prompt: "x", quality }, token)
      );
      expect(res.status).toBe(200);
      // The requested tier must reach the canonical GG input.
      const opts = h.lastOptions as {
        providerOptions?: Record<string, Record<string, unknown>>;
      };
      expect((opts as { quality: string }).quality).toBe(quality);
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
      expect(mockedAdmission).not.toHaveBeenCalled();
      expect(mockedCompletion).not.toHaveBeenCalled();
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
      expect(mockedAdmission).not.toHaveBeenCalled();
      expect(mockedCompletion).not.toHaveBeenCalled();
    }
  );

  it.each([CARD.id, "xai/grok-imagine-image-2.0"])(
    "keeps auto background equivalent to the omitted default for %s",
    async (modelId) => {
      const { token } = await signGgToken("user-1", 7);
      const res = await POST(
        request({ model_id: modelId, prompt: "x", background: "auto" }, token)
      );
      expect(res.status).toBe(200);
      const card = ai.image.findImageModelCard(modelId)!;
      const binding = ai.image.binding(card, "vercel")!;
      const originProvider = binding.id.split("/")[0]!;
      const opts = h.lastOptions as {
        providerOptions?: Record<string, Record<string, unknown>>;
      };
      expect(
        opts.providerOptions?.[originProvider]?.background
      ).toBeUndefined();
      expect(
        opts.providerOptions?.[originProvider]?.output_format
      ).toBeUndefined();
    }
  );

  it("forwards options to the binding namespace when it differs from the card", async () => {
    const { token } = await signGgToken("user-1", 7);
    const res = await POST(
      request(
        { model_id: "xai/grok-imagine-image-2.0", prompt: "x", quality: "low" },
        token
      )
    );
    expect(res.status).toBe(200);
    const opts = h.lastOptions as {
      providerOptions?: Record<string, Record<string, unknown>>;
    };
    expect((opts as { quality: string }).quality).toBe("low");
    expect(opts.providerOptions?.xai).toBeUndefined();
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
      expect(mockedAdmission).not.toHaveBeenCalled();
      expect(mockedCompletion).not.toHaveBeenCalled();
      expect(h.lastOptions).toMatchObject({ background: "transparent" });
      expect(h.lastOptions).not.toHaveProperty("output_format");
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
    expect(mockedAdmission).not.toHaveBeenCalled();
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
        quality,
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
    expect(mockedAdmission).not.toHaveBeenCalled();
    expect(mockedCompletion).not.toHaveBeenCalled();
  });

  it("delegates a listed product model to GG without requiring a Vercel binding", async () => {
    vi.mocked(ai.image.binding).mockReturnValueOnce(null);
    const { token } = await signGgToken("user-1", 7);
    const res = await POST(request({ model_id: CARD.id, prompt: "x" }, token));
    expect(res.status).toBe(200);
    expect(h.imageCalls).toBe(1);
    expect(mockedAdmission).not.toHaveBeenCalled();
    expect(mockedCompletion).not.toHaveBeenCalled();
  });

  it("402 for blocked orgs, before the provider call", async () => {
    h.denied = true;
    const { token } = await signGgToken("user-1", 7);
    const res = await POST(request({ model_id: CARD.id, prompt: "x" }, token));
    expect(res.status).toBe(402);
    expect(h.imageCalls).toBe(0);
    expect(mockedCompletion).not.toHaveBeenCalled();
  });
});
