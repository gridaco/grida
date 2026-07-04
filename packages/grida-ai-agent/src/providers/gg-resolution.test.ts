// GRIDA-GG: provider — see docs/wg/platform/hosted-ai.md
/**
 * GRIDA-SEC-006 — grida hosted provider resolution.
 *
 * Pins the locked precedence (explicit wins; implicit = BYOK → grida →
 * endpoints), the live-token + base-URL gating, and the explicit-pick
 * failure shape (ProviderUnavailableError with provider_id "gg" →
 * the renderer's "Sign in to use included AI").
 */
import { describe, expect, it } from "vitest";
import type { SecretsStore } from "@grida/daemon/server";
import type { EndpointProviderConfig } from "../protocol/endpoints";
import type { EndpointProvidersStore } from "./endpoints";
import { ProviderUnavailableError, resolveProvider } from "./index";
import { GridaGatewaySessionStore } from "./gg-session";

const BASE = "https://grida.test";

function liveSession(): GridaGatewaySessionStore {
  const s = new GridaGatewaySessionStore();
  s.set({ access_token: "tok", expires_at: Date.now() + 900_000 });
  return s;
}

function expiredSession(): GridaGatewaySessionStore {
  const s = new GridaGatewaySessionStore();
  s.set({ access_token: "tok", expires_at: Date.now() - 1 });
  return s;
}

const OLLAMA: EndpointProviderConfig = {
  id: "ollama",
  label: "Ollama",
  base_url: "http://localhost:11434/v1",
  models: [{ id: "llama3.1:8b" }],
};

function deps(args: {
  keys?: Record<string, string>;
  gg?: GridaGatewaySessionStore;
  base?: string | null;
  endpoints?: EndpointProviderConfig[];
}) {
  return {
    secrets: {
      _getKey: async (providerId: string) => args.keys?.[providerId] ?? null,
    } as SecretsStore,
    endpoints: args.endpoints
      ? ({
          list: async () => args.endpoints,
          get: async (id: string) =>
            args.endpoints!.find((e) => e.id === id) ?? null,
        } as EndpointProvidersStore)
      : undefined,
    gg: args.gg,
    gg_base_url: args.base === null ? undefined : (args.base ?? BASE),
  };
}

describe("grida hosted resolution", () => {
  it("implicit: BYOK beats grida; grida beats endpoints", async () => {
    const byokFirst = await resolveProvider(
      deps({ keys: { openrouter: "sk" }, gg: liveSession() })
    );
    expect(byokFirst.provider_id).toBe("openrouter");

    const gridaOverEndpoint = await resolveProvider(
      deps({ gg: liveSession(), endpoints: [OLLAMA] })
    );
    expect(gridaOverEndpoint.provider_id).toBe("gg");
    expect(gridaOverEndpoint.kind).toBe("gg");
  });

  it("implicit: expired token falls through to endpoints; absent store too", async () => {
    const fellThrough = await resolveProvider(
      deps({ gg: expiredSession(), endpoints: [OLLAMA] })
    );
    expect(fellThrough.provider_id).toBe("ollama");

    const noStore = await resolveProvider(deps({ endpoints: [OLLAMA] }));
    expect(noStore.provider_id).toBe("ollama");
  });

  it("never resolves grida without a base URL (dormant host)", async () => {
    await expect(
      resolveProvider(deps({ gg: liveSession(), base: null }))
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("explicit grida: resolves with a live token; typed 'provider_down' without", async () => {
    const resolved = await resolveProvider(deps({ gg: liveSession() }), {
      explicit: "gg",
    });
    expect(resolved.provider_id).toBe("gg");

    await expect(
      resolveProvider(deps({ gg: expiredSession() }), { explicit: "gg" })
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ProviderUnavailableError &&
        err.provider_id === "gg" &&
        err.code === "provider_down"
    );
  });

  it("explicit BYOK still wins over a live grida session", async () => {
    const resolved = await resolveProvider(
      deps({ keys: { vercel: "vk" }, gg: liveSession() }),
      { explicit: "vercel" }
    );
    expect(resolved.provider_id).toBe("vercel");
  });
});
