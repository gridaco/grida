import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  OLLAMA_ENDPOINT_PRESET,
  type EndpointProviderConfig,
  type GGModelsView,
} from "@grida/ai-host";
import { catalog, TIER_MODEL_IDS } from "@grida/ai/catalogue";
import { CHATGPT_RESPONSES_URL } from "../chatgpt-configuration";
import { NativePredictionRoute } from "./native-prediction-route";
import {
  NativeProviderRoutes,
  type NativeProviderRouteLaunch,
} from "./native-provider-routes";

const nano = TIER_MODEL_IDS.nano;
const premium = TIER_MODEL_IDS.max;
const signal = new AbortController().signal;
const scope = "a".repeat(64);
const source: NativeProviderRouteLaunch = {
  provider: "openai-compatible",
  endpoint: "https://openrouter.ai/api/v1",
  model: premium,
  credentialHome: "/fixture/credentials",
  providerNetwork: { isCurrent: () => true, prepare: () => null },
};
function inventory() {
  return {
    subscription:
      vi.fn<(model: string) => Promise<NativeProviderRouteLaunch>>(),
    gateway: vi
      .fn<() => Promise<GGModelsView["models"]>>()
      .mockResolvedValue([]),
    endpoints: vi
      .fn<() => Promise<EndpointProviderConfig[]>>()
      .mockResolvedValue([]),
  };
}
function gatewayModel(id: string): GGModelsView["models"][number] {
  return {
    id,
    label: id,
    kind: "text",
    created: 0,
    owned_by: "fixture",
    input_modalities: ["text"],
    output_modalities: ["text"],
    operation_ids: [],
    interfaces: ["chat.completions"],
    capabilities: { tools: true },
    limits: { max_output_tokens: 1234 },
  };
}

describe("composer prediction route", () => {
  it.each(["https://openrouter.ai/api/v1", "https://ai-gateway.vercel.sh/v1"])(
    "uses the installed economy tier with the captured key at %s",
    async (endpoint) => {
      const original = { ...source, endpoint };
      const accounts = inventory();
      const target = await NativePredictionRoute.resolve(
        original,
        signal,
        accounts
      );
      expect(target).toMatchObject({
        model: nano,
        endpoint,
        credentialHome: original.credentialHome,
      });
      expect(target?.providerNetwork).toBe(original.providerNetwork);
      expect(accounts.subscription).not.toHaveBeenCalled();
      expect(accounts.gateway).not.toHaveBeenCalled();
      expect(accounts.endpoints).not.toHaveBeenCalled();
    }
  );

  it("requires current offerings for both models on the same Gateway grant", async () => {
    const original = {
      ...source,
      credentialHome: undefined,
      gatewayScope: scope,
      endpoint: "https://grida.test/api/v1/ai",
    };
    const accounts = inventory();
    accounts.gateway.mockResolvedValue([
      gatewayModel(premium),
      { ...gatewayModel(nano), capabilities: { tools: false } },
    ]);
    const target = await NativePredictionRoute.resolve(
      original,
      signal,
      accounts
    );
    expect(target).toMatchObject({
      model: nano,
      gatewayScope: scope,
      maxOutputTokens: 1234,
    });
    expect(target?.providerNetwork).toBe(original.providerNetwork);
    for (const models of [
      [gatewayModel(nano)],
      [gatewayModel(premium)],
      [gatewayModel(premium), { ...gatewayModel(nano), interfaces: [] }],
    ]) {
      accounts.gateway.mockResolvedValue(models);
      expect(
        await NativePredictionRoute.resolve(original, signal, accounts)
      ).toBeUndefined();
    }
    expect(accounts.subscription).not.toHaveBeenCalled();
  });

  it.each([OLLAMA_ENDPOINT_PRESET.base_url, "http://127.0.0.1:11434/v1"])(
    "keeps the approved local endpoint and model at %s",
    async (endpoint) => {
      const local = {
        ...source,
        configuredEndpointId: "ollama",
        endpoint,
        model: "qwen-local",
        credentialHome: undefined,
      };
      const accounts = inventory();
      accounts.endpoints.mockResolvedValue([
        { id: "ollama", base_url: endpoint, models: [{ id: local.model }] },
      ]);
      expect(await NativePredictionRoute.resolve(local, signal, accounts)).toBe(
        local
      );
      expect(
        await NativePredictionRoute.resolve(
          { ...local, model: "removed" },
          signal,
          accounts
        )
      ).toBeUndefined();
      expect(
        await NativePredictionRoute.resolve(
          { ...local, endpoint: "http://127.0.0.1:11435/v1" },
          signal,
          accounts
        )
      ).toBeUndefined();
      const remote = "https://remote.example/v1";
      accounts.endpoints.mockResolvedValue([
        { id: "ollama", base_url: remote, models: [{ id: local.model }] },
      ]);
      expect(
        await NativePredictionRoute.resolve(
          { ...local, endpoint: remote },
          signal,
          accounts
        )
      ).toBeUndefined();
      expect(
        await NativePredictionRoute.resolve(
          { ...source, configuredEndpointId: "custom" },
          signal,
          accounts
        )
      ).toBeUndefined();
      expect(
        await NativePredictionRoute.resolve(
          { ...source, endpoint: "https://custom.test/v1" },
          signal,
          accounts
        )
      ).toBeUndefined();
      expect(
        await NativePredictionRoute.resolve(
          { ...source, model: "fixture/free:free" },
          signal,
          accounts
        )
      ).toBeUndefined();
      expect(accounts.subscription).not.toHaveBeenCalled();
    }
  );

  it("preserves lower known token rates, including free, cached and long-context requests", () => {
    const target = catalog.text.byTier.nano.cost;
    expect(NativePredictionRoute.withinRates(target, target)).toBe(true);
    expect(
      NativePredictionRoute.withinRates({ input: 0, output: 0 }, target)
    ).toBe(false);
    expect(
      NativePredictionRoute.withinRates({ ...target, cacheRead: 0 }, target)
    ).toBe(false);
    expect(
      NativePredictionRoute.withinRates(
        { ...target, longContext: undefined },
        {
          ...target,
          longContext: {
            inputTokensAbove: 10000,
            inputMultiplier: 2,
            outputMultiplier: 1,
          },
        }
      )
    ).toBe(false);
  });

  it("keeps a selected ChatGPT turn on its sign-in lineage when the workspace launch uses another account", async () => {
    const subscription: NativeProviderRouteLaunch = {
      provider: "responses",
      endpoint: CHATGPT_RESPONSES_URL.slice(0, -"/responses".length),
      model: premium,
      subscriptionScope: scope,
      providerNetwork: source.providerNetwork,
    };
    const accounts = inventory();
    const prepare = vi.fn<NativeProviderRoutes.Profile["prepare"]>(
      async () => ({ launch: subscription })
    );
    const lookup = vi.fn<NativeProviderRoutes.Lookup>(async () => ({
      prepare,
    }));
    accounts.subscription.mockImplementation(async (model) => ({
      ...subscription,
      model,
    }));
    const routes = new NativeProviderRoutes(
      null,
      source,
      lookup,
      (launch, lifetime) =>
        NativePredictionRoute.resolve(launch, lifetime, accounts)
    );
    const resolve = (selection: unknown) => routes.resolve(selection, signal);
    try {
      const selected = { connectionId: "b".repeat(64), model: premium };
      const requested = { ...selected, purpose: "composerPrediction" };
      await expect(resolve(requested)).rejects.toThrow(
        "native_chat_profile_unavailable"
      );
      expect(accounts.subscription).not.toHaveBeenCalled();
      const foreground = await resolve(selected);
      const prediction = { ...requested, sourceRouteId: foreground.routeId };
      const target = await resolve(prediction);
      expect(target).toMatchObject({ kind: "chatgpt", model: nano, scope });
      expect(target.routeId).not.toBe(foreground.routeId);
      expect(await resolve(prediction)).toEqual(target);
      expect(lookup).toHaveBeenCalledTimes(1);
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(accounts.gateway).not.toHaveBeenCalled();
      accounts.subscription.mockResolvedValue({
        ...subscription,
        model: nano,
        subscriptionScope: "c".repeat(64),
      });
      await expect(resolve(prediction)).rejects.toThrow(
        "native_chat_profile_unavailable"
      );
      await expect(resolve({ ...prediction, model: nano })).rejects.toThrow(
        "native_chat_profile_unavailable"
      );
      expect(await resolve(selected)).toEqual(foreground);
      expect((await resolve({ connectionId: null, model: premium })).kind).toBe(
        "launch"
      );
    } finally {
      routes.close();
    }
  });

  it("distinguishes an implicit named worker launch from an explicit Default route with the same foreground model", async () => {
    const alternate = {
      ...source,
      endpoint: "https://ai-gateway.vercel.sh/v1",
    };
    const routes = new NativeProviderRoutes(
      scope,
      source,
      async () => ({ prepare: async () => ({ launch: alternate }) }),
      (launch, lifetime) =>
        NativePredictionRoute.resolve(launch, lifetime, inventory())
    );
    const resolve = (selection: unknown) => routes.resolve(selection, signal);
    try {
      const selection = { connectionId: null, model: premium };
      const explicit = await resolve(selection);
      const implicit = { ...selection, purpose: "composerPrediction" };
      expect(await resolve(implicit)).toMatchObject({
        endpoint: source.endpoint,
        model: nano,
      });
      expect(
        await resolve({ ...implicit, sourceRouteId: explicit.routeId })
      ).toMatchObject({ endpoint: alternate.endpoint, model: nano });
      await expect(
        resolve({
          ...implicit,
          connectionId: scope,
          sourceRouteId: explicit.routeId,
        })
      ).rejects.toThrow("native_chat_profile_unavailable");
    } finally {
      routes.close();
    }
  });

  it.each(["upload", "credential admission"] as const)(
    "revokes prediction egress during %s even when it shares the foreground model",
    async (phase) => {
      const permission = new AbortController();
      const checking = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const send = vi.fn<() => Response>(() => new Response("data: ok"));
      const launch = {
        ...source,
        providerNetwork: {
          prepare: () => async (_body: Buffer, signal: AbortSignal) => {
            checking.resolve();
            await release.promise;
            return signal.aborted ? null : send();
          },
        },
      };
      const routes = new NativeProviderRoutes(
        null,
        launch,
        undefined,
        async () => launch
      );
      const request = {
        connectionId: null,
        model: launch.model,
        purpose: "composerPrediction",
      };
      try {
        await expect(routes.resolve(request)).rejects.toThrow(
          "native_chat_profile_unavailable"
        );
        const target = await routes.resolve(request, permission.signal);
        const egress = routes.get(target.routeId)!.egress;
        const id = randomUUID();
        expect(
          await egress.exchange({
            id,
            action: "open",
            target: launch.endpoint + "/chat/completions",
            headers: [
              ["content-type", "application/json"],
              ["accept", "text/event-stream"],
            ],
            initial: Buffer.from("{}").toString("base64"),
            timeoutMs: 1000,
            maxResponseBytes: 32,
          })
        ).toEqual({ status: "accepted" });
        if (phase === "upload") permission.abort();
        const dispatched = egress.exchange({ id, action: "dispatch" });
        if (phase === "credential admission") {
          await checking.promise;
          permission.abort();
        }
        release.resolve();
        expect(await dispatched).toEqual({ status: "unavailable" });
        expect(send).not.toHaveBeenCalled();
        const next = await routes.resolve(
          request,
          new AbortController().signal
        );
        expect(next.routeId).not.toBe(target.routeId);
        expect(routes.get(target.routeId)).toBeUndefined();
      } finally {
        release.resolve();
        routes.close();
      }
    }
  );

  it("preserves a busy prediction exchange and all ordinary model slots", async () => {
    const primary = {
      ...source,
      providerNetwork: { prepare: () => async () => new Response("ok") },
    };
    const routes = new NativeProviderRoutes(
      null,
      primary,
      async (_id, model) => ({
        prepare: async () => ({ launch: { ...primary, model } }),
      }),
      async (launch) => ({ ...launch, model: nano })
    );
    const resolve = (selection: unknown) => routes.resolve(selection, signal);
    try {
      const purpose = "composerPrediction";
      const initial = await resolve({
        connectionId: null,
        model: premium,
        purpose,
      });
      const egress = routes.get(initial.routeId)!.egress;
      const id = randomUUID();
      expect(
        await egress.exchange({
          id,
          action: "open",
          target: primary.endpoint + "/chat/completions",
          headers: [
            ["content-type", "application/json"],
            ["accept", "text/event-stream"],
          ],
          initial: Buffer.from("{}").toString("base64"),
          timeoutMs: 1000,
          maxResponseBytes: 32,
        })
      ).toEqual({ status: "accepted" });
      const selection = { connectionId: scope, model: "model-0" };
      const next = await resolve(selection);
      const auxiliary = { ...selection, purpose, sourceRouteId: next.routeId };
      await expect(resolve(auxiliary)).rejects.toThrow(
        "native_chat_profile_unavailable"
      );
      // Fill the remaining 255 ordinary handles while the optional one is busy.
      for (let index = 1; index < 256; index++)
        await resolve({ ...selection, model: "model-" + index });
      await expect(
        resolve({ ...selection, model: "over-limit" })
      ).rejects.toThrow("native_chat_profile_unavailable");
      expect(routes.get(initial.routeId)?.egress).toBe(egress);
      egress.cancel({ id });
      const replacement = await resolve(auxiliary);
      expect(replacement.routeId).not.toBe(initial.routeId);
      expect(routes.get(initial.routeId)).toBeUndefined();
      expect(routes.get(next.routeId)).toBeDefined();
    } finally {
      routes.close();
    }
  });

  it("supports the bound launch on fixed chats and refuses a revoked grant even when a sibling was cached", async () => {
    const current = vi.fn<() => boolean>(() => true);
    const original = {
      ...source,
      providerNetwork: { ...source.providerNetwork!, isCurrent: current },
    };
    const accounts = inventory();
    const routes = new NativeProviderRoutes(
      null,
      original,
      undefined,
      (launch, lifetime) =>
        NativePredictionRoute.resolve(launch, lifetime, accounts)
    );
    const resolve = (selection: unknown) => routes.resolve(selection, signal);
    try {
      const selection = { connectionId: null, model: premium };
      const prediction = { ...selection, purpose: "composerPrediction" };
      await expect(resolve(selection)).rejects.toThrow(
        "native_chat_profile_unavailable"
      );
      expect(await resolve(prediction)).toMatchObject({
        kind: "http",
        model: nano,
        endpoint: original.endpoint,
      });
      await expect(
        resolve({ ...prediction, connectionId: scope })
      ).rejects.toThrow("native_chat_profile_unavailable");
      await expect(
        resolve({ ...prediction, endpoint: original.endpoint })
      ).rejects.toThrow("native_chat_profile_unavailable");
      current.mockReturnValue(false);
      await expect(resolve(prediction)).rejects.toThrow(
        "native_chat_profile_unavailable"
      );
    } finally {
      routes.close();
    }
  });
});
