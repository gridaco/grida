/**
 * Unit tests for the consolidated AI seam in `editor/lib/ai/server.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replicateMock = vi.hoisted(() => ({
  run: vi.fn<
    (
      model: string,
      options: { input: Record<string, unknown> }
    ) => Promise<unknown>
  >(),
}));

vi.mock("replicate", () => ({
  default: class ReplicateMock {
    readonly run = replicateMock.run;
    constructor(_options?: unknown) {}
  },
}));

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

// Partial passthrough: keep real `catalog`/`vercelAiGateway`/`modelSpecById`/
// `tiers`/`byok` (the cost + gate suites depend on them); only stub
// `isByokActive` so a test can flip the BYOK carve-out without setting
// a module-load env var.
vi.mock("../models", async (orig) => ({
  ...(await orig<typeof import("../models")>()),
  isByokActive: vi.fn<() => boolean>(),
}));

import { ProductBillingError } from "@/lib/platform/product-billing";
import { createLibraryClient } from "@/lib/supabase/server";
import { requireOrganizationId } from "@/lib/auth/organization";
import { isByokActive } from "../models";
import {
  withTransaction,
  withAiAuth,
  costMillsFromTokenUsage,
  MissingOrgIdError,
  checkGate,
  methods,
} from "../server";

const mockedEntitlement = billing.entitlement;
const mockedBegin = billing.begin;
const mockedComplete = billing.complete;
const mockedCreateLibraryClient = vi.mocked(createLibraryClient);
const mockedRequireOrganizationId = vi.mocked(requireOrganizationId);
const mockedIsByokActive = vi.mocked(isByokActive);

beforeEach(() => {
  delete process.env.BYOK_OPENROUTER_API_KEY;
  delete process.env.BYOK_VERCEL_AI_GATEWAY_API_KEY;
  mockedEntitlement.mockReset();
  mockedBegin.mockReset();
  mockedComplete.mockReset();
  mockedEntitlement.mockResolvedValue({ allowed: true, balance_cents: 1000 });
  mockedBegin.mockImplementation(async (context) => ({
    id:
      (context as { transactionId?: string }).transactionId ??
      "execution-synthetic",
    claim: {},
  }));
  mockedComplete.mockResolvedValue(undefined);
  mockedCreateLibraryClient.mockReset();
  mockedRequireOrganizationId.mockReset();
  mockedIsByokActive.mockReset();
  replicateMock.run.mockReset();
  // Default: BYOK inactive (billed path) unless a test opts in.
  mockedIsByokActive.mockReturnValue(false);
});

function stubAuthed(orgId = 7) {
  mockedCreateLibraryClient.mockResolvedValueOnce({
    auth: {
      getUser: async () => ({ data: { user: { id: "u-1" } }, error: null }),
    },
  } as never);
  mockedRequireOrganizationId.mockResolvedValueOnce(orgId);
}

afterEach(() => {
  delete process.env.GG_REPLICATE_API_TOKEN;
  vi.clearAllMocks();
});

describe("methods.generateMusic", () => {
  it("sends only fields accepted by the current Replicate Lyria schema", async () => {
    process.env.GG_REPLICATE_API_TOKEN = "test-replicate-token";
    replicateMock.run.mockResolvedValueOnce("https://example.test/audio.mp3");

    await expect(
      methods.generateMusic(7, "google/lyria-3", {
        prompt: "Clockwork forest percussion",
        images: ["https://example.test/reference.png"],
        seed: 42,
      })
    ).resolves.toEqual({ url: "https://example.test/audio.mp3" });

    expect(replicateMock.run).toHaveBeenCalledExactlyOnceWith(
      "google/lyria-3",
      {
        input: {
          prompt: "Clockwork forest percussion",
          images: ["https://example.test/reference.png"],
          seed: 42,
        },
      }
    );
    const providerInput = replicateMock.run.mock.calls[0][1].input;
    expect(providerInput).not.toHaveProperty("image_inputs");
    expect(providerInput).not.toHaveProperty("language");
    expect(providerInput).not.toHaveProperty("negative_prompt");
  });
});

describe("costMillsFromTokenUsage", () => {
  it("computes cost from a base-rate model card", () => {
    // openai/gpt-5.6-luna → input 0.20, output 1.20 per 1M
    const mills = costMillsFromTokenUsage("openai/gpt-5.6-luna", {
      inputTokens: { total: 1000 },
      outputTokens: { total: 1000 },
    });
    // 0.2e-3 + 1.2e-3 = 1.4e-3 USD = 1.4 mills (fractional —
    // Platform retains the producer's exact native quantity).
    expect(mills).toBeCloseTo(1.4);
  });

  it("applies cacheRead rate for cached input tokens", () => {
    // claude-sonnet-5: input 2, cacheRead 0.2, output 10 (per 1M).
    const mills = costMillsFromTokenUsage("anthropic/claude-sonnet-5", {
      inputTokens: { total: 10000, cacheRead: 8000 },
      outputTokens: { total: 0 },
    });
    // nonCached = 10000 - 8000 = 2000 → 2000*2/1e6 = 4e-3 USD
    // cacheRead = 8000*0.2/1e6 = 1.6e-3 USD
    // total = 5.6e-3 USD = 5.6 mills (fractional, un-rounded).
    expect(mills).toBeCloseTo(5.6);
  });

  // GRIDA-GG: gateway — pin request pricing used by hosted chat metering.
  it("keeps GPT-5.6 base rates at the 272K input boundary", () => {
    const mills = costMillsFromTokenUsage("openai/gpt-5.6-terra", {
      inputTokens: {
        total: 272_000,
        noCache: 180_000,
        cacheRead: 72_000,
        cacheWrite: 20_000,
      },
      outputTokens: { total: 10_000 },
    });

    expect(mills).toBeCloseTo(
      ((180_000 * 2 + 72_000 * 0.2 + 20_000 * 2.5 + 10_000 * 12) / 1_000_000) *
        1000
    );
  });

  it("applies GPT-5.6 request-wide rates above 272K input", () => {
    const mills = costMillsFromTokenUsage("openai/gpt-5.6-terra", {
      inputTokens: {
        total: 272_001,
        noCache: 180_001,
        cacheRead: 72_000,
        cacheWrite: 20_000,
      },
      outputTokens: { total: 10_000, reasoning: 2_000 },
    });

    expect(mills).toBeCloseTo(
      (((180_001 * 2 + 72_000 * 0.2 + 20_000 * 2.5) * 2 + 10_000 * 12 * 1.5) /
        1_000_000) *
        1000
    );
  });

  it("meters GPT-6 Astra at its published long-context rates", () => {
    const mills = costMillsFromTokenUsage("openai/gpt-6-astra", {
      inputTokens: {
        total: 272_001,
        noCache: 180_001,
        cacheRead: 72_000,
        cacheWrite: 20_000,
      },
      outputTokens: { total: 10_000, reasoning: 2_000 },
    });

    expect(mills).toBeCloseTo(
      (((180_001 * 10 + 72_000 * 1 + 20_000 * 12.5) * 2 + 10_000 * 50 * 1.5) /
        1_000_000) *
        1000
    );
  });

  it("derives total input from normalized buckets before applying the band", () => {
    const mills = costMillsFromTokenUsage("openai/gpt-5.6-terra", {
      inputTokens: {
        noCache: 180_001,
        cacheRead: 72_000,
        cacheWrite: 20_000,
      },
      outputTokens: { total: 10_000 },
    });

    expect(mills).toBeCloseTo(
      (((180_001 * 2 + 72_000 * 0.2 + 20_000 * 2.5) * 2 + 10_000 * 12 * 1.5) /
        1_000_000) *
        1000
    );
  });

  it("keeps Gemini 3.1 Pro base rates at the 200K input boundary", () => {
    // The band is strictly-greater-than, so 200,000 exactly is still base.
    const mills = costMillsFromTokenUsage("google/gemini-3.1-pro-preview", {
      inputTokens: { total: 200_000, noCache: 150_000, cacheRead: 50_000 },
      outputTokens: { total: 10_000 },
    });

    expect(mills).toBeCloseTo(
      ((150_000 * 2 + 50_000 * 0.2 + 10_000 * 12) / 1_000_000) * 1000
    );
  });

  it("bands Gemini 3.1 Pro above 200K input, cache reads included", () => {
    // `inputMultiplier` covers every input bucket, so above the band the
    // effective rates are Google's published $4 in / $0.40 cacheRead /
    // $18 out. That the catalogue figures multiply out to those numbers is
    // pinned on the catalogue itself, in `models.test.ts` — asserting it a
    // second time here would just be this same expression, undistributed.
    const mills = costMillsFromTokenUsage("google/gemini-3.1-pro-preview", {
      inputTokens: { total: 200_001, noCache: 150_001, cacheRead: 50_000 },
      outputTokens: { total: 10_000 },
    });

    expect(mills).toBeCloseTo(
      (((150_001 * 2 + 50_000 * 0.2) * 2 + 10_000 * 12 * 1.5) / 1_000_000) *
        1000
    );
  });

  it("throws on unknown model id", () => {
    expect(() =>
      costMillsFromTokenUsage("acme/totally-fake-model", {
        inputTokens: { total: 1 },
        outputTokens: { total: 1 },
      })
    ).toThrow(/No cost card/);
  });
});

type TransactionOperation<T> = Parameters<typeof withTransaction<T>>[1];

describe("withTransaction", () => {
  const context = {
    organizationId: 7,
    feature: "test/feature",
    model_id: "openai/gpt-5.6-luna",
    requestDigest: "a".repeat(64),
    transactionId: "execution-synthetic",
  };
  it("commits fresh admission before provider work and exact completion before returning", async () => {
    const op = vi.fn<TransactionOperation<{ id: string; value: number }>>(
      async (id) => ({
        result: { id, value: 42 },
        costMills: 5,
      })
    );
    expect(await withTransaction(context, op)).toEqual({
      id: context.transactionId,
      value: 42,
    });
    expect(mockedBegin).toHaveBeenCalledExactlyOnceWith(context);
    expect(op).toHaveBeenCalledExactlyOnceWith(context.transactionId);
    expect(mockedComplete).toHaveBeenCalledExactlyOnceWith(
      { id: context.transactionId, claim: {} },
      5,
      { result: { id: context.transactionId, value: 42 }, costMills: 5 }
    );
    expect(mockedBegin.mock.invocationCallOrder[0]).toBeLessThan(
      op.mock.invocationCallOrder[0]
    );
    expect(op.mock.invocationCallOrder[0]).toBeLessThan(
      mockedComplete.mock.invocationCallOrder[0]
    );
  });
  it("does not invoke the provider or complete a refused admission", async () => {
    mockedBegin.mockRejectedValueOnce(new ProductBillingError("blocked"));
    const op = vi.fn<TransactionOperation<Record<string, never>>>(async () => ({
      result: {},
      costMills: 5,
    }));
    await expect(withTransaction(context, op)).rejects.toMatchObject({
      code: "blocked",
      status: 402,
    });
    expect(op).not.toHaveBeenCalled();
    expect(mockedComplete).not.toHaveBeenCalled();
  });
  it("retains an unknown outcome when the provider throws without inventing a completion", async () => {
    const op = vi.fn<TransactionOperation<never>>(async () => {
      throw new Error("provider blew up");
    });
    await expect(withTransaction(context, op)).rejects.toThrow(
      "provider blew up"
    );
    expect(mockedBegin).toHaveBeenCalledOnce();
    expect(mockedComplete).not.toHaveBeenCalled();
  });
  it("requires the verified organization and request digest before admission", async () => {
    const op = vi.fn<TransactionOperation<Record<string, never>>>(async () => ({
      result: {},
      costMills: 5,
    }));
    await expect(
      withTransaction({ ...context, organizationId: 0 }, op)
    ).rejects.toBeInstanceOf(MissingOrgIdError);
    await expect(
      withTransaction({ ...context, requestDigest: undefined }, op)
    ).rejects.toMatchObject({ code: "billing_unavailable" });
    expect(mockedBegin).not.toHaveBeenCalled();
    expect(op).not.toHaveBeenCalled();
  });
  it.each([true, false, undefined])(
    "awaits durable completion for awaitIngest=%s",
    async (awaitIngest) => {
      let completed = false;
      mockedComplete.mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        completed = true;
      });
      await withTransaction({ ...context, awaitIngest }, async () => ({
        result: { ok: true },
        costMills: 3,
      }));
      expect(completed).toBe(true);
    }
  );
  it("propagates a completion-custody failure without dispatching again", async () => {
    mockedComplete.mockRejectedValueOnce(new ProductBillingError());
    const op = vi.fn<TransactionOperation<Record<string, never>>>(async () => ({
      result: {},
      costMills: 5,
    }));
    await expect(withTransaction(context, op)).rejects.toMatchObject({
      code: "billing_unavailable",
    });
    expect(op).toHaveBeenCalledOnce();
    expect(mockedBegin).toHaveBeenCalledOnce();
  });
});

describe("withAiAuth envelope", () => {
  it("appends balanceCents to the success envelope by default", async () => {
    stubAuthed(7);
    mockedEntitlement.mockResolvedValueOnce({ balance_cents: 2599 });

    const result = await withAiAuth("test/scope", undefined, async (orgId) => ({
      reply: "hi",
      org: orgId,
    }));

    expect(result).toEqual({
      success: true,
      data: { reply: "hi", org: 7, balanceCents: 2599 },
    });
    expect(mockedEntitlement).toHaveBeenCalledWith(7);
  });

  it("does NOT append balanceCents when opts.balance === false", async () => {
    stubAuthed(7);

    const result = await withAiAuth(
      "test/scope",
      undefined,
      async () => ({ reply: "silent" }),
      { balance: false }
    );

    expect(result).toEqual({ success: true, data: { reply: "silent" } });
    expect(mockedEntitlement).not.toHaveBeenCalled();
  });

  it("under BYOK + byokBypass (AI-SDK path): skips refreshBalance, balanceCents:0, auth still enforced", async () => {
    mockedIsByokActive.mockReturnValue(true);
    stubAuthed(7);

    const result = await withAiAuth(
      "test/scope",
      undefined,
      async (orgId) => ({ reply: "byok", org: orgId }),
      { byokBypass: true }
    );

    expect(result).toEqual({
      success: true,
      data: { reply: "byok", org: 7, balanceCents: 0 },
    });
    // BYOK bypasses billing only — auth + org resolution still ran.
    expect(mockedCreateLibraryClient).toHaveBeenCalled();
    expect(mockedRequireOrganizationId).toHaveBeenCalled();
    expect(mockedEntitlement).not.toHaveBeenCalled();
  });

  it("under BYOK without byokBypass (Replicate-billed path): still reads the real balance", async () => {
    // GRIDA-SEC-003: BYOK only bypasses the AI-SDK provider. A billed
    // action must report the real balance under BYOK, never a false 0,
    // or it silently drains credit and surprises with a 402.
    mockedIsByokActive.mockReturnValue(true);
    stubAuthed(7);
    mockedEntitlement.mockResolvedValueOnce({ balance_cents: 2599 });

    const result = await withAiAuth("test/scope", undefined, async (orgId) => ({
      reply: "billed",
      org: orgId,
    }));

    expect(result).toEqual({
      success: true,
      data: { reply: "billed", org: 7, balanceCents: 2599 },
    });
    expect(mockedEntitlement).toHaveBeenCalledWith(7);
  });
});

describe("checkGate", () => {
  it("throws on refusal", async () => {
    mockedEntitlement.mockResolvedValueOnce({
      allowed: false,
      reason: "no_balance",
      cachedBalanceCents: 0,
      cachedAt: null,
    });
    await expect(
      checkGate({
        organizationId: 7,
        feature: "test",
        model_id: "openai/gpt-5.6-luna",
      })
    ).rejects.toBeInstanceOf(ProductBillingError);
  });

  it("returns silently on allow", async () => {
    mockedEntitlement.mockResolvedValueOnce({
      allowed: true,
      cachedBalanceCents: 1000,
      cachedAt: null,
    });
    await expect(
      checkGate({
        organizationId: 7,
        feature: "test",
        model_id: "openai/gpt-5.6-luna",
      })
    ).resolves.toBeUndefined();
  });
});
