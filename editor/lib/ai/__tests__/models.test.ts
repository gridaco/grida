// GRIDA-SEC-003 — contributor overrides and funded provider authority.
// GRIDA-GG: gateway — actual SDK authentication with synthetic requests only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const billing = vi.hoisted(() => ({
  getEntitlement:
    vi.fn<typeof import("@/lib/billing/metronome").getEntitlement>(),
  ingestUsageEvent:
    vi.fn<typeof import("@/lib/billing/metronome").ingestUsageEvent>(),
}));

vi.mock("@/lib/billing/metronome", () => ({
  ...billing,
  refreshBalance:
    vi.fn<typeof import("@/lib/billing/metronome").refreshBalance>(),
  BillingMetronomeError: class extends Error {},
}));
vi.mock("@/lib/supabase/server", () => ({
  createLibraryClient:
    vi.fn<typeof import("@/lib/supabase/server").createLibraryClient>(),
}));
vi.mock("@/lib/auth/organization", () => ({
  requireOrganizationId:
    vi.fn<typeof import("@/lib/auth/organization").requireOrganizationId>(),
}));

const requestContext = Symbol.for("@vercel/request-context");
const requests: { url: string; headers: Headers }[] = [];

// The SDK checks token expiry locally; this unsigned fixture never leaves fetch.
function oidcToken(subject: string): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({
    sub: subject,
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.fixture`;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  requests.length = 0;
  for (const key of [
    "GG_VERCEL_AI_GATEWAY_API_KEY",
    "AI_GATEWAY_API_KEY",
    "VERCEL_OIDC_TOKEN",
    "BYOK_OPENROUTER_API_KEY",
    "BYOK_VERCEL_AI_GATEWAY_API_KEY",
    "BYOK_AI_GATEWAY_API_KEY",
  ]) {
    vi.stubEnv(key, undefined);
  }
  vi.stubGlobal(requestContext, undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      requests.push({ url, headers: new Headers(init?.headers) });
      if (!url.startsWith("https://ai-gateway.vercel.sh/")) {
        throw new Error("Unexpected request in synthetic provider test");
      }
      return Response.json({
        content: [{ type: "text", text: "fixture" }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          tokens: 1,
          inputTokens: { total: 1 },
          outputTokens: { total: 1 },
        },
        embeddings: [[0.25, 0.5]],
      });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("funded Vercel AI Gateway authority", () => {
  it("uses only the explicit GG key even when other funding credentials are present", async () => {
    vi.stubEnv("GG_VERCEL_AI_GATEWAY_API_KEY", "  fixture-gg-key  ");
    vi.stubEnv("AI_GATEWAY_API_KEY", "fixture-native-key");
    vi.stubEnv("BYOK_VERCEL_AI_GATEWAY_API_KEY", "fixture-contributor-key");
    vi.stubEnv("VERCEL_OIDC_TOKEN", oidcToken("platform"));
    const { vercelAiGateway } = await import("../models");

    await vercelAiGateway("fixture/model").doGenerate({ prompt: [] });

    expect(requests).toHaveLength(1);
    expect(requests[0].headers.get("authorization")).toBe(
      "Bearer fixture-gg-key"
    );
    expect(requests[0].headers.get("ai-gateway-auth-method")).toBe("api-key");
    expect(requests[0].headers.get("http-referer")).toBe("https://grida.co");
    expect(requests[0].headers.get("x-title")).toBe("Grida");
  });

  it.each([undefined, " \t "])(
    "retains per-request platform OIDC with GG key %j and ignores an ambient API key",
    async (key) => {
      vi.stubEnv("GG_VERCEL_AI_GATEWAY_API_KEY", key);
      vi.stubEnv("AI_GATEWAY_API_KEY", "fixture-unrelated-key");
      const firstToken = oidcToken("first-request");
      const secondToken = oidcToken("second-request");
      let token = firstToken;
      vi.stubGlobal(requestContext, {
        get: () => ({ headers: { "x-vercel-oidc-token": token } }),
      });
      const { vercelAiGateway } = await import("../models");
      const model = vercelAiGateway("fixture/model");

      await model.doGenerate({ prompt: [] });
      token = secondToken;
      await model.doGenerate({ prompt: [] });

      expect(
        requests.map(({ headers }) => headers.get("authorization"))
      ).toEqual([`Bearer ${firstToken}`, `Bearer ${secondToken}`]);
      expect(
        requests.every(
          ({ headers }) => headers.get("ai-gateway-auth-method") === "oidc"
        )
      ).toBe(true);
    }
  );

  it("supports the platform OIDC environment credential", async () => {
    const token = oidcToken("environment");
    vi.stubEnv("VERCEL_OIDC_TOKEN", token);
    const { vercelAiGateway } = await import("../models");
    await vercelAiGateway("fixture/model").doGenerate({ prompt: [] });
    expect(requests[0].headers.get("authorization")).toBe(`Bearer ${token}`);
    expect(requests[0].headers.get("ai-gateway-auth-method")).toBe("oidc");
  });

  it("rejects unusable OIDC instead of dispatching with a generic key", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "fixture-unrelated-key");
    // Malformed token parsing fails before the SDK's local credential refresh.
    vi.stubEnv("VERCEL_OIDC_TOKEN", "fixture-invalid-oidc");
    const { vercelAiGateway } = await import("../models");
    await expect(
      vercelAiGateway("fixture/model").doGenerate({ prompt: [] })
    ).rejects.toThrow(/authentication failed/i);
    expect(requests).toHaveLength(0);
  });

  it("keeps Library embeddings on the shared provider without user billing", async () => {
    const token = oidcToken("library");
    vi.stubEnv("VERCEL_OIDC_TOKEN", token);
    const { embedTextUnbilled } = await import("../server");

    await expect(
      embedTextUnbilled("fixture/embedding", "query")
    ).resolves.toEqual([0.25, 0.5]);

    expect(requests[0].headers.get("authorization")).toBe(`Bearer ${token}`);
    expect(billing.getEntitlement).not.toHaveBeenCalled();
    expect(billing.ingestUsageEvent).not.toHaveBeenCalled();
  });
});

describe("contributor Vercel AI Gateway override", () => {
  it("uses the renamed, trimmed key independently of funded authority", async () => {
    vi.stubEnv("BYOK_VERCEL_AI_GATEWAY_API_KEY", "  fixture-contributor-key  ");
    const { byok, isByokActive } = await import("../models");
    expect(isByokActive()).toBe(true);
    await byok!.languageModel("fixture/model").doGenerate({ prompt: [] });
    expect(requests[0].headers.get("authorization")).toBe(
      "Bearer fixture-contributor-key"
    );
  });

  it("preserves OpenRouter-first selection", async () => {
    vi.stubEnv("BYOK_OPENROUTER_API_KEY", " fixture-openrouter-key ");
    vi.stubEnv("BYOK_VERCEL_AI_GATEWAY_API_KEY", "fixture-contributor-key");
    const { byok } = await import("../models");
    expect(byok!.languageModel("fixture/model").provider).toBe(
      "openrouter.chat"
    );
  });

  it("ignores a blank OpenRouter override before selecting Vercel AI Gateway", async () => {
    vi.stubEnv("BYOK_OPENROUTER_API_KEY", " \t ");
    vi.stubEnv("BYOK_VERCEL_AI_GATEWAY_API_KEY", "fixture-contributor-key");
    const { byok } = await import("../models");
    await byok!.languageModel("fixture/model").doGenerate({ prompt: [] });
    expect(requests[0].headers.get("authorization")).toBe(
      "Bearer fixture-contributor-key"
    );
  });

  it.each([undefined, " \t "])(
    "does not activate a missing or blank new override (%j)",
    async (key) => {
      vi.stubEnv("BYOK_VERCEL_AI_GATEWAY_API_KEY", key);
      vi.stubEnv("BYOK_AI_GATEWAY_API_KEY", "fixture-retired-name");
      const { byok, isByokActive } = await import("../models");
      expect(byok).toBeNull();
      expect(isByokActive()).toBe(false);
    }
  );
});
