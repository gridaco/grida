// GRIDA-SEC-004 / GRIDA-SEC-008 — ordinary model selection keeps subscription custody and chat funding bound.
import { AuthStore } from "@grida/daemon/server";
import { TIER_MODEL_IDS } from "@grida/ai/catalogue";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import {
  CHATGPT_RESPONSES_URL,
  CHATGPT_SUBSCRIPTION_CONFIG,
} from "../chatgpt-configuration";
import { DesktopAccountSession } from "./account-session";
import { NativeWorkspaceCatalog } from "./native-workspace-catalog";
import type { NativeProviderNetwork } from "./native-provider-egress";
import { NativeChatProfiles } from "./native-chat-profiles";

const sidecar = vi.hoisted(() => ({
  selectNativeChat:
    vi.fn<typeof import("./services-sidecar-supervisor").selectNativeChat>(),
  nativeAgentSubscriptionSettings:
    vi.fn<
      typeof import("./services-sidecar-supervisor").nativeAgentSubscriptionSettings
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
const supportedModels = [
  "GPT-6.2 Sol",
  "GPT-6.2 Astra",
  "GPT-6.1 Sol",
  "GPT-6 Astra",
  "GPT-6.1 Terra",
  "GPT-6 Luna",
  "GPT-6 Sol",
  "GPT-5.6 Sol",
  "GPT-5.6 Terra",
  "GPT-5.6 Luna",
];

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
});

it("discovers features only on the selected live subscription receipt without starting a worker", async () => {
  const f = await subscriptionDesktop();
  try {
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
    expect(f.getModels).not.toHaveBeenCalled();
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
  "offers the closed subscription list on Welcome and in an ordinary workspace without refreshing or dispatching",
  async () => {
    const fixture = await subscriptionDesktop();
    try {
      // An expired access token still permits observational catalog reads.
      // Only a submitted request may refresh the durable connection.
      await fixture.seed({ expires: 1 });
      const welcome = await fixture.agent.welcomeProfiles();
      const workspace = await fixture.agent.profiles(fixture.workspace.id);
      expect(welcome.choices.map(({ model }) => model)).toEqual(
        supportedModels
      );
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
        supportedModels.length
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
      const retired = ["openai/gpt-5.5", "openai/gpt-5.4"].map((modelId) => ({
        ...saved[0],
        id: NativeChatProfiles.subscriptionBinding("c".repeat(64), modelId),
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
  "refuses a search before admission when discovery fails and still sends Standard",
  async () => {
    const f = await subscriptionDesktop();
    try {
      f.getModels.mockImplementation(
        async () => new Response(null, { status: 503 })
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
      expect(f.getModels).not.toHaveBeenCalled();
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
  "applies TOML search access to native requests and preserves a chat’s speed through a global opt-out",
  async () => {
    const f = await subscriptionDesktop();
    try {
      const filename = f.agent.globalHooks.configPath;
      const edit = (mode: string, fast: boolean) =>
        fs.writeFile(
          filename,
          `schema_version = 1\nweb_search = "${mode}"\n[features]\nfast_mode = ${fast}\n`,
          { mode: 0o600 }
        );
      await edit("cached", false);
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
      let body = await send(true);
      expect(body).not.toHaveProperty("service_tier");
      expect(body.tools).toContainEqual({
        type: "web_search",
        external_web_access: false,
      });
      await edit("indexed", true);
      body = await send(true);
      expect(body.service_tier).toBe("priority");
      expect(body.tools).toContainEqual({
        type: "web_search",
        external_web_access: true,
        indexed_web_access: true,
      });
      await edit("disabled", false);
      await expect(send(true)).rejects.toThrow(
        /chat_turn_options_unsupported|chat_web_search_unavailable/
      );
      body = await send();
      expect(body).not.toHaveProperty("service_tier");
      expect(
        body.tools.every((t: { type: string }) => t.type === "function")
      ).toBe(true);
      expect(f.dispatch).toHaveBeenCalledTimes(3);
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
        expect(profiles.saved).toContainEqual({
          ...original,
          available: false,
        });
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
      ],
    })
  );
  const browser = vi.fn<(url: string) => Promise<void>>();
  const accountHttp = vi.fn<typeof fetch>(async () => {
    throw new Error("fixture forbids account network requests");
  });
  sidecar.selectNativeChat.mockReturnValue(source);
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
  const launch = async () => {
    const { NativeDesktopAgent } = await import("./native-desktop-agent");
    return NativeDesktopAgent.prepareOrdinary(
      new DesktopAccountSession({
        base_url: "https://editor.example.test",
        fetch: accountHttp,
      }),
      resources!,
      [source.userDataPath, source.providerHome],
      { openExternal: browser }
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
    dispatch,
    prepare,
    browser,
    accountHttp,
    get agent() {
      return agent;
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
