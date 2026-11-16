// GRIDA-SEC-004 / GRIDA-SEC-008 — ordinary model selection keeps subscription custody and chat funding bound.
import { AuthStore } from "@grida/daemon/server";
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
        "openai/gpt-6.1-sol"
      );
      expect(welcome.choices[0].model).toBe("GPT-6.1 Sol");
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
      expect(new Set(welcome.choices.map(({ id }) => id)).size).toBe(8);
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
  const browser = vi.fn<(url: string) => Promise<void>>();
  const accountHttp = vi.fn<typeof fetch>(async () => {
    throw new Error("fixture forbids account network requests");
  });
  sidecar.selectNativeChat.mockReturnValue(source);
  sidecar.nativeAgentSubscriptionSettings.mockResolvedValue({
    userDataPath: source.userDataPath,
    network: { prepare },
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
