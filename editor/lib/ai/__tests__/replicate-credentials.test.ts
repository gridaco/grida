// GRIDA-SEC-003 — funded Replicate credentials never borrow contributor authority.
// GRIDA-GG: gateway — provider selection through the real billing seam.
// GRIDA-EE: billing — entitlement and usage calls stay in the shared seam.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  events: [] as string[],
  replicateOptions: vi.fn<(options: unknown) => void>(),
  run: vi.fn<
    (
      model: string,
      options: { input: Record<string, unknown> }
    ) => Promise<string>
  >(),
  getEntitlement: vi.fn<
    (organizationId: number) => Promise<{
      allowed: boolean;
      cachedBalanceCents: number;
      reason?: string;
    }>
  >(),
  ingestUsageEvent:
    vi.fn<
      (
        organizationId: number,
        costMills: number,
        options: { transactionId: string }
      ) => Promise<void>
    >(),
  openAiOptions: vi.fn<(options: unknown) => void>(),
  listOpenAiModels: vi.fn<() => Promise<{ data: { id: string }[] }>>(),
}));

vi.mock("replicate", () => ({
  default: class ReplicateMock {
    readonly run = h.run;
    constructor(options: unknown) {
      h.replicateOptions(options);
    }
  },
}));

vi.mock("openai", () => ({
  default: class OpenAiMock {
    readonly models = { list: h.listOpenAiModels };
    constructor(options: unknown) {
      h.openAiOptions(options);
    }
  },
}));

vi.mock("@/lib/billing/metronome", () => ({
  getEntitlement: h.getEntitlement,
  ingestUsageEvent: h.ingestUsageEvent,
  refreshBalance:
    vi.fn<typeof import("@/lib/billing/metronome").refreshBalance>(),
  BillingMetronomeError: class BillingMetronomeError extends Error {
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
  createLibraryClient:
    vi.fn<typeof import("@/lib/supabase/server").createLibraryClient>(),
}));
vi.mock("@/lib/auth/organization", () => ({
  requireOrganizationId:
    vi.fn<typeof import("@/lib/auth/organization").requireOrganizationId>(),
}));

beforeEach(() => {
  // Reset the actual server module so its lazy provider cache cannot carry
  // a previous test's admitted credential into a missing-key case.
  vi.resetModules();
  vi.resetAllMocks();
  h.events.length = 0;
  for (const key of [
    "GG_REPLICATE_API_TOKEN",
    "REPLICATE_API_TOKEN",
    "BYOK_REPLICATE_API_TOKEN",
    "GG_VERCEL_AI_GATEWAY_API_KEY",
    "AI_GATEWAY_API_KEY",
    "VERCEL_OIDC_TOKEN",
    "BYOK_OPENROUTER_API_KEY",
    "BYOK_AI_GATEWAY_API_KEY",
    "BYOK_VERCEL_AI_GATEWAY_API_KEY",
    "OPENAI_API_KEY",
  ]) {
    vi.stubEnv(key, undefined);
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Unexpected network request")))
  );
  h.getEntitlement.mockImplementation(async () => {
    h.events.push("gate");
    return { allowed: true, cachedBalanceCents: 1000 };
  });
  h.run.mockImplementation(async () => {
    h.events.push("provider");
    return "https://example.test/music.mp3";
  });
  h.ingestUsageEvent.mockImplementation(async () => {
    h.events.push("ingest");
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("funded Replicate credential admission", () => {
  it("uses the trimmed GG token and still gates and meters under contributor BYOK", async () => {
    vi.stubEnv("GG_REPLICATE_API_TOKEN", "  synthetic-gg-replicate  \n");
    vi.stubEnv("REPLICATE_API_TOKEN", "synthetic-legacy-replicate");
    vi.stubEnv("BYOK_REPLICATE_API_TOKEN", "synthetic-byok-replicate");
    vi.stubEnv("BYOK_VERCEL_AI_GATEWAY_API_KEY", "synthetic-contributor-text");
    const { methods, isByokActive } = await import("../server");

    expect(isByokActive()).toBe(true);
    await expect(
      methods.generateMusic(7, "google/lyria-3", { prompt: "Quiet piano" })
    ).resolves.toEqual({ url: "https://example.test/music.mp3" });

    expect(h.replicateOptions).toHaveBeenCalledExactlyOnceWith({
      auth: "synthetic-gg-replicate",
      useFileOutput: false,
    });
    expect(h.run).toHaveBeenCalledExactlyOnceWith("google/lyria-3", {
      input: { prompt: "Quiet piano" },
    });
    expect(h.getEntitlement).toHaveBeenCalledExactlyOnceWith(7);
    // Lyria 3 is sold at the catalog's $0.04 per generation: 40 mills.
    expect(h.ingestUsageEvent).toHaveBeenCalledExactlyOnceWith(7, 40, {
      transactionId: expect.any(String),
    });
    expect(h.events).toEqual(["gate", "provider", "ingest"]);
  });

  it.each([
    {
      name: "missing configuration",
      gg: undefined,
      legacy: undefined,
      byok: undefined,
    },
    {
      name: "only the legacy token",
      gg: undefined,
      legacy: "synthetic-legacy",
      byok: undefined,
    },
    {
      name: "only a BYOK token",
      gg: undefined,
      legacy: undefined,
      byok: "synthetic-byok",
    },
    {
      name: "a blank GG token with conflicting tokens",
      gg: " \t\n",
      legacy: "synthetic-legacy",
      byok: "synthetic-byok",
    },
  ])(
    "refuses $name before provider dispatch or ingestion",
    async ({ gg, legacy, byok }) => {
      vi.stubEnv("GG_REPLICATE_API_TOKEN", gg);
      vi.stubEnv("REPLICATE_API_TOKEN", legacy);
      vi.stubEnv("BYOK_REPLICATE_API_TOKEN", byok);
      const { methods } = await import("../server");

      await expect(
        methods.generateMusic(7, "google/lyria-3", { prompt: "Quiet piano" })
      ).rejects.toThrow("GG_REPLICATE_API_TOKEN is not set");

      expect(h.replicateOptions).not.toHaveBeenCalled();
      expect(h.run).not.toHaveBeenCalled();
      expect(h.ingestUsageEvent).not.toHaveBeenCalled();
      expect(h.events).toEqual(["gate"]);
    }
  );

  it("does not construct or dispatch the provider when credit admission fails", async () => {
    vi.stubEnv("GG_REPLICATE_API_TOKEN", "synthetic-gg-replicate");
    h.getEntitlement.mockResolvedValueOnce({
      allowed: false,
      cachedBalanceCents: 0,
      reason: "insufficient_credits",
    });
    const { methods } = await import("../server");

    await expect(
      methods.generateMusic(7, "google/lyria-3", { prompt: "Quiet piano" })
    ).rejects.toMatchObject({ code: "blocked", status: 402 });

    expect(h.getEntitlement).toHaveBeenCalledExactlyOnceWith(7);
    expect(h.replicateOptions).not.toHaveBeenCalled();
    expect(h.run).not.toHaveBeenCalled();
    expect(h.ingestUsageEvent).not.toHaveBeenCalled();
  });

  it("does not require Replicate configuration to list unbilled OpenAI models", async () => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-openai-model-list");
    h.listOpenAiModels.mockResolvedValueOnce({
      data: [{ id: "synthetic-openai-model" }],
    });
    const { methods } = await import("../server");

    await expect(methods.listOpenAiModels()).resolves.toEqual({
      data: [{ id: "synthetic-openai-model" }],
    });

    expect(h.openAiOptions).toHaveBeenCalledExactlyOnceWith({
      apiKey: "synthetic-openai-model-list",
    });
    expect(h.replicateOptions).not.toHaveBeenCalled();
    expect(h.run).not.toHaveBeenCalled();
    expect(h.getEntitlement).not.toHaveBeenCalled();
    expect(h.ingestUsageEvent).not.toHaveBeenCalled();
  });
});
