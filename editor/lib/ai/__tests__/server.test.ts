/**
 * Unit tests for the consolidated AI seam in `editor/lib/ai/server.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/billing/metronome", () => ({
  getEntitlement: vi.fn<(...args: never[]) => unknown>(),
  ingestUsageEvent: vi.fn<(...args: never[]) => unknown>(),
  refreshBalance: vi.fn<(...args: never[]) => unknown>(),
  BillingMetronomeError: class BillingMetronomeError extends Error {
    code: string;
    status: number;
    constructor(message: string, code: string, status = 500) {
      super(message);
      this.name = "BillingMetronomeError";
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

// Partial passthrough: keep real `catalog`/`gateway`/`modelSpecById`/
// `tiers`/`byok` (the cost + gate suites depend on them); only stub
// `isByokActive` so a test can flip the BYOK carve-out without setting
// a module-load env var.
vi.mock("../models", async (orig) => ({
  ...(await orig<typeof import("../models")>()),
  isByokActive: vi.fn<() => boolean>(),
}));

import {
  getEntitlement,
  ingestUsageEvent,
  refreshBalance,
  BillingMetronomeError,
} from "@/lib/billing/metronome";
import { createLibraryClient } from "@/lib/supabase/server";
import { requireOrganizationId } from "@/lib/auth/organization";
import { isByokActive } from "../models";
import {
  withTransaction,
  withAiAuth,
  costMillsFromTokenUsage,
  MissingOrgIdError,
  checkGate,
} from "../server";

const mockedGetEntitlement = vi.mocked(getEntitlement);
const mockedIngestUsageEvent = vi.mocked(ingestUsageEvent);
const mockedRefreshBalance = vi.mocked(refreshBalance);
const mockedCreateLibraryClient = vi.mocked(createLibraryClient);
const mockedRequireOrganizationId = vi.mocked(requireOrganizationId);
const mockedIsByokActive = vi.mocked(isByokActive);

beforeEach(() => {
  delete process.env.BYOK_OPENROUTER_API_KEY;
  delete process.env.BYOK_AI_GATEWAY_API_KEY;
  mockedGetEntitlement.mockReset();
  mockedIngestUsageEvent.mockReset();
  mockedRefreshBalance.mockReset();
  mockedCreateLibraryClient.mockReset();
  mockedRequireOrganizationId.mockReset();
  mockedIsByokActive.mockReset();
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
  vi.clearAllMocks();
});

describe("costMillsFromTokenUsage", () => {
  it("computes cost from a flat-rate model card", () => {
    // openai/gpt-5.4-mini → input 0.75, output 4.50 per 1M
    const mills = costMillsFromTokenUsage("openai/gpt-5.4-mini", {
      inputTokens: { total: 1000 },
      outputTokens: { total: 1000 },
    });
    // 0.75e-3 + 4.5e-3 = 5.25e-3 USD = 5.25 mills (fractional —
    // Metronome aggregates exactly, Stripe rounds once at invoice).
    expect(mills).toBeCloseTo(5.25);
  });

  it("applies cacheRead rate for cached input tokens", () => {
    // claude-sonnet-4.6: input 3, cacheRead 0.3, output 15 (per 1M).
    const mills = costMillsFromTokenUsage("anthropic/claude-sonnet-4.6", {
      inputTokens: { total: 10000, cacheRead: 8000 },
      outputTokens: { total: 0 },
    });
    // nonCached = 10000 - 8000 = 2000 → 2000*3/1e6 = 6e-3 USD
    // cacheRead = 8000*0.3/1e6 = 2.4e-3 USD
    // total = 8.4e-3 USD = 8.4 mills (fractional, un-rounded).
    expect(mills).toBeCloseTo(8.4);
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

describe("withTransaction", () => {
  it("runs op, ingests on success", async () => {
    mockedGetEntitlement.mockResolvedValueOnce({
      allowed: true,
      cachedBalanceCents: 1000,
      cachedAt: null,
    });
    mockedIngestUsageEvent.mockResolvedValueOnce({ transactionId: "tx-1" });

    const op = vi.fn<
      (
        tx: string
      ) => Promise<{ result: { tx: string; value: number }; costMills: number }>
    >(async (tx: string) => ({
      result: { tx, value: 42 },
      costMills: 5,
    }));

    const out = await withTransaction(
      {
        organizationId: 7,
        feature: "test/feature",
        model_id: "openai/gpt-5.4-mini",
        transactionId: "tx-1",
      },
      op
    );

    expect(out).toEqual({ tx: "tx-1", value: 42 });
    expect(op).toHaveBeenCalledExactlyOnceWith("tx-1");
    expect(mockedIngestUsageEvent).toHaveBeenCalledWith(7, 5, {
      transactionId: "tx-1",
    });
  });

  it("throws BillingMetronomeError on gate refusal; does not invoke op or ingest", async () => {
    mockedGetEntitlement.mockResolvedValueOnce({
      allowed: false,
      reason: "below_floor",
      cachedBalanceCents: 10,
      cachedAt: null,
    });
    const op =
      vi.fn<(tx: string) => Promise<{ result: unknown; costMills: number }>>();

    await expect(
      withTransaction(
        {
          organizationId: 7,
          feature: "test/feature",
          model_id: "openai/gpt-5.4-mini",
        },
        op
      )
    ).rejects.toBeInstanceOf(BillingMetronomeError);

    expect(op).not.toHaveBeenCalled();
    expect(mockedIngestUsageEvent).not.toHaveBeenCalled();
  });

  it("does NOT ingest when op throws", async () => {
    mockedGetEntitlement.mockResolvedValueOnce({
      allowed: true,
      cachedBalanceCents: 1000,
      cachedAt: null,
    });
    const op = vi.fn<(tx: string) => Promise<never>>(async () => {
      throw new Error("provider blew up");
    });

    await expect(
      withTransaction(
        {
          organizationId: 7,
          feature: "test/feature",
          model_id: "openai/gpt-5.4-mini",
        },
        op
      )
    ).rejects.toThrow("provider blew up");

    expect(mockedIngestUsageEvent).not.toHaveBeenCalled();
  });

  it("throws MissingOrgIdError for invalid organizationId", async () => {
    const op =
      vi.fn<(tx: string) => Promise<{ result: unknown; costMills: number }>>();
    await expect(
      withTransaction(
        {
          organizationId: 0 as number,
          feature: "test/feature",
          model_id: "openai/gpt-5.4-mini",
        },
        op
      )
    ).rejects.toBeInstanceOf(MissingOrgIdError);
    expect(op).not.toHaveBeenCalled();
  });

  it("awaits ingest when ctx.awaitIngest is true (read-after-write semantics)", async () => {
    mockedGetEntitlement.mockResolvedValueOnce({
      allowed: true,
      cachedBalanceCents: 1000,
      cachedAt: null,
    });
    // Resolve ingest on next tick so we can prove withTransaction actually
    // waited on it.
    let ingestResolved = false;
    mockedIngestUsageEvent.mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 5));
      ingestResolved = true;
      return { transactionId: "tx-await" };
    });

    const op = vi.fn<
      (tx: string) => Promise<{ result: { ok: true }; costMills: number }>
    >(async () => ({ result: { ok: true }, costMills: 3 }));

    await withTransaction(
      {
        organizationId: 7,
        feature: "ai/chat",
        model_id: "openai/gpt-5.4-mini",
        awaitIngest: true,
      },
      op
    );

    expect(ingestResolved).toBe(true);
    expect(mockedIngestUsageEvent).toHaveBeenCalledWith(
      7,
      3,
      expect.anything()
    );
  });
});

describe("withAiAuth envelope", () => {
  it("appends balanceCents to the success envelope by default", async () => {
    stubAuthed(7);
    mockedRefreshBalance.mockResolvedValueOnce({ cents: 2599, live: null });

    const result = await withAiAuth("test/scope", undefined, async (orgId) => ({
      reply: "hi",
      org: orgId,
    }));

    expect(result).toEqual({
      success: true,
      data: { reply: "hi", org: 7, balanceCents: 2599 },
    });
    expect(mockedRefreshBalance).toHaveBeenCalledWith(7);
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
    expect(mockedRefreshBalance).not.toHaveBeenCalled();
  });

  it("under BYOK: skips refreshBalance, returns balanceCents:0, auth still enforced", async () => {
    mockedIsByokActive.mockReturnValue(true);
    stubAuthed(7);

    const result = await withAiAuth("test/scope", undefined, async (orgId) => ({
      reply: "byok",
      org: orgId,
    }));

    expect(result).toEqual({
      success: true,
      data: { reply: "byok", org: 7, balanceCents: 0 },
    });
    // BYOK bypasses billing only — auth + org resolution still ran.
    expect(mockedCreateLibraryClient).toHaveBeenCalled();
    expect(mockedRequireOrganizationId).toHaveBeenCalled();
    // The Metronome balance read is skipped.
    expect(mockedRefreshBalance).not.toHaveBeenCalled();
  });
});

describe("checkGate", () => {
  it("throws on refusal", async () => {
    mockedGetEntitlement.mockResolvedValueOnce({
      allowed: false,
      reason: "no_balance",
      cachedBalanceCents: 0,
      cachedAt: null,
    });
    await expect(
      checkGate({
        organizationId: 7,
        feature: "test",
        model_id: "openai/gpt-5.4-mini",
      })
    ).rejects.toBeInstanceOf(BillingMetronomeError);
  });

  it("returns silently on allow", async () => {
    mockedGetEntitlement.mockResolvedValueOnce({
      allowed: true,
      cachedBalanceCents: 1000,
      cachedAt: null,
    });
    await expect(
      checkGate({
        organizationId: 7,
        feature: "test",
        model_id: "openai/gpt-5.4-mini",
      })
    ).resolves.toBeUndefined();
  });
});
