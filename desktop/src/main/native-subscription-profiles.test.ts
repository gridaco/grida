// GRIDA-SEC-004 / GRIDA-SEC-008 — ordinary model selection keeps subscription custody and chat funding bound.
import { AuthStore } from "@grida/daemon/server";
import { bundledModelCatalogue, TIER_MODEL_IDS } from "@grida/ai/catalogue";
import type { ModelCatalogueSnapshot } from "@grida/ai/model-catalogue";
import { OPENAI_PROJECT_PROVIDER_ID } from "@grida/ai/providers";
import { ProviderCredentialStore } from "@grida/auth/providers";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import {
  CHATGPT_RESPONSES_URL,
  CHATGPT_TOKEN_URL,
  CHATGPT_SUBSCRIPTION_CONFIG,
} from "../chatgpt-configuration";
import { DesktopAccountSession } from "./account-session";
import { NativeWorkspaceCatalog } from "./native-workspace-catalog";
import type { NativeProviderNetwork } from "./native-provider-egress";
import { NativeChatProfiles } from "./native-chat-profiles";
import { NativeOpenAiModels } from "./native-openai-models";
import { NativeProviderSelection } from "./native-provider-selection";

const sidecar = vi.hoisted(() => ({
  nativeAgentOpenAiOffer:
    vi.fn<
      typeof import("./services-sidecar-supervisor").nativeAgentOpenAiOffer
    >(),
  selectNativeChat:
    vi.fn<typeof import("./services-sidecar-supervisor").selectNativeChat>(),
  nativeAgentSubscriptionSettings:
    vi.fn<
      typeof import("./services-sidecar-supervisor").nativeAgentSubscriptionSettings
    >(),
  nativeAgentGatewayApiKeySettings:
    vi.fn<
      typeof import("./services-sidecar-supervisor").nativeAgentGatewayApiKeySettings
    >(),
  nativeAgentGatewayConnection:
    vi.fn<
      typeof import("./services-sidecar-supervisor").nativeAgentGatewayConnection
    >(),
  findWorkspace:
    vi.fn<
      typeof import("./services-sidecar-client").servicesSidecarClient.findWorkspace
    >(),
  listProviderEndpoints:
    vi.fn<
      typeof import("./services-sidecar-client").servicesSidecarClient.listProviderEndpoints
    >(),
  nativeBuiltInByok:
    vi.fn<
      typeof import("./services-sidecar-client").servicesSidecarClient.nativeBuiltInByok
    >(),
  nativeConfiguredEndpoint:
    vi.fn<
      typeof import("./services-sidecar-client").servicesSidecarClient.nativeConfiguredEndpoint
    >(),
}));

vi.mock("./services-sidecar-supervisor", () => sidecar);
vi.mock("./services-sidecar-client", () => ({
  servicesSidecarClient: sidecar,
}));

const resources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  sidecar.nativeAgentOpenAiOffer.mockResolvedValue({ status: "missing" });
});

it("offers project billing separately from subscription and never selects it as Gateway fallback", async () => {
  const f = await subscriptionDesktop();
  try {
    sidecar.nativeAgentOpenAiOffer.mockResolvedValue({
      status: "ready",
      models: new Set(["gpt-6.2-sol"]),
      isCurrent: async () => true,
    });
    sidecar.nativeBuiltInByok.mockImplementation(
      async (provider, model, binding) => {
        if (provider !== OPENAI_PROJECT_PROVIDER_ID || !binding)
          throw new Error("fixture key absent");
        return {
          provider: "responses",
          endpoint: "https://api.openai.com/v1",
          model,
          wireModel: binding.wireModel,
          providerNetwork: { prepare: () => null },
          credentialHome: f.base,
        };
      }
    );
    const welcome = await f.agent.welcomeProfiles();
    const sol = welcome.choices.filter(({ model }) => model === "GPT-6.2 Sol");
    expect(sol.map(({ connection }) => connection)).toEqual([
      "ChatGPT Subscription",
      "OpenAI API · Project billing",
    ]);
    expect(new Set(sol.map(({ id }) => id)).size).toBe(2);
    expect(welcome.recommendedProfileId).toBe(sol[0]!.id);
    expect((await f.agent.profiles(f.workspace.id)).choices).toEqual(
      welcome.choices
    );
    expect(await f.agent.fallbackProfile()).toBeNull();

    sidecar.nativeAgentOpenAiOffer.mockResolvedValue({ status: "keyRejected" });
    expect(await f.agent.welcomeProfiles()).toMatchObject({
      choices: welcome.choices.filter(({ id }) => id !== sol[1]!.id),
      openAiIssue: "keyRejected",
    });
    sidecar.nativeAgentOpenAiOffer.mockResolvedValue({
      status: "ready",
      models: new Set(),
      isCurrent: async () => true,
    });
    expect(await f.agent.profiles(f.workspace.id)).toMatchObject({
      choices: welcome.choices.filter(({ id }) => id !== sol[1]!.id),
      openAiIssue: "noCompatibleModels",
    });
  } finally {
    await f.close();
  }
});

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "discovers a project model, streams through the staged worker and preserves its selection on removal",
  async () => {
    const f = await subscriptionDesktop();
    const home = path.join(f.base, "providers");
    const store = new ProviderCredentialStore({ home });
    const discovery = Promise.withResolvers<Response>();
    const getOpenAiModels = vi.fn<
      NonNullable<NativeProviderNetwork["getOpenAiModels"]>
    >(() => discovery.promise);
    const dispatch = vi.fn<(body: Buffer) => Promise<Response>>(async () =>
      subscriptionResponse("Project reply", "project-reply")
    );
    const prepare = vi.fn<NativeProviderNetwork["prepare"]>(() => dispatch);
    const network = async () => ({ getOpenAiModels, prepare });
    const inventory = new NativeOpenAiModels(home, network);
    let discovered: Promise<NativeOpenAiModels.Offer> | undefined;
    try {
      await store.set(OPENAI_PROJECT_PROVIDER_ID, "project-fixture-key");
      sidecar.nativeAgentOpenAiOffer.mockImplementation((waitForDiscovery) =>
        inventory.offer(waitForDiscovery)
      );
      sidecar.nativeBuiltInByok.mockImplementation((provider, model, binding) =>
        NativeProviderSelection.builtInByok(
          provider,
          model,
          {
            credentialHome: home,
            hasKey: async (id) => (await store.read(id)) !== null,
            network,
          },
          binding
        )
      );
      const pending = await f.agent.welcomeProfiles();
      expect(pending.openAiIssue).toBe("loading");
      discovered = inventory.offer();
      const subscription = pending.choices.find(
        ({ connection }) => connection === "ChatGPT Subscription"
      )!;
      await f.agent.selectProfile(
        f.workspace.id,
        { kind: "new", id: subscription.id },
        () => {}
      );
      expect(f.agent.current(f.workspace.id, subscription.id)).not.toBeNull();
      expect(sidecar.nativeAgentOpenAiOffer).not.toHaveBeenCalledWith(true);
      discovery.resolve(
        Response.json({ object: "list", data: [{ id: "gpt-6.2-sol" }] })
      );
      expect(await discovered).toMatchObject({ status: "ready" });
      const choice = (await f.agent.welcomeProfiles()).choices.find(
        ({ connection }) => connection === "OpenAI API · Project billing"
      );
      if (!choice) throw new Error("OpenAI project model was not offered");
      await f.agent.selectProfile(
        f.workspace.id,
        { kind: "new", id: choice.id },
        () => {}
      );
      const chat = f.agent.current(f.workspace.id, choice.id)!.chat;
      const session = await chat.createSelected!({
        sessionId: randomUUID(),
        requestId: randomUUID(),
        selection: {
          connectionId: choice.id,
          model: "openai/gpt-6.2-sol",
          effort: "medium",
        },
      });
      await chat.submit(
        session,
        "project-first",
        "Reply from the project",
        "act",
        undefined,
        "medium",
        1
      );
      await vi.waitFor(
        async () => {
          expect(
            await chat.inputReceipt(session, "project-first")
          ).toMatchObject({ disposition: "completed" });
        },
        { timeout: 5_000 }
      );
      expect(getOpenAiModels).toHaveBeenCalledTimes(1);
      expect(getOpenAiModels.mock.lastCall![0].get("authorization")).toBe(
        "Bearer project-fixture-key"
      );
      expect(prepare.mock.lastCall![0]).toBe(
        "https://api.openai.com/v1/responses"
      );
      expect(prepare.mock.lastCall![1].get("authorization")).toBe(
        "Bearer project-fixture-key"
      );
      expect(JSON.parse(dispatch.mock.lastCall![0].toString())).toMatchObject({
        model: "gpt-6.2-sol",
      });
      expect(f.dispatch).not.toHaveBeenCalled();

      await store.remove(OPENAI_PROJECT_PROVIDER_ID);
      const profiles = await f.agent.profiles(f.workspace.id);
      expect(profiles.saved).toContainEqual(
        expect.objectContaining({ id: choice.id, available: false })
      );
      expect(
        profiles.choices.find(({ id }) => id === choice.id)
      ).toBeUndefined();
      expect(
        profiles.choices.some(
          ({ connection }) => connection === "ChatGPT Subscription"
        )
      ).toBe(true);
    } finally {
      discovery.resolve(new Response(null, { status: 503 }));
      await discovered;
      await f.close();
    }
  },
  30_000
);

it("discovers features only on the selected live subscription receipt without starting a worker", async () => {
  const f = await subscriptionDesktop();
  try {
    await f.setSearchPolicy("automatic");
    const offers = await f.agent.welcomeProfiles();
    const sol = offers.choices.find(({ model }) => model === "GPT-6.2 Sol")!;
    const model = "openai/gpt-6.2-sol";
    const view = (profileId: string | null) =>
      f.agent.turnCapabilities(f.workspace.id, profileId, model);
    expect(await view(null)).toEqual({
      status: "unsupported",
      speeds: [],
      webSearch: false,
    });
    expect(await view("f".repeat(64))).toEqual({
      status: "unsupported",
      speeds: [],
      webSearch: false,
    });
    expect(f.getModels).toHaveBeenCalledTimes(1);
    expect(await view(sol.id)).toEqual({
      status: "available",
      speeds: ["fast", "ultrafast"],
      webSearch: true,
    });
    expect(f.getModels).toHaveBeenCalledTimes(1);
    expect(f.getModels.mock.calls[0]![0].get("chatgpt-account-id")).toBe(
      "subscription-fixture-account"
    );
    expect(f.agent.current(f.workspace.id)).toBeNull();
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.dispatch).not.toHaveBeenCalled();
    await f.seed({ lineage: "replacement", access: "another-access" });
    expect(await view(sol.id)).toEqual({
      status: "unsupported",
      speeds: [],
      webSearch: false,
    });
    expect(f.getModels).toHaveBeenCalledTimes(1);
  } finally {
    await f.close();
  }
});

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "offers only discoverable, compatible subscription models on Welcome and in an ordinary workspace",
  async () => {
    const fixture = await subscriptionDesktop();
    try {
      const welcome = await fixture.agent.welcomeProfiles();
      const workspace = await fixture.agent.profiles(fixture.workspace.id);
      expect(welcome.choices.map(({ model }) => model)).toEqual([
        "GPT-6.2 Sol",
        "GPT-5.6 Terra",
        "GPT-6 Luna",
      ]);
      expect(fixture.getModels).toHaveBeenCalledTimes(1);
      expect(workspace.choices).toEqual(welcome.choices);
      expect(workspace.saved).toEqual([]);
      expect(welcome.recommendedProfileId).toBe(welcome.choices[0].id);
      expect(CHATGPT_SUBSCRIPTION_CONFIG.default_model_id).toBe(
        "openai/gpt-6.2-sol"
      );
      expect(welcome.choices[0].model).toBe("GPT-6.2 Sol");
      expect(workspace.recommendedProfileId).toBe(welcome.recommendedProfileId);
      for (const choice of welcome.choices) {
        expect(choice).toMatchObject({
          id: expect.stringMatching(/^[a-f0-9]{64}$/),
          connection: "ChatGPT Subscription",
          imageInput: true,
          reasoning: true,
          ultra: true,
        });
        expect(
          Object.keys(choice)
            .filter((key) => key !== "contextWindow")
            .sort()
        ).toEqual(
          [
            "id",
            "connection",
            "model",
            "imageInput",
            "reasoning",
            "ultra",
          ].sort()
        );
      }
      expect(new Set(welcome.choices.map(({ id }) => id)).size).toBe(
        welcome.choices.length
      );
      const publicCatalog = JSON.stringify({ welcome, workspace });
      for (const privateValue of [
        fixture.base,
        "subscription-fixture-access",
        "subscription-fixture-refresh",
        "subscription-fixture-account",
        "subscription-fixture-lineage",
      ])
        expect(publicCatalog).not.toContain(privateValue);
      expect(fixture.agent.current(fixture.workspace.id)).toBeNull();
      expect(fixture.prepare).not.toHaveBeenCalled();
      expect(fixture.dispatch).not.toHaveBeenCalled();
      expect(fixture.accountHttp).not.toHaveBeenCalled();
      expect(sidecar.nativeAgentGatewayConnection).not.toHaveBeenCalled();
      expect(fixture.browser).not.toHaveBeenCalled();
    } finally {
      await fixture.close();
    }
  }
);

it("distinguishes an empty subscription offer, a discovery outage and an expired sign-in", async () => {
  const f = await subscriptionDesktop();
  try {
    f.getModels.mockResolvedValueOnce(Response.json({ models: [] }));
    const empty = await f.agent.welcomeProfiles();
    expect(empty.choices).toEqual([]);
    expect(empty).not.toHaveProperty("subscriptionIssue");

    await f.seed({ lineage: "outage" });
    f.getModels.mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect(await f.agent.welcomeProfiles()).toMatchObject({
      choices: [],
      subscriptionIssue: "unavailable",
    });
    expect(await f.agent.profiles(f.workspace.id)).toMatchObject({
      choices: [],
      subscriptionIssue: "unavailable",
    });
    expect(f.getModels).toHaveBeenCalledTimes(2);
    expect(f.prepare).not.toHaveBeenCalled();

    await f.seed({ lineage: "revoked", expires: 1 });
    f.prepare.mockImplementationOnce((target) =>
      target === CHATGPT_TOKEN_URL
        ? async () => Response.json({ error: "invalid_grant" }, { status: 400 })
        : null
    );
    expect(await f.agent.welcomeProfiles()).toMatchObject({
      choices: [],
      subscriptionIssue: "reauthenticationRequired",
    });
    expect(f.dispatch).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "runs a newly published subscription selector and preserves its queued binding across a catalogue update",
  async () => {
    const f = await subscriptionDesktop();
    const seed = bundledModelCatalogue();
    const model = "openai/catalogue-fixture";
    const label = "Catalogue fixture";
    const first = "subscription-fixture-a";
    const second = "subscription-fixture-b";
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPg/88AAAIvAQ+3s0AMAAAAAElFTkSuQmCC";
    const source = seed.text["openai/gpt-6.2-sol"]!;
    const publish = (selector: string, version: string) =>
      f.publish({
        version,
        text: {
          ...seed.text,
          [model]: {
            ...source,
            id: model,
            label,
            bindings: {
              openai: { ...source.bindings.openai!, wireModel: "api-fixture" },
            },
          },
        },
        agents: {
          ...seed.agents,
          "openai-codex": {
            ...seed.agents["openai-codex"],
            [selector]: {
              canonicalModelId: model,
              serviceTiers: { fast: "priority" },
            },
          },
        },
      });
    let release: (() => void) | undefined;
    try {
      f.getModels.mockImplementation(async () =>
        Response.json({
          models: [first, second].map((slug) => ({
            slug,
            visibility: "list",
            service_tiers: [{ id: "priority" }],
          })),
        })
      );
      expect((await f.agent.welcomeProfiles()).choices).toEqual([]);
      publish(first, "2.20990101.1");
      const { choices } = await f.agent.welcomeProfiles();
      expect(choices).toHaveLength(1);
      const [choice] = choices;
      expect(choice).toMatchObject({
        connection: "ChatGPT Subscription",
        model: label,
      });
      await f.agent.selectProfile(
        f.workspace.id,
        { kind: "new", id: choice.id },
        () => {}
      );
      const chat = f.agent.current(f.workspace.id, choice.id)!.chat;
      if (!chat.createSelected) throw new Error("selection not negotiated");
      const session = await chat.createSelected({
        sessionId: randomUUID(),
        requestId: randomUUID(),
        selection: {
          connectionId: choice.id,
          model,
          effort: "high",
          speed: "fast",
        },
      });
      const gate = new Promise<void>((done) => {
        release = done;
      });
      f.dispatch.mockImplementationOnce(async () => {
        await gate;
        return subscriptionResponse("Ready.", "first-answer");
      });
      await chat.submit(
        session,
        "first",
        "Start here",
        "act",
        undefined,
        "high",
        1
      );
      await vi.waitFor(() => expect(f.dispatch).toHaveBeenCalledTimes(1));
      await chat.submitImage(session, {
        action: "enqueue",
        inputId: "queued",
        text: "Describe the image",
        operatingRegime: "act",
        png: Uint8Array.from(Buffer.from(png, "base64")).buffer,
        selectionRevision: 1,
        effort: "high",
      });
      publish(second, "2.20990102.1");
      release?.();
      const wait = (id: string) =>
        vi.waitFor(
          async () => {
            expect(await chat.inputReceipt(session, id)).toMatchObject({
              disposition: "completed",
            });
          },
          { timeout: 5000 }
        );
      await wait("queued");
      await chat.submit(
        session,
        "next",
        "Continue",
        "act",
        undefined,
        "high",
        1
      );
      await wait("next");
      const requests = f.dispatch.mock.calls.map(([body]) =>
        JSON.parse(body.toString())
      );
      expect(requests.map((request) => request.model)).toEqual([
        first,
        first,
        second,
      ]);
      expect(requests.map((request) => request.service_tier)).toEqual([
        "priority",
        "priority",
        "priority",
      ]);
      expect(JSON.stringify(requests[1].input)).toContain(
        `data:image/png;base64,${png}`
      );
      expect(f.getModels).toHaveBeenCalledTimes(1);
      expect((await f.agent.profiles(f.workspace.id)).saved).toContainEqual({
        ...choice,
        available: true,
      });
    } finally {
      release?.();
      await f.close();
    }
  },
  30_000
);

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "keeps retired saved subscription rows unavailable and refuses selection without replacing the current connection",
  async () => {
    const fixture = await subscriptionDesktop();
    try {
      const choice = (await fixture.agent.welcomeProfiles()).choices[0];
      await fixture.agent.selectProfile(
        fixture.workspace.id,
        { kind: "new", id: choice.id },
        () => {}
      );
      const owner = fixture.agent.current(fixture.workspace.id, choice.id);
      expect(owner).not.toBeNull();
      const files = (
        await fs.readdir(fixture.base, { recursive: true })
      ).filter((filename) =>
        filename.endsWith(`${path.sep}chat-profiles.json`)
      );
      expect(files).toHaveLength(1);
      const filename = path.join(fixture.base, files[0]);
      const saved = JSON.parse(await fs.readFile(filename, "utf8"));
      const scope = await fixture.scope();
      const retired = ["openai/gpt-5.5", "openai/gpt-5.4"].map((modelId) => ({
        ...saved[0],
        id: NativeChatProfiles.subscriptionBinding(scope, modelId),
        modelId,
        model: modelId.replace(/^openai\/gpt-/, "GPT-"),
      }));
      await fs.writeFile(filename, JSON.stringify([...saved, ...retired]));
      const profiles = await fixture.agent.profiles(fixture.workspace.id);
      expect(profiles.saved.find(({ id }) => id === choice.id)).toMatchObject({
        available: true,
      });
      for (const entry of retired) {
        expect(profiles.saved.find(({ id }) => id === entry.id)).toMatchObject({
          model: entry.model,
          available: false,
        });
        expect(profiles.choices.some(({ id }) => id === entry.id)).toBe(false);
        for (const kind of ["saved", "new"] as const)
          await expect(
            fixture.agent.selectProfile(
              fixture.workspace.id,
              { kind, id: entry.id },
              () => {}
            )
          ).rejects.toThrow("native_chat_profile_unavailable");
        expect(fixture.agent.current(fixture.workspace.id, choice.id)).toBe(
          owner
        );
      }
      expect(JSON.parse(await fs.readFile(filename, "utf8"))).toEqual([
        ...saved,
        ...retired,
      ]);
      expect(fixture.prepare).not.toHaveBeenCalled();
      expect(fixture.dispatch).not.toHaveBeenCalled();
      expect(fixture.accountHttp).not.toHaveBeenCalled();
      expect(sidecar.nativeAgentGatewayConnection).not.toHaveBeenCalled();
    } finally {
      await fixture.close();
    }
  },
  30_000
);

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "uses the subscription economy model for a prediction with OpenRouter also connected",
  async () => {
    const fixture = await subscriptionDesktop();
    const openrouter = vi.fn<NativeProviderNetwork["prepare"]>(() => null);
    sidecar.nativeBuiltInByok.mockImplementation(async (provider, model) => {
      if (provider !== "openrouter") throw new Error("fixture key absent");
      return {
        provider: "openai-compatible",
        endpoint: "https://openrouter.ai/api/v1",
        credentialHome: path.join(fixture.base, "providers"),
        providerNetwork: { prepare: openrouter },
        model,
      };
    });
    try {
      await fixture.setSearchPolicy("automatic");
      const profiles = await fixture.agent.welcomeProfiles();
      expect(profiles.choices.some((p) => p.connection === "OpenRouter")).toBe(
        true
      );
      const foreground = profiles.choices.find(
        (p) =>
          p.connection === "ChatGPT Subscription" && p.model === "GPT-6.2 Sol"
      )!;
      await fixture.agent.selectProfile(
        fixture.workspace.id,
        { kind: "new", id: foreground.id },
        () => {}
      );
      const chat = fixture.agent.current(
        fixture.workspace.id,
        foreground.id
      )!.chat;
      if (!chat.createSelected) throw new Error("selection not negotiated");
      const session = await chat.createSelected({
        sessionId: randomUUID(),
        requestId: randomUUID(),
        selection: {
          connectionId: foreground.id,
          model: "openai/gpt-6.2-sol",
          effort: "high",
          speed: "fast",
        },
      });
      const send = async (id: string, prompt: string, webSearch?: true) => {
        await chat.submit(
          session,
          id,
          prompt,
          undefined,
          undefined,
          "high",
          1,
          undefined,
          webSearch
        );
        return vi.waitFor(
          async () => {
            expect(await chat.inputReceipt(session, id)).toMatchObject({
              disposition: "completed",
            });
            return chat.observe(session);
          },
          { timeout: 5000 }
        );
      };
      const reply = await send(
        "outline",
        "Outline the slide. The speaker notes come next.",
        true
      );
      fixture.dispatch.mockResolvedValueOnce(
        subscriptionResponse("Write the speaker notes.", "suggestion")
      );
      if (!chat.predictPrompt) throw new Error("prediction not negotiated");
      expect(await chat.predictPrompt(session, reply)).toBe(
        "Write the speaker notes."
      );
      expect(await chat.predictPrompt(session, reply)).toBeNull();
      await send("notes", "Write the speaker notes.");
      const requests = fixture.dispatch.mock.calls.map(([body]) =>
        JSON.parse(body.toString())
      );
      expect(requests.map((r) => r.model)).toEqual([
        "gpt-6.2-sol",
        TIER_MODEL_IDS.nano.replace(/^openai\//, ""),
        "gpt-6.2-sol",
      ]);
      expect(requests[0].service_tier).toBe("priority");
      expect(requests[0].tools).toContainEqual({
        type: "web_search",
        external_web_access: true,
      });
      expect(requests[2].service_tier).toBe("priority");
      expect(requests[2].tools).not.toContainEqual(
        expect.objectContaining({ type: "web_search" })
      );
      expect(requests[2].reasoning?.effort).toBe("high");
      expect(requests[1].tools ?? []).toEqual([]);
      expect(requests[1]).not.toHaveProperty("service_tier");
      for (const [url, headers] of fixture.prepare.mock.calls) {
        expect(url).toBe(CHATGPT_RESPONSES_URL);
        expect(headers.get("chatgpt-account-id")).toBe(
          "subscription-fixture-account"
        );
      }
      expect(
        (await fixture.agent.profiles(fixture.workspace.id)).saved.map(
          (p) => p.id
        )
      ).toEqual([foreground.id]);
      expect(openrouter).not.toHaveBeenCalled();
      expect(sidecar.nativeAgentGatewayConnection).not.toHaveBeenCalled();
    } finally {
      await fixture.close();
    }
  },
  30_000
);

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "captures a queued accelerated search, restores its sources and sends the next turn on the edited selection",
  async () => {
    const f = await subscriptionDesktop();
    let release: (() => void) | undefined;
    try {
      await f.setSearchPolicy("automatic");
      const { choices } = await f.agent.welcomeProfiles();
      const sol = choices.find(
        (p) =>
          p.connection === "ChatGPT Subscription" && p.model === "GPT-6.2 Sol"
      )!;
      const terra = choices.find(
        (p) =>
          p.connection === "ChatGPT Subscription" && p.model === "GPT-5.6 Terra"
      )!;
      await f.agent.selectProfile(
        f.workspace.id,
        { kind: "new", id: sol.id },
        () => {}
      );
      const chat = f.agent.current(f.workspace.id, sol.id)!.chat;
      if (!chat.createSelected || !chat.selectionRequest)
        throw new Error("missing chat selection");
      const selected = {
        connectionId: sol.id,
        model: "openai/gpt-6.2-sol",
        effort: "high" as const,
        speed: "ultrafast" as const,
      };
      const session = await chat.createSelected({
        sessionId: randomUUID(),
        requestId: randomUUID(),
        selection: selected,
      });
      const edit = (revision: number, selection: Record<string, unknown>) =>
        chat.selectionRequest!("update", session.id, {
          operationId: randomUUID(),
          expectedRevision: revision,
          selection,
        });
      const waitInput = (id: string) =>
        vi.waitFor(
          async () => {
            expect((await chat.inputReceipt(session, id)).disposition).toBe(
              "completed"
            );
          },
          { timeout: 10000 }
        );
      // Hold the first dispatch until the queued input and later model edit are durable.
      const gate = new Promise<void>((done) => {
        release = done;
      });
      f.dispatch.mockImplementationOnce(async () => {
        await gate;
        return subscriptionResponse("Ready.", "first-answer");
      });
      await chat.submit(
        session,
        "first",
        "Start here",
        "act",
        undefined,
        "high",
        1
      );
      await vi.waitFor(() => expect(f.dispatch).toHaveBeenCalledTimes(1), {
        timeout: 5000,
      });
      await edit(1, { ...selected, speed: "fast" });
      await chat.enqueue(
        session,
        "queued-search",
        "Find the specification",
        "act",
        undefined,
        "high",
        2,
        undefined,
        true
      );
      await edit(2, {
        connectionId: terra.id,
        model: "openai/gpt-5.6-terra",
        effort: "low",
      });
      const search = {
        type: "web_search_call",
        id: "ws_1",
        status: "completed",
        action: { type: "search", query: "RFC 9110" },
      };
      const answer = {
        type: "message",
        id: "cited-answer",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: "RFC 9110",
            annotations: [
              {
                type: "url_citation",
                title: "HTTP Semantics",
                url: "https://www.rfc-editor.org/rfc/rfc9110",
                start_index: 0,
                end_index: 8,
              },
            ],
          },
        ],
      };
      const events = [
        {
          type: "response.output_item.added",
          item: { ...search, status: "in_progress" },
        },
        { type: "response.output_item.done", output_index: 0, item: search },
        {
          type: "response.output_text.delta",
          item_id: answer.id,
          delta: "RFC 9110",
        },
        { type: "response.output_item.done", output_index: 1, item: answer },
        {
          type: "response.completed",
          response: {
            status: "completed",
            service_tier: "default",
            output: [search, answer],
            usage: { input_tokens: 5, output_tokens: 3 },
          },
        },
      ];
      f.dispatch.mockResolvedValueOnce(
        new Response(
          events.map((e) => "data: " + JSON.stringify(e) + "\n\n").join(""),
          { headers: { "content-type": "text/event-stream" } }
        )
      );
      release?.();
      await waitInput("queued-search");
      const requests = () =>
        f.dispatch.mock.calls.map(([body]) => JSON.parse(body.toString()));
      expect(requests()).toHaveLength(2);
      expect(requests()[0].service_tier).toBe("ultrafast");
      expect(
        requests()[0].tools.every(
          (tool: { type: string }) => tool.type === "function"
        )
      ).toBe(true);
      expect(requests()[1]).toMatchObject({
        model: "gpt-6.2-sol",
        service_tier: "priority",
        reasoning: { effort: "high" },
      });
      expect(requests()[1].tools).toEqual(
        expect.arrayContaining([
          { type: "web_search", external_web_access: true },
          expect.objectContaining({ type: "function" }),
        ])
      );
      const checkEvidence = (
        messages: Awaited<ReturnType<typeof chat.transcript>>
      ) => {
        expect(messages.find((m) => m.text === "RFC 9110")?.citations).toEqual([
          {
            url: "https://www.rfc-editor.org/rfc/rfc9110",
            title: "HTTP Semantics",
            startIndex: 0,
            endIndex: 8,
          },
        ]);
        expect(
          messages
            .flatMap((m) => m.activity ?? [])
            .filter((a) => a.source === "provider")
        ).toMatchObject([{ kind: "search", title: "web_search" }]);
      };
      expect(chat.transcriptPage).toBeDefined();
      checkEvidence((await chat.transcriptPage!(session)).messages);
      await chat.submit(
        session,
        "next",
        "Continue",
        "act",
        undefined,
        "low",
        3
      );
      await waitInput("next");
      expect(requests()[2]).toMatchObject({
        model: "gpt-5.6-terra",
        reasoning: { effort: "low" },
      });
      expect(requests()[2]).not.toHaveProperty("service_tier");
      expect(
        requests()[2].tools.every(
          (tool: { type: string }) => tool.type === "function"
        )
      ).toBe(true);
      await f.reopen();
      await f.agent.selectProfile(
        f.workspace.id,
        { kind: "saved", id: sol.id },
        () => {}
      );
      const restored = f.agent.current(f.workspace.id, sol.id)!.chat;
      checkEvidence(
        (await restored.transcriptPage!(await restored.load(session.id)))
          .messages
      );
      expect(f.dispatch).toHaveBeenCalledTimes(3);
    } finally {
      release?.();
      await f.close();
    }
  },
  30000
);

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "refuses a search before admission when optional capabilities are malformed and still sends Standard",
  async () => {
    const f = await subscriptionDesktop();
    try {
      await f.setSearchPolicy("automatic");
      f.getModels.mockImplementation(async () =>
        Response.json({
          models: [
            {
              slug: "gpt-6.2-sol",
              visibility: "list",
              service_tiers: "malformed",
            },
          ],
        })
      );
      const choice = (await f.agent.welcomeProfiles()).choices.find(
        (p) =>
          p.connection === "ChatGPT Subscription" && p.model === "GPT-6.2 Sol"
      )!;
      await f.agent.selectProfile(
        f.workspace.id,
        { kind: "new", id: choice.id },
        () => {}
      );
      const chat = f.agent.current(f.workspace.id, choice.id)!.chat;
      if (!chat.createSelected) throw new Error("missing chat selection");
      const session = await chat.createSelected({
        sessionId: randomUUID(),
        requestId: randomUUID(),
        selection: {
          connectionId: choice.id,
          model: "openai/gpt-6.2-sol",
          effort: "high",
        },
      });
      expect(f.getModels).toHaveBeenCalledTimes(1);
      const inputId = randomUUID();
      await expect(
        chat.submit(
          session,
          inputId,
          "Search",
          "act",
          undefined,
          "high",
          1,
          undefined,
          true
        )
      ).rejects.toThrow(/chat_turn_capabilities_unavailable/);
      await expect(chat.inputReceipt(session, inputId)).rejects.toThrow(
        "input_unavailable"
      );
      expect(f.dispatch).not.toHaveBeenCalled();
      // The rejected send never took ownership of the input identity.
      await chat.submit(
        session,
        inputId,
        "Search",
        "act",
        undefined,
        "high",
        1
      );
      await vi.waitFor(
        async () =>
          expect((await chat.inputReceipt(session, inputId)).disposition).toBe(
            "completed"
          ),
        { timeout: 5000 }
      );
      expect(f.getModels).toHaveBeenCalledTimes(1);
      expect(f.dispatch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(f.dispatch.mock.calls[0][0].toString());
      expect(body).not.toHaveProperty("service_tier");
      expect(
        body.tools.every((tool: { type: string }) => tool.type === "function")
      ).toBe(true);
    } finally {
      await f.close();
    }
  },
  30000
);

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "keeps selected Fast with a retired TOML flag and applies Web search policy separately",
  async () => {
    const f = await subscriptionDesktop();
    try {
      await f.setSearchPolicy(undefined, false);
      const choice = (await f.agent.welcomeProfiles()).choices.find(
        (p) =>
          p.connection === "ChatGPT Subscription" && p.model === "GPT-6.2 Sol"
      )!;
      await f.agent.selectProfile(
        f.workspace.id,
        { kind: "new", id: choice.id },
        () => {}
      );
      const chat = f.agent.current(f.workspace.id, choice.id)!.chat;
      if (!chat.createSelected) throw new Error("missing chat selection");
      const session = await chat.createSelected({
        sessionId: randomUUID(),
        requestId: randomUUID(),
        selection: {
          connectionId: choice.id,
          model: "openai/gpt-6.2-sol",
          effort: "medium",
          speed: "fast",
        },
      });
      const send = async (search?: true) => {
        const id = randomUUID();
        await chat.submit(
          session,
          id,
          "Summarize",
          "act",
          undefined,
          "medium",
          1,
          undefined,
          search
        );
        await vi.waitFor(
          async () =>
            expect((await chat.inputReceipt(session, id)).disposition).toBe(
              "completed"
            ),
          { timeout: 5000 }
        );
        return JSON.parse(f.dispatch.mock.calls.at(-1)![0].toString());
      };
      const searchDenied =
        /chat_turn_options_unsupported|chat_web_search_unavailable/;
      let body = await send(true);
      expect(body.service_tier).toBe("priority");
      expect(body.tools).toContainEqual({
        type: "web_search",
        external_web_access: true,
      });
      await f.setSearchPolicy("automatic", false);
      body = await send(true);
      expect(body.service_tier).toBe("priority");
      expect(body.tools).toContainEqual({
        type: "web_search",
        external_web_access: true,
      });
      body = await send();
      expect(body.tools).not.toContainEqual(
        expect.objectContaining({ type: "web_search" })
      );
      for (const policy of ["on_demand", "cached", "indexed", "disabled"]) {
        await f.setSearchPolicy(policy, false);
        await expect(send(true)).rejects.toThrow(searchDenied);
      }
      body = await send();
      expect(body.service_tier).toBe("priority");
      expect(
        body.tools.every((t: { type: string }) => t.type === "function")
      ).toBe(true);
      expect(f.dispatch).toHaveBeenCalledTimes(4);
    } finally {
      await f.close();
    }
  },
  30000
);

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "runs the exact selected subscription model and reopens its saved chat after token rotation and Desktop restart",
  async () => {
    const fixture = await subscriptionDesktop();
    try {
      const choice = (await fixture.agent.welcomeProfiles()).choices.find(
        ({ model }) => model === "GPT-5.6 Terra"
      )!;
      expect(CHATGPT_SUBSCRIPTION_CONFIG.default_model_id).not.toBe(
        "openai/gpt-5.6-terra"
      );
      await fixture.agent.selectProfile(
        fixture.workspace.id,
        { kind: "new", id: choice.id },
        () => {}
      );
      const chat = fixture.agent.current(fixture.workspace.id, choice.id)!.chat;
      expect(chat.acceptsPng).toBe(true);
      expect(chat.acceptsEffort).toBe(true);
      expect(chat.acceptsGoalEffort).toBe(true);
      const session = await chat.create();
      await chat.submit(
        session,
        "first-subscription-input",
        "Use the selected model.",
        undefined,
        undefined,
        "high"
      );
      await vi.waitFor(
        async () =>
          expect(await chat.observe(session)).toMatchObject({
            latest: { status: "succeeded" },
          }),
        { timeout: 5000 }
      );
      expect(fixture.dispatch).toHaveBeenCalledTimes(1);
      const request = JSON.parse(fixture.dispatch.mock.calls[0][0].toString());
      expect(request).toMatchObject({
        model: "gpt-5.6-terra",
        stream: true,
        store: false,
        instructions: expect.any(String),
        reasoning: { effort: "high" },
        include: ["reasoning.encrypted_content"],
      });
      expect(request).not.toHaveProperty("max_output_tokens");
      expect(request).not.toHaveProperty("context_management");
      expect(request.tools.length).toBeGreaterThan(0);
      expect(
        request.tools.every(({ type }: { type: string }) => type === "function")
      ).toBe(true);
      expect(request.input).toContainEqual(
        expect.objectContaining({ role: "user" })
      );
      expect(
        request.input.some(({ role }: { role?: string }) => role === "system")
      ).toBe(false);
      expect(fixture.prepare.mock.calls[0][0]).toBe(CHATGPT_RESPONSES_URL);
      expect(Object.fromEntries(fixture.prepare.mock.calls[0][1])).toEqual({
        accept: "text/event-stream",
        "content-type": "application/json",
        authorization: "Bearer subscription-fixture-access",
        "chatgpt-account-id": "subscription-fixture-account",
        "openai-beta": "responses=experimental",
        originator: "grida",
      });
      await fixture.seed({ access: "subscription-rotated-access" });
      expect((await fixture.agent.welcomeProfiles()).choices).toContainEqual(
        choice
      );
      await chat.submit(
        session,
        "rotated-subscription-input",
        "Continue with the rotated token."
      );
      await vi.waitFor(
        async () => {
          expect(
            await chat.inputReceipt(session, "rotated-subscription-input")
          ).toMatchObject({
            disposition: "completed",
          });
          expect(await chat.observe(session)).toMatchObject({
            latest: { status: "succeeded" },
          });
        },
        { timeout: 5000 }
      );
      expect(fixture.prepare.mock.calls[1][1].get("authorization")).toBe(
        "Bearer subscription-rotated-access"
      );
      await fixture.reopen();
      expect(
        (await fixture.agent.profiles(fixture.workspace.id)).saved
      ).toContainEqual({
        ...choice,
        available: true,
      });
      await fixture.agent.selectProfile(
        fixture.workspace.id,
        { kind: "saved", id: choice.id },
        () => {}
      );
      const restored = fixture.agent.current(
        fixture.workspace.id,
        choice.id
      )!.chat;
      const reopened = await restored.load(session.id);
      expect(
        (await restored.transcript(reopened)).map(({ text }) => text)
      ).toContain("Subscription fixture reply.");
      expect(fixture.dispatch).toHaveBeenCalledTimes(2);
      await restored.submit(
        reopened,
        "reopened-subscription-input",
        "Continue the saved chat."
      );
      await vi.waitFor(
        async () => {
          expect(
            await restored.inputReceipt(reopened, "reopened-subscription-input")
          ).toMatchObject({
            disposition: "completed",
          });
          expect(await restored.observe(reopened)).toMatchObject({
            latest: { status: "succeeded" },
          });
        },
        { timeout: 5000 }
      );
      expect(fixture.dispatch).toHaveBeenCalledTimes(3);
      for (const [body] of fixture.dispatch.mock.calls)
        expect(JSON.parse(body.toString()).model).toBe("gpt-5.6-terra");
      const followup = JSON.parse(fixture.dispatch.mock.calls[2][0].toString());
      expect(JSON.stringify(followup.input)).toContain(
        "Use the selected model."
      );
      expect(JSON.stringify(followup.input)).toContain(
        "Subscription fixture reply."
      );
      expect(fixture.accountHttp).not.toHaveBeenCalled();
      expect(sidecar.nativeAgentGatewayConnection).not.toHaveBeenCalled();
    } finally {
      await fixture.close();
    }
  },
  30_000
);

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "refuses stale saved subscriptions, accepts an explicit idle account change and withdraws work on sign-out",
  async () => {
    const fixture = await subscriptionDesktop();
    try {
      const original = (await fixture.agent.welcomeProfiles()).choices[0];
      await fixture.agent.selectProfile(
        fixture.workspace.id,
        { kind: "new", id: original.id },
        () => {}
      );
      const oldChat = fixture.agent.current(
        fixture.workspace.id,
        original.id
      )!.chat;
      const session = await oldChat.create();
      await oldChat.submit(
        session,
        "original-subscription-input",
        "Keep this chat with its account."
      );
      await vi.waitFor(
        async () =>
          expect(await oldChat.observe(session)).toMatchObject({
            latest: { status: "succeeded" },
          }),
        { timeout: 5000 }
      );
      for (const connection of [
        { lineage: "subscription-reconnected-lineage" },
        {
          accountId: "subscription-other-account",
          lineage: "subscription-other-lineage",
        },
      ]) {
        await fixture.seed(connection);
        const profiles = await fixture.agent.profiles(fixture.workspace.id);
        expect(profiles.choices.map(({ id }) => id)).not.toContain(original.id);
        expect(profiles.saved).toContainEqual(
          expect.objectContaining({
            id: original.id,
            connection: original.connection,
            model: original.model,
            available: false,
          })
        );
        await expect(
          fixture.agent.selectProfile(
            fixture.workspace.id,
            { kind: "saved", id: original.id },
            () => {}
          )
        ).rejects.toThrow("native_chat_profile_changed");
        expect(fixture.dispatch).toHaveBeenCalledTimes(1);
      }

      const replacement = (await fixture.agent.welcomeProfiles()).choices[0];
      await fixture.agent.selectProfile(
        fixture.workspace.id,
        { kind: "new", id: replacement.id },
        () => {}
      );
      const current = fixture.agent.current(
        fixture.workspace.id,
        replacement.id
      )!.chat;
      const previous = await current.load(session.id);
      await current.submit(
        previous,
        "changed-account-input",
        "Continue with another account."
      );
      await vi.waitFor(async () =>
        expect(await current.observe(previous)).toMatchObject({
          current: null,
          latest: { status: "succeeded" },
        })
      );
      expect(fixture.dispatch).toHaveBeenCalledTimes(2);
      const continued = JSON.parse(
        fixture.dispatch.mock.calls[1][0].toString()
      );
      expect(JSON.stringify(continued.input)).toContain(
        "Keep this chat with its account."
      );
      await fixture.agent.chatgptOAuth!.signOut();
      expect(
        fixture.agent.current(fixture.workspace.id, replacement.id)
      ).toBeNull();
      await expect(current.create()).rejects.toThrow("native_chat_closed");
      expect((await fixture.agent.welcomeProfiles()).choices).toEqual([]);
      const signedOut = await fixture.agent.profiles(fixture.workspace.id);
      expect(signedOut.choices).toEqual([]);
      expect(signedOut).not.toHaveProperty("recommendedProfileId");
      expect(signedOut.saved.every(({ available }) => !available)).toBe(true);
      await expect(
        fixture.agent.selectProfile(
          fixture.workspace.id,
          { kind: "new", id: replacement.id },
          () => {}
        )
      ).rejects.toThrow("native_chat_profile_unavailable");
      await expect(
        fixture.agent.selectProfile(
          fixture.workspace.id,
          { kind: "saved", id: original.id },
          () => {}
        )
      ).rejects.toMatchObject({ code: "chatgpt_not_signed_in" });
      expect(fixture.dispatch).toHaveBeenCalledTimes(2);
      expect(fixture.accountHttp).not.toHaveBeenCalled();
      expect(sidecar.nativeAgentGatewayConnection).not.toHaveBeenCalled();
    } finally {
      await fixture.close();
    }
  },
  30_000
);

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "runs an Ultra independent reviewer through the selected ordinary subscription without sharing parent context or adding a token cap",
  async () => {
    const fixture = await subscriptionDesktop();
    const parentText =
      "Parent-only project background: review the proposed structure.";
    const assignment =
      "Independently inspect the proposed structure for a missing assumption.";
    const finding =
      "The independent subscription reviewer found the missing assumption.";
    const reviewed =
      "The parent integrated the independent subscription finding.";
    const parentRequests: Record<string, unknown>[] = [];
    const childRequests: Record<string, unknown>[] = [];
    let responseSequence = 0;
    fixture.dispatch.mockImplementation(async (body) => {
      const request = JSON.parse(body.toString());
      const id = `ultra-subscription-${++responseSequence}`;
      const parent = request.tools?.some(
        ({ name }: { name: string }) => name === "collect_review"
      );
      if (!parent) {
        childRequests.push(request);
        return subscriptionResponse(finding, id);
      }
      parentRequests.push(request);
      if (parentRequests.length === 1)
        return subscriptionResponse(
          { name: "delegate_review", arguments: { instructions: assignment } },
          id
        );
      if (JSON.stringify(request.input).includes(finding))
        return subscriptionResponse(reviewed, id);
      if (parentRequests.length > 8)
        throw new Error(
          "fixture review was not collected within its allowance"
        );
      return subscriptionResponse(
        { name: "collect_review", arguments: {} },
        id
      );
    });
    try {
      const choice = (await fixture.agent.welcomeProfiles()).choices.find(
        ({ model }) => model === "GPT-5.6 Terra"
      )!;
      expect(choice).toMatchObject({ reasoning: true, ultra: true });
      await fixture.agent.selectProfile(
        fixture.workspace.id,
        { kind: "new", id: choice.id },
        () => {}
      );
      const chat = fixture.agent.current(fixture.workspace.id, choice.id)!.chat;
      expect(chat.acceptsEffort).toBe(true);
      expect(chat.acceptsGoalEffort).toBe(true);
      const session = await chat.create();
      await chat.submit(
        session,
        "ultra-subscription-review",
        parentText,
        "act",
        undefined,
        "ultra"
      );
      await vi.waitFor(
        async () => {
          expect(
            await chat.inputReceipt(session, "ultra-subscription-review")
          ).toMatchObject({
            disposition: "completed",
          });
          expect(await chat.observe(session)).toMatchObject({
            latest: { status: "succeeded" },
          });
        },
        { timeout: 10_000 }
      );
      expect(childRequests).toHaveLength(1);
      expect(parentRequests.length).toBeGreaterThanOrEqual(3);
      expect(parentRequests[0]).toMatchObject({
        reasoning: { effort: "xhigh" },
      });
      expect(JSON.stringify(childRequests[0].input)).toContain(assignment);
      expect(JSON.stringify(childRequests[0])).not.toContain(parentText);
      expect(JSON.stringify(childRequests[0])).not.toContain(
        "Ultra effort is active"
      );
      expect(JSON.stringify(parentRequests.at(-1)!.input)).toContain(finding);
      expect(
        (await chat.transcript(session)).map(({ text }) => text)
      ).toContain(reviewed);
      for (const [body] of fixture.dispatch.mock.calls) {
        const request = JSON.parse(body.toString());
        expect(request).toMatchObject({
          model: "gpt-5.6-terra",
          stream: true,
          store: false,
          instructions: expect.any(String),
          include: ["reasoning.encrypted_content"],
        });
        expect(request).not.toHaveProperty("max_output_tokens");
        expect(request).not.toHaveProperty("context_management");
      }
      expect(fixture.prepare.mock.calls).toHaveLength(
        fixture.dispatch.mock.calls.length
      );
      for (const [target, headers] of fixture.prepare.mock.calls) {
        expect(target).toBe(CHATGPT_RESPONSES_URL);
        expect(headers.get("authorization")).toBe(
          "Bearer subscription-fixture-access"
        );
        expect(headers.get("chatgpt-account-id")).toBe(
          "subscription-fixture-account"
        );
        expect(headers.get("originator")).toBe("grida");
      }
      expect(fixture.accountHttp).not.toHaveBeenCalled();
      expect(sidecar.nativeAgentGatewayConnection).not.toHaveBeenCalled();
    } finally {
      await fixture.close();
    }
  },
  30_000
);

async function subscriptionDesktop() {
  const base = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), "grida-subscription-picker-")
  );
  const source = {
    userDataPath: path.join(base, "agent"),
    desktopUserDataPath: path.join(base, "browser"),
    providerHome: path.join(base, "providers"),
    mediaRoot: path.join(base, "media"),
  };
  const root = path.join(base, "workspace");
  await Promise.all(
    [root, ...Object.values(source)].map((directory) =>
      fs.mkdir(directory, { mode: 0o700 })
    )
  );
  const auth = new AuthStore(source.userDataPath);
  const seed = (
    overrides: {
      access?: string;
      accountId?: string;
      lineage?: string;
      expires?: number;
    } = {}
  ) =>
    auth.set("chatgpt", {
      type: "oauth",
      access: overrides.access ?? "subscription-fixture-access",
      refresh: "subscription-fixture-refresh",
      account_id: overrides.accountId ?? "subscription-fixture-account",
      expires: overrides.expires ?? Math.floor(Date.now() / 1000) + 3600,
      metadata: {
        credential_id: overrides.lineage ?? "subscription-fixture-lineage",
      },
    });
  await seed();
  const dispatch = vi.fn<
    (body: Buffer, signal: AbortSignal) => Promise<Response>
  >(async () =>
    subscriptionResponse("Subscription fixture reply.", "fixture-message")
  );
  const prepare = vi.fn<NativeProviderNetwork["prepare"]>((target) =>
    target === CHATGPT_RESPONSES_URL ? dispatch : null
  );
  const getModels = vi.fn<
    NonNullable<NativeProviderNetwork["getSubscriptionModels"]>
  >(async () =>
    Response.json({
      models: [
        {
          slug: "gpt-6.2-sol",
          visibility: "list",
          use_responses_lite: true,
          service_tiers: [{ id: "priority" }, { id: "ultrafast" }],
        },
        { slug: "gpt-5.6-terra", visibility: "list" },
        { slug: "gpt-6-luna", visibility: "list" },
        { slug: "gpt-6.2-astra", visibility: "hide" },
        { slug: "uncatalogued-selector", visibility: "list" },
      ],
    })
  );
  const browser = vi.fn<(url: string) => Promise<void>>();
  const accountHttp = vi.fn<typeof fetch>(async () => {
    throw new Error("fixture forbids account network requests");
  });
  sidecar.selectNativeChat.mockReturnValue({
    ...source,
    configHome: source.providerHome,
  });
  sidecar.nativeAgentSubscriptionSettings.mockResolvedValue({
    userDataPath: source.userDataPath,
    network: { prepare, getSubscriptionModels: getModels },
  });
  sidecar.listProviderEndpoints.mockResolvedValue([]);
  sidecar.nativeBuiltInByok.mockRejectedValue(new Error("fixture key absent"));
  sidecar.nativeConfiguredEndpoint.mockRejectedValue(
    new Error("fixture endpoint absent")
  );
  sidecar.nativeAgentGatewayConnection.mockRejectedValue(
    new Error("fixture Gateway unavailable")
  );
  const workspaces = new NativeWorkspaceCatalog({
    browserData: source.desktopUserDataPath,
    projectsRoot: path.join(base, "projects"),
    protectedPaths: [source.userDataPath, source.providerHome],
  });
  const workspace = await workspaces.openSelected(root);
  sidecar.findWorkspace.mockImplementation((id) => workspaces.find(id));
  let catalogue = bundledModelCatalogue();
  const modelCatalogue = {
    view: () => catalogue,
  };
  const launch = async () => {
    const { NativeDesktopAgent } = await import("./native-desktop-agent");
    return NativeDesktopAgent.prepareOrdinary(
      new DesktopAccountSession({
        base_url: "https://editor.example.test",
        fetch: accountHttp,
      }),
      resources!,
      {
        workspace: [source.userDataPath, source.providerHome],
        launch: [source.userDataPath],
      },
      { openExternal: browser, modelCatalogue }
    );
  };
  let agent: Awaited<ReturnType<typeof launch>>;
  try {
    agent = await launch();
  } catch (error) {
    await fs.rm(base, { recursive: true, force: true });
    throw error;
  }
  return {
    base,
    workspace,
    seed,
    getModels,
    async scope() {
      const { NativeChatGptHost } = await import("./native-chatgpt-host");
      const host = new NativeChatGptHost(source.userDataPath, { prepare });
      try {
        return await host.scope();
      } finally {
        await host.close();
      }
    },
    publish(snapshot: ModelCatalogueSnapshot) {
      catalogue = snapshot;
    },
    dispatch,
    prepare,
    browser,
    accountHttp,
    get agent() {
      return agent;
    },
    setSearchPolicy(policy: string | undefined, legacyFastMode?: boolean) {
      const search = policy === undefined ? "" : `web_search = "${policy}"\n`;
      const legacy =
        legacyFastMode === undefined
          ? ""
          : `[features]\nfast_mode = ${legacyFastMode}\n`;
      return fs.writeFile(
        agent.globalHooks.configPath,
        `schema_version = 1\n${search}${legacy}`,
        { mode: 0o600 }
      );
    },
    async reopen() {
      await agent.close();
      vi.resetModules();
      agent = await launch();
    },
    async close() {
      try {
        await agent.close();
      } finally {
        await fs.rm(base, { recursive: true, force: true });
      }
    },
  };
}

function subscriptionResponse(
  reply: string | { name: string; arguments: Record<string, unknown> },
  id: string
): Response {
  const item =
    typeof reply === "string"
      ? {
          type: "message",
          id,
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: reply, annotations: [] }],
        }
      : {
          type: "function_call",
          id,
          call_id: id,
          status: "completed",
          name: reply.name,
          arguments: JSON.stringify(reply.arguments),
        };
  const events = [
    ...(typeof reply === "string"
      ? [{ type: "response.output_text.delta", item_id: id, delta: reply }]
      : []),
    { type: "response.output_item.done", output_index: 0, item },
    {
      type: "response.completed",
      response: {
        status: "completed",
        usage: { input_tokens: 5, output_tokens: 3 },
      },
    },
  ];
  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    {
      headers: { "content-type": "text/event-stream" },
    }
  );
}
