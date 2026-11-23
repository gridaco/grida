// GRIDA-SEC-004 / GRIDA-SEC-008 — native Desktop provider lifetime fixtures.
import { AuthStore, SecretsStore } from "@grida/daemon/server";
import { OLLAMA_ENDPOINT_PRESET } from "@grida/ai-host";
import { AGENT_DEFAULT_TIER, TIER_MODEL_IDS } from "@grida/ai/catalogue";
import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import type { App, IpcMainInvokeEvent, WebContents } from "electron";
import { CHATGPT_RESPONSES_URL } from "../chatgpt-configuration";
import { DesktopAccountSession } from "./account-session";
import type { NativeChatLifecycle } from "./native-agent-chat";
import { NativeAgentProcess } from "./native-agent-process";
import { NativeChatProfiles } from "./native-chat-profiles";
import { NativeGatewayConnection } from "./native-gateway-connection";
import { NativeChatIpc } from "./native-chat-ipc";
import { NativeChatSelections } from "./native-chat-selections";
import { NativeProviderSelection } from "./native-provider-selection";
import { NativeWorkspaceCatalog } from "./native-workspace-catalog";
import type { NativeProviderNetwork } from "./native-provider-egress";

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
  nativeAgentGatewayConnection:
    vi.fn<
      typeof import("./services-sidecar-supervisor").nativeAgentGatewayConnection
    >(),
  findWorkspace:
    vi.fn<
      typeof import("./services-sidecar-client").servicesSidecarClient.findWorkspace
    >(),
  forgetWorkspace:
    vi.fn<
      typeof import("./services-sidecar-client").servicesSidecarClient.forgetWorkspace
    >(),
  listProviderEndpoints:
    vi.fn<
      typeof import("./services-sidecar-client").servicesSidecarClient.listProviderEndpoints
    >(),
  listGatewayModels:
    vi.fn<
      typeof import("./services-sidecar-client").servicesSidecarClient.listGatewayModels
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
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPg/88AAAIvAQ+3s0AMAAAAAElFTkSuQmCC";
const OTHER_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z88AAAMfAQ+5sXHtAAAAAElFTkSuQmCC";

beforeEach(() => {
  vi.resetModules();
  sidecar.nativeAgentOpenAiOffer.mockResolvedValue({ status: "missing" });
  sidecar.nativeAgentSubscriptionSettings.mockClear();
  sidecar.nativeAgentGatewayConnection.mockClear();
  sidecar.listGatewayModels.mockResolvedValue([]);
});

it.skipIf(process.platform === "win32")(
  "restores verified legacy model settings for fixed document and nested deck owners",
  async () => {
    const base = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-fixed-legacy-selection-")
    );
    const root = path.join(base, "workspace");
    const source = {
      userDataPath: path.join(base, "agent"),
      desktopUserDataPath: path.join(base, "desktop"),
      providerHome: path.join(base, "providers"),
      mediaRoot: path.join(base, "media"),
    };
    const workspace = {
      id: "work",
      root,
      name: "Work",
      opened_at: 0,
      pinned: false,
    };
    const origin = "https://editor.example.test";
    const network = { prepare: () => null };
    let agent: import("./native-desktop-agent").NativeDesktopAgent | undefined;
    const { NativeAgentChat } = await import("./native-agent-chat");
    const launch = vi
      .spyOn(NativeAgentChat, "start")
      .mockImplementation(async (options) => {
        let connected = true;
        return {
          modelId: options.model,
          get connected() {
            return connected;
          },
          get hasExited() {
            return !connected;
          },
          close: async () => {
            connected = false;
          },
        } as unknown as import("./native-agent-chat").NativeAgentChat;
      });
    try {
      await Promise.all(
        [root, ...Object.values(source)].map((directory) =>
          fs.mkdir(directory, { mode: 0o700 })
        )
      );
      await fs.writeFile(path.join(root, ".canvas.json"), "{}");
      await fs.mkdir(path.join(root, "slides.canvas"), { mode: 0o700 });
      sidecar.selectNativeChat.mockReturnValue({
        ...source,
        configHome: source.providerHome,
      });
      sidecar.findWorkspace.mockResolvedValue(workspace);
      sidecar.nativeAgentSubscriptionSettings.mockResolvedValue({
        userDataPath: source.userDataPath,
        network,
      });
      sidecar.nativeAgentGatewayConnection.mockImplementation((account) =>
        NativeGatewayConnection.open({ origin, account, network })
      );
      const { NativeDesktopAgent } = await import("./native-desktop-agent");
      agent = await NativeDesktopAgent.prepareOrdinary(
        new DesktopAccountSession({
          base_url: origin,
          fetch: async () =>
            Response.json({
              token: "fixture.gg.key",
              account_subject: "fixture-user",
              organization: { id: 1 },
              expires_at: new Date(Date.now() + 120_000).toISOString(),
            }),
        }),
        base,
        [],
        { openExternal: async () => {} }
      );
      const document = "11111111-1111-4111-8111-111111111111";
      await agent.ensureDocument(document, () => {});
      const nested = await agent.nestedDeck(workspace.id, "slides.canvas");
      await agent.ensureNestedDeck(nested, () => {});
      for (const [key, owner] of [
        [document, agent.currentDocument(document)],
        [
          nested.workspaceId,
          agent.currentNestedDeck(workspace.id, nested.workspaceId),
        ],
      ] as const) {
        expect(owner?.chat.modelId).toBe(TIER_MODEL_IDS[AGENT_DEFAULT_TIER]);
        expect(agent.currentForWindow(key)).toBeNull();
        const legacy = {
          model: owner!.chat.modelId!,
          effort: "high" as const,
          principal: null,
          scope: null,
          matchesCurrent: true,
        };
        await expect(agent.legacySelection(key, legacy)).resolves.toEqual({
          connectionId: null,
          model: legacy.model,
          effort: "high",
        });
        await expect(
          agent.legacySelection(key, { ...legacy, matchesCurrent: false })
        ).resolves.toBeNull();
        await expect(
          agent.legacySelection(key, { ...legacy, model: "different-model" })
        ).resolves.toBeNull();
      }
    } finally {
      await agent?.close();
      launch.mockRestore();
      await fs.rm(base, { recursive: true, force: true });
    }
  }
);

it.skipIf(process.platform === "win32")(
  "keeps Gateway catalogue identity after a different connection retires its worker",
  async () => {
    const base = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-model-catalogue-")
    );
    const root = path.join(base, "workspace");
    const source = {
      userDataPath: path.join(base, "agent"),
      desktopUserDataPath: path.join(base, "desktop"),
      providerHome: path.join(base, "providers"),
      mediaRoot: path.join(base, "media"),
    };
    let agent: import("./native-desktop-agent").NativeDesktopAgent | undefined;
    const { NativeAgentChat } = await import("./native-agent-chat");
    const launch = vi
      .spyOn(NativeAgentChat, "start")
      .mockImplementation(async () => {
        let connected = true;
        let sealed = false;
        return {
          get connected() {
            return connected;
          },
          get hasExited() {
            return !connected;
          },
          get modelChangePending() {
            return sealed;
          },
          prepareModelChange: async () => {
            sealed = true;
          },
          close: async () => {
            connected = false;
          },
        } as unknown as import("./native-agent-chat").NativeAgentChat;
      });
    try {
      await Promise.all(
        [root, ...Object.values(source)].map((directory) =>
          fs.mkdir(directory, { mode: 0o700 })
        )
      );
      sidecar.selectNativeChat.mockReturnValue({
        ...source,
        configHome: source.providerHome,
      });
      sidecar.findWorkspace.mockResolvedValue({
        id: "work",
        root,
        name: "Work",
        opened_at: 0,
        pinned: false,
      });
      sidecar.listProviderEndpoints.mockResolvedValue([
        {
          id: "local",
          base_url: "http://127.0.0.1:1/v1",
          models: [{ id: "fixture-local" }],
        },
      ]);
      sidecar.nativeConfiguredEndpoint.mockImplementation(
        async (_id, model) => ({
          provider: "openai-compatible",
          endpoint: "http://127.0.0.1:1/v1",
          model: model ?? "fixture-local",
          providerNetwork: { prepare: () => null },
        })
      );
      sidecar.nativeBuiltInByok.mockRejectedValue(
        new Error("fixture_key_absent")
      );
      sidecar.listGatewayModels.mockResolvedValue([
        {
          id: "fixture/alternate-chat",
          label: "Alternate",
          kind: "text",
          created: 0,
          owned_by: "fixture",
          interfaces: ["chat.completions"],
          input_modalities: ["text"],
          output_modalities: ["text"],
          operation_ids: [],
          capabilities: { tools: true },
          limits: { context_tokens: 8192, max_output_tokens: 1024 },
        },
      ]);
      const origin = "https://editor.example.test";
      sidecar.nativeAgentGatewayConnection.mockImplementation(
        (account, organizationId, signal) =>
          NativeGatewayConnection.open({
            origin,
            account,
            organizationId,
            signal,
            network: { prepare: () => null },
          })
      );
      const { NativeDesktopAgent } = await import("./native-desktop-agent");
      agent = await NativeDesktopAgent.prepareFresh(
        new DesktopAccountSession({
          base_url: origin,
          fetch: async () =>
            Response.json({
              token: "fixture.gg.key",
              account_subject: "fixture-user",
              organization: { id: 17 },
              expires_at: new Date(Date.now() + 120_000).toISOString(),
            }),
        }),
        base,
        {
          provider: "gateway",
          openExternal: async () => {},
          selectableProfiles: true,
        }
      );
      await agent.ensure("work");
      const before = await agent.profiles("work");
      const gateway = before.choices.find(
        ({ connection }) => connection === "Grida"
      )!;
      const local = before.choices.find(
        ({ connection }) => connection === "local"
      )!;
      expect(before.modelChanges).toBe(true);
      await agent.selectProfile(
        "work",
        { kind: "new", id: local.id },
        () => {}
      );
      expect(agent.current("work")).toBeNull();
      expect((await agent.profiles("work")).choices).toEqual(before.choices);
      expect(sidecar.nativeAgentGatewayConnection).toHaveBeenCalledOnce();
      await agent.selectProfile(
        "work",
        { kind: "new", id: gateway.id },
        () => {}
      );
      expect(agent.current("work", gateway.id)).not.toBeNull();
      expect((await agent.profiles("work")).choices).toEqual(before.choices);
      await agent.clearAccount();
      expect((await agent.profiles("work")).choices).not.toContainEqual(
        gateway
      );
    } finally {
      await agent?.close();
      launch.mockRestore();
      await fs.rm(base, { recursive: true, force: true });
    }
  }
);

it.runIf(Boolean(resources) && process.platform === "darwin")(
  "refuses a private home root and never reuses a replaced ordinary workspace",
  async () => {
    const base = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-ordinary-workspace-")
    );
    const root = path.join(base, "workspace");
    const home = path.join(base, "home");
    const secret = path.join(home, ".ssh");
    const source = {
      userDataPath: path.join(base, "agent"),
      desktopUserDataPath: path.join(base, "desktop"),
      providerHome: path.join(base, "providers"),
      mediaRoot: path.join(base, "media"),
    };
    const network = { prepare: () => null };
    const origin = "https://editor.example.test";
    const workspace = {
      id: "work",
      root,
      name: "Workspace",
      opened_at: Date.now(),
      pinned: false,
    };
    let agent: import("./native-desktop-agent").NativeDesktopAgent | undefined;
    try {
      await Promise.all(
        [root, ...Object.values(source)].map((directory) =>
          fs.mkdir(directory, { mode: 0o700 })
        )
      );
      await fs.mkdir(secret, { recursive: true, mode: 0o700 });
      sidecar.selectNativeChat.mockReturnValue({
        ...source,
        configHome: source.providerHome,
      });
      sidecar.nativeAgentSubscriptionSettings.mockResolvedValue({
        userDataPath: source.userDataPath,
        network,
      });
      sidecar.nativeAgentGatewayConnection.mockImplementation((account) =>
        NativeGatewayConnection.open({ origin, account, network })
      );
      sidecar.findWorkspace.mockResolvedValue(workspace);
      const { NativeDesktopAgent } = await import("./native-desktop-agent");
      const { NativeDesktopProfile } = await import("./native-desktop-profile");
      const protectedPaths = NativeDesktopProfile.ordinaryChatProtectedPaths({
        commandLine: { getSwitchValue: () => "" },
        setPath: () => {},
        getPath: (name: Parameters<App["getPath"]>[0]) =>
          name === "home" ? home : base,
      });
      expect(protectedPaths).toEqual(
        expect.arrayContaining([secret, path.join(home, ".aws")])
      );
      agent = await NativeDesktopAgent.prepareOrdinary(
        new DesktopAccountSession({
          base_url: origin,
          fetch: async () =>
            Response.json({
              token: "fixture.gg.key",
              account_subject: "fixture-user",
              expires_at: new Date(Date.now() + 120_000).toISOString(),
              organization: { id: 1 },
            }),
        }),
        resources!,
        protectedPaths,
        { openExternal: async () => {} }
      );
      sidecar.findWorkspace.mockResolvedValueOnce({
        ...workspace,
        root: secret,
      });
      await expect(agent.ensure(workspace.id)).rejects.toThrow(
        "native_workspace_root_denied"
      );
      expect(sidecar.nativeAgentGatewayConnection).not.toHaveBeenCalled();
      await agent.ensure(workspace.id);
      const captured = await fs.lstat(root, { bigint: true });
      expect(agent.current(workspace.id)?.directoryIdentity).toEqual({
        device: captured.dev.toString(),
        inode: captured.ino.toString(),
        birthTimeNs: captured.birthtimeNs.toString(),
      });
      await fs.rename(root, path.join(base, "original-workspace"));
      await fs.mkdir(root, { mode: 0o700 });
      expect(agent.current(workspace.id)).toBeNull();
      await expect(agent.ensure(workspace.id)).rejects.toThrow(
        "native_workspace_root_changed"
      );
      expect(sidecar.nativeAgentGatewayConnection).toHaveBeenCalledTimes(1);
    } finally {
      await agent?.close();
      await fs.rm(base, { recursive: true, force: true });
    }
  },
  // Starts and replaces native workers; slower under a full suite.
  20_000
);

it.runIf(Boolean(resources) && process.platform === "darwin")(
  "confirms a new ordinary workspace chat on Welcome and opens its exact retained permission",
  async () => {
    const base = await fs.mkdtemp(
      path.join(
        await fs.realpath(os.tmpdir()),
        "grida-welcome-native-permission-"
      )
    );
    const root = path.join(base, "project");
    const source = {
      userDataPath: path.join(base, "agent"),
      desktopUserDataPath: path.join(base, "desktop"),
      providerHome: path.join(base, "providers"),
      mediaRoot: path.join(base, "media"),
    };
    const workspace = {
      id: "welcome-native",
      root,
      name: "Project",
      opened_at: Date.now(),
      pinned: false,
    };
    const origin = "https://editor.example.test";
    const frame = { url: `${origin}/desktop/welcome` };
    const contents = Object.assign(new EventEmitter(), {
      mainFrame: frame,
      isDestroyed: () => false,
      isLoadingMainFrame: () => false,
    });
    const sender = contents as unknown as WebContents;
    const event = {
      sender,
      senderFrame: frame,
    } as unknown as IpcMainInvokeEvent;
    const network = {
      prepare: vi.fn<NativeProviderNetwork["prepare"]>(() => null),
    };
    let owner: import("./native-desktop-agent").NativeDesktopAgent | undefined;
    try {
      await Promise.all(
        [root, ...Object.values(source)].map((directory) =>
          fs.mkdir(directory, { recursive: true, mode: 0o700 })
        )
      );
      sidecar.selectNativeChat.mockReturnValue({
        ...source,
        configHome: source.providerHome,
      });
      sidecar.nativeAgentSubscriptionSettings.mockResolvedValue({
        userDataPath: source.userDataPath,
        network,
      });
      sidecar.nativeAgentGatewayConnection.mockImplementation((account) =>
        NativeGatewayConnection.open({ origin, account, network })
      );
      sidecar.findWorkspace.mockResolvedValue(workspace);
      const { NativeDesktopAgent } = await import("./native-desktop-agent");
      const agent = await NativeDesktopAgent.prepareOrdinary(
        new DesktopAccountSession({
          base_url: origin,
          fetch: async () =>
            Response.json({
              token: "fixture.gg.key",
              account_subject: "fixture-user",
              expires_at: new Date(Date.now() + 120_000).toISOString(),
              organization: { id: 1 },
            }),
        }),
        resources!,
        [source.userDataPath],
        { openExternal: async () => {} }
      );
      owner = agent;
      const selections = await NativeChatSelections.open({
        userDataPath: source.desktopUserDataPath,
        choice: agent.selectionChoice.bind(agent),
        query: agent.selectionRequest.bind(agent),
      });
      const ipc = new NativeChatIpc(
        origin,
        (_sender, id, profile) => agent.currentForWindow(id, profile),
        { admits: () => true, ensure: agent.ensure.bind(agent) },
        undefined,
        undefined,
        {
          list: agent.profiles.bind(agent),
          select: agent.selectProfile.bind(agent),
        },
        undefined,
        false,
        undefined,
        undefined,
        undefined,
        selections,
        undefined,
        agent.welcomeWorkspace.bind(agent)
      );
      const choice = {
        workspaceId: workspace.id,
        profileId: null,
        effort: "high",
      };
      const canceled = await ipc.prepareWelcomeFullAccess(event, workspace.id);
      expect(canceled.workspaceName).toBe("project");
      await expect(
        ipc.answerWelcomeFullAccess(event, canceled.reviewId, false)
      ).resolves.toBeUndefined();
      expect(agent.current(workspace.id)).toBeNull();
      const review = await ipc.prepareWelcomeFullAccess(event, workspace.id);
      await ipc.answerWelcomeFullAccess(event, review.reviewId, true);
      expect(agent.current(workspace.id)).toBeNull();
      const confirmed = await ipc.startWelcomeFullAccess(
        event,
        review.reviewId,
        choice
      );
      expect(confirmed?.profileId).toBeNull();
      expect(agent.current(workspace.id)?.directoryIdentity).toEqual(
        (await agent.welcomeWorkspace(workspace.id)).directoryIdentity
      );
      frame.url = `${origin}/desktop/workspace?id=${workspace.id}`;
      contents.emit("did-navigate-in-page", {}, frame.url, true);
      const { attachmentId, sessionId } = await ipc.load(
        event,
        confirmed!.sessionId
      );
      expect(sessionId).toBe(confirmed!.sessionId);
      expect(await ipc.permissionMode(event, attachmentId)).toEqual({
        sessionId,
        revision: 1,
        mode: "full_access",
        available: ["restricted", "approve_for_me", "full_access"],
      });
      expect(await ipc.transcript(event, attachmentId)).toEqual([]);
      expect((await ipc.selection(event, { sessionId })).selection).toEqual({
        profileId: null,
        modelId: TIER_MODEL_IDS[AGENT_DEFAULT_TIER],
        effort: "high",
      });
      const another = await ipc.create(event);
      expect((await ipc.permissionMode(event, another.attachmentId)).mode).toBe(
        "restricted"
      );
      expect(network.prepare).not.toHaveBeenCalled();
    } finally {
      await owner?.close();
      await fs.rm(base, { recursive: true, force: true });
    }
  },
  20_000
);

it.runIf(Boolean(resources) && process.platform === "darwin")(
  "opens root and nested decks from the retained workspace owner",
  async () => {
    const base = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-ordinary-deck-")
    );
    const root = path.join(base, "workspace");
    const nested = path.join(root, "slides.canvas");
    const source = {
      userDataPath: path.join(base, "agent"),
      desktopUserDataPath: path.join(base, "desktop"),
      providerHome: path.join(base, "providers"),
      mediaRoot: path.join(base, "media"),
    };
    const workspace = {
      id: "work",
      root,
      name: "Workspace",
      opened_at: Date.now(),
      pinned: false,
    };
    const network = { prepare: () => null };
    const origin = "https://editor.example.test";
    let agent: import("./native-desktop-agent").NativeDesktopAgent | undefined;
    try {
      await Promise.all(
        [nested, ...Object.values(source)].map((directory) =>
          fs.mkdir(directory, { recursive: true, mode: 0o700 })
        )
      );
      await fs.writeFile(path.join(root, ".canvas.json"), "{}");
      sidecar.selectNativeChat.mockReturnValue({
        ...source,
        configHome: source.providerHome,
      });
      sidecar.nativeAgentSubscriptionSettings.mockResolvedValue({
        userDataPath: source.userDataPath,
        network,
      });
      sidecar.nativeAgentGatewayConnection.mockImplementation((account) =>
        NativeGatewayConnection.open({ origin, account, network })
      );
      sidecar.findWorkspace.mockResolvedValue(workspace);
      const { NativeDesktopAgent } = await import("./native-desktop-agent");
      agent = await NativeDesktopAgent.prepareOrdinary(
        new DesktopAccountSession({
          base_url: origin,
          fetch: async () =>
            Response.json({
              token: "fixture.gg.key",
              account_subject: "fixture-user",
              expires_at: new Date(Date.now() + 120_000).toISOString(),
              organization: { id: 1 },
            }),
        }),
        resources!,
        [source.userDataPath],
        { openExternal: async () => {} }
      );
      const parent = await agent.rootDeck(workspace.id);
      const child = await agent.nestedDeck(workspace.id, "slides.canvas");
      expect(parent.root).toBe(root);
      expect(child.root).toBe(nested);
      expect(child.parentIdentity).toEqual(parent.identity);
      await expect(
        agent.nestedDeck(workspace.id, "../outside.canvas")
      ).rejects.toThrow("workspace_not_registered");
      await agent.ensure(workspace.id);
      await agent.ensureNestedDeck(child, () => {});
      expect(agent.current(workspace.id)?.directoryIdentity).toEqual(
        parent.identity
      );
      expect(
        agent.currentNestedDeck(workspace.id, child.workspaceId)
          ?.directoryIdentity
      ).toEqual(child.identity);
      const session = await agent
        .currentNestedDeck(workspace.id, child.workspaceId)!
        .chat.create();
      await agent.closeNestedDeck(child.workspaceId);
      await agent.ensureNestedDeck(child, () => {});
      expect(
        await agent
          .currentNestedDeck(workspace.id, child.workspaceId)!
          .chat.load(session.id)
      ).toEqual({ id: session.id });
      await fs.rename(nested, nested + "-old");
      await fs.mkdir(nested, { mode: 0o700 });
      const replacement = await agent.nestedDeck(workspace.id, "slides.canvas");
      expect(replacement.workspaceId).not.toBe(child.workspaceId);
    } finally {
      await agent?.close();
      await fs.rm(base, { recursive: true, force: true });
    }
  },
  20_000
);

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "delivers a selected Library PNG on the approved OpenRouter tool continuation",
  async () => {
    const root = await fs.mkdtemp(
      path.join(
        await fs.realpath(os.tmpdir()),
        "grida-native-library-provider-"
      )
    );
    const credentialHome = path.join(root, "credentials");
    const cwd = path.join(root, "workspace");
    const model = "openai/gpt-5.6-terra";
    const key = "library-provider-fixture-key";
    const list = "co.grida/session/library-selections";
    const answer = "co.grida/session/answer-library-selection";
    const query = "Geometric prints";
    const selectedId = "d365c5fb-5833-48e9-a081-ae6d52c9b49c";
    let requestCount = 0;
    const dispatch = vi.fn<(body: Buffer) => Promise<Response>>(async () => {
      const first = requestCount++ === 0;
      const chunk = {
        id: "library-provider-fixture",
        choices: [
          {
            index: 0,
            delta: first
              ? {
                  tool_calls: [
                    {
                      index: 0,
                      id: "library-fixture-call",
                      type: "function",
                      function: {
                        name: "design_search",
                        arguments: JSON.stringify({
                          initial_search_query: query,
                        }),
                      },
                    },
                  ],
                }
              : { content: "Received the reference." },
            finish_reason: first ? "tool_calls" : "stop",
          },
        ],
      };
      return new Response(
        `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`,
        {
          headers: { "content-type": "text/event-stream" },
        }
      );
    });
    const prepare: NativeProviderNetwork["prepare"] = (target, headers) => {
      expect(target).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect(headers.get("authorization")).toBe(`Bearer ${key}`);
      return dispatch;
    };
    let child: NativeAgentProcess | undefined;
    try {
      await Promise.all(
        [cwd, credentialHome].map((directory) =>
          fs.mkdir(directory, { mode: 0o700 })
        )
      );
      const secrets = new SecretsStore(new AuthStore(root), credentialHome);
      await secrets.set("openrouter", key);
      const launch = await NativeProviderSelection.builtInByok(
        "openrouter",
        model,
        {
          credentialHome,
          hasKey: (id) => secrets.has(id),
          network: async () => ({ prepare }),
        }
      );
      const owner = await NativeAgentProcess.start({
        ...launch,
        resourcesPath: resources!,
        stateDirectory: path.join(root, "state"),
        capabilities: {
          [list]: 1,
          [answer]: 1,
          "co.grida/session/submit": 1,
          "co.grida/session/snapshot": 1,
        },
      });
      child = owner;
      const { sessionId } = (await owner.request("session/new", {
        cwd,
        mcpServers: [],
      })) as { sessionId: string };
      const { turnId } = (await owner.request("_co.grida/session/submit", {
        sessionId,
        inputId: "find-reference",
        prompt: [{ type: "text", text: "Find a visual reference." }],
        allowLibrarySelection: true,
      })) as { turnId: string };
      const snapshot = () =>
        owner.request("_co.grida/session/snapshot", { sessionId });
      const waiting = await vi.waitFor(
        async () => {
          const state = (await snapshot()) as { sessionRevision: number };
          expect(state).toMatchObject({
            current: { turnId, disposition: "suspended" },
          });
          return state;
        },
        { timeout: 5000 }
      );
      const pending = (await owner.request(`_${list}`, {
        sessionId,
        turnId,
      })) as {
        controlRevision: number;
        selections: { waitId: string; initialSearchQuery: string }[];
      };
      expect(pending.selections).toEqual([
        { waitId: expect.any(String), initialSearchQuery: query },
      ]);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(JSON.parse(dispatch.mock.calls[0][0].toString())).toMatchObject({
        model,
        tools: expect.arrayContaining([
          expect.objectContaining({
            function: expect.objectContaining({ name: "design_search" }),
          }),
        ]),
      });
      await owner.request(`_${answer}`, {
        sessionId,
        turnId,
        requestId: "select-reference",
        expectedSessionRevision: waiting.sessionRevision,
        expectedControlRevision: pending.controlRevision,
        waitId: pending.selections[0].waitId,
        answer: { kind: "selected", id: selectedId, data: PNG },
      });
      await vi.waitFor(
        async () => {
          expect(await snapshot()).toMatchObject({
            latest: { turnId, status: "succeeded" },
          });
        },
        { timeout: 5000 }
      );

      expect(dispatch).toHaveBeenCalledTimes(2);
      const body = dispatch.mock.calls[1][0].toString();
      const [call, reply, attachment] = JSON.parse(body).messages.slice(-3);
      expect(call).toMatchObject({
        role: "assistant",
        tool_calls: [
          expect.objectContaining({
            function: {
              name: "design_search",
              arguments: JSON.stringify({ initial_search_query: query }),
            },
          }),
        ],
      });
      const callId = call.tool_calls[0].id;
      const marker = `Tool-provided image 1 for result ${callId}`;
      expect(reply).toMatchObject({ role: "tool", tool_call_id: callId });
      expect(JSON.parse(reply.content)).toMatchObject({
        status: "succeeded",
        content: expect.arrayContaining([
          expect.stringContaining(selectedId),
          expect.stringContaining(marker),
        ]),
      });
      expect(attachment).toEqual({
        role: "user",
        content: [
          { type: "text", text: marker },
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${PNG}` },
          },
        ],
      });
      expect(body.match(/data:image\/png;base64,/g)).toHaveLength(1);
      expect(body).not.toContain("retained-input:");
    } finally {
      try {
        await child?.close();
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  },
  15_000
);

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "uses global context settings and reopens only a matching legacy receipt",
  async () => {
    const base = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-compatible-chat-")
    );
    const source = {
      userDataPath: path.join(base, "agent"),
      desktopUserDataPath: path.join(base, "browser"),
      providerHome: path.join(base, "providers"),
      mediaRoot: path.join(base, "media"),
    };
    const root = path.join(base, "workspace");
    const otherRoot = path.join(base, "other-workspace");
    const config = {
      id: "local",
      base_url: "http://127.0.0.1:11434/v1",
      models: [{ id: "fixture", contextWindow: 16_384 }],
    };
    const countedConfig = { ...config, input_counting: "llama.cpp" as const };
    let savedConfig: typeof config | typeof countedConfig = countedConfig;
    const requests: Record<string, unknown>[] = [];
    const generated: Buffer[] = [];
    const counts: Buffer[] = [];
    const prepare: NativeProviderNetwork["prepare"] = (target, headers) => {
      expect(headers.get("authorization")).toBeNull();
      const counting =
        target === config.base_url + "/chat/completions/input_tokens";
      expect(headers.get("accept")).toBe(
        counting ? "application/json" : "text/event-stream"
      );
      if (counting) {
        return async (body) => {
          counts.push(body);
          return Response.json({
            object: "response.input_tokens",
            input_tokens: 1000,
          });
        };
      }
      expect(target).toBe(config.base_url + "/chat/completions");
      return async (body) => {
        generated.push(body);
        requests.push(JSON.parse(body.toString()));
        return new Response(
          'data: {"id":"fixture","choices":[{"index":0,"delta":{"content":"Local endpoint answered."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
          { headers: { "content-type": "text/event-stream" } }
        );
      };
    };
    const launch = async () => {
      const { NativeDesktopAgent } = await import("./native-desktop-agent");
      return NativeDesktopAgent.prepareFresh(
        new DesktopAccountSession({
          base_url: "https://editor.example.test",
          fetch: async () =>
            Response.json(
              { error: { code: "not_configured" } },
              { status: 503 }
            ),
        }),
        resources!,
        {
          provider: "gateway",
          openExternal: async () => {},
          selectableProfiles: true,
        }
      );
    };
    let agent: Awaited<ReturnType<typeof launch>> | undefined;
    try {
      await Promise.all(
        [root, otherRoot, source.userDataPath, source.desktopUserDataPath].map(
          (directory) => fs.mkdir(directory, { mode: 0o700 })
        )
      );
      sidecar.selectNativeChat.mockReturnValue({
        ...source,
        configHome: source.providerHome,
      });
      sidecar.listProviderEndpoints.mockImplementation(async () => [
        savedConfig,
      ]);
      sidecar.nativeBuiltInByok.mockRejectedValue(new Error("no saved key"));
      sidecar.nativeConfiguredEndpoint.mockImplementation((id, model, count) =>
        NativeProviderSelection.configuredEndpoint(
          id,
          model,
          {
            list: async () => [savedConfig],
            hasKey: async () => false,
            network: async () => ({ prepare }),
          },
          count
        )
      );
      const workspaces = new NativeWorkspaceCatalog({
        browserData: source.desktopUserDataPath,
        projectsRoot: path.join(base, "projects"),
        protectedPaths: [source.userDataPath, source.providerHome],
      });
      const workspace = await workspaces.openSelected(root);
      const otherWorkspace = await workspaces.openSelected(otherRoot);
      sidecar.findWorkspace.mockImplementation((id) => workspaces.find(id));
      vi.resetModules();
      agent = await launch();
      sidecar.nativeAgentGatewayConnection.mockImplementationOnce(
        (account, _organizationId, signal) =>
          NativeGatewayConnection.open({
            origin: "https://editor.example.test",
            account,
            network: { prepare: () => null },
            signal,
          })
      );
      await expect(agent.ensure(workspace.id)).rejects.toThrow(
        "gateway_grant_unavailable"
      );
      expect(agent.current(workspace.id)).toBeNull();
      expect(sidecar.nativeAgentGatewayConnection).toHaveBeenCalledTimes(1);
      const { choices, saved } = await agent.profiles(workspace.id);
      expect(saved).toEqual([]);
      expect(choices.map(({ connection }) => connection)).toEqual(["local"]);
      // Welcome offers the same workspace-independent choices before any
      // workspace opens, with nothing saved or active.
      expect(await agent.welcomeProfiles()).toEqual({
        modelChanges: true,
        defaultContextWindow: expect.any(Number),
        defaultGoalSpending: true,
        choices,
      });
      const [{ id: newId }] = choices;
      const legacyLaunch = NativeChatProfiles.configuredLaunch(
        await sidecar.nativeConfiguredEndpoint(config.id, "fixture", true)
      );
      const countedId = NativeChatProfiles.binding(config.id, legacyLaunch);
      expect(countedId).not.toBe(newId);
      await expect(
        agent.selectProfile(
          workspace.id,
          { kind: "new", id: countedId },
          () => {}
        )
      ).rejects.toThrow("native_chat_profile_unavailable");
      await agent.selectProfile(
        workspace.id,
        { kind: "new", id: newId },
        () => {}
      );
      const newChat = agent.current(workspace.id, newId)!.chat;
      expect((await agent.profiles(workspace.id)).saved).toEqual([
        expect.objectContaining({
          id: newId,
          connection: "local",
          available: true,
        }),
      ]);
      const session = await newChat.create();
      await newChat.submit(
        session,
        "compatible",
        "Use the compatible output limit."
      );
      await vi.waitFor(async () =>
        expect((await newChat.observe(session)).latest?.status).toBe(
          "succeeded"
        )
      );
      expect(
        requests.map(({ max_completion_tokens, max_tokens }) => [
          max_completion_tokens,
          max_tokens,
        ])
      ).toEqual([[undefined, 4096]]);
      expect(counts).toEqual([]);
      expect(
        (await newChat.transcriptPage(session)).turns?.at(-1)
      ).toMatchObject({ contextWindowTokens: 16_384 });

      // Harness effort also works on an anonymous compatible connection whose
      // model has no reasoning setting. It keeps that connection's wire form.
      expect(newChat.acceptsEffort).toBe(true);
      expect(newChat.acceptsGoalEffort).toBe(true);
      const standardTurn = (await newChat.observe(session)).latest!.turnId;
      await newChat.submit(
        session,
        "compatible-ultra",
        "Use the extended harness allowance.",
        undefined,
        undefined,
        "ultra"
      );
      await vi.waitFor(async () => {
        const latest = (await newChat.observe(session)).latest;
        expect(latest?.turnId).not.toBe(standardTurn);
        expect(latest?.status).toBe("succeeded");
      });
      expect(requests[1]).toMatchObject({ model: "fixture", max_tokens: 4096 });
      expect(requests[1]).not.toHaveProperty("max_completion_tokens");
      expect(requests[1]).not.toHaveProperty("reasoning");
      expect(requests[1]).not.toHaveProperty("reasoning_effort");
      expect(generated).toHaveLength(2);

      // An old workspace config does not shadow the global settings.
      const oldSettings = path.join(
        await fs.realpath(source.desktopUserDataPath),
        "chats",
        "workspaces",
        createHash("sha256")
          .update(JSON.stringify([workspace.id, root]))
          .digest("hex"),
        "config.toml"
      );
      await fs.writeFile(
        oldSettings,
        "schema_version = 1\nmodel_context_window = 4096\n",
        { mode: 0o600 }
      );
      await fs.mkdir(source.providerHome, { recursive: true, mode: 0o700 });
      await fs.writeFile(
        path.join(source.providerHome, "config.toml"),
        "schema_version = 1\nmodel_context_window = 8192\nmodel_auto_compact_token_limit = 4000\n",
        { mode: 0o600 }
      );
      // Seed the receipt an earlier Desktop release would have written.
      await NativeChatProfiles.remember(
        path.dirname(oldSettings),
        {
          id: countedId,
          providerId: config.id,
          modelId: "fixture",
          connection: "local (llama.cpp counting)",
          model: "fixture",
        },
        () => {}
      );
      await agent.close();
      vi.resetModules();
      agent = await launch();
      const reopened = await agent.profiles(workspace.id);
      expect(reopened.choices).toEqual(choices);
      expect(reopened.saved).toContainEqual(
        expect.objectContaining({
          id: countedId,
          connection: "local (legacy)",
          contextWindow: 16_384,
          available: true,
        })
      );
      expect((await agent.welcomeProfiles()).choices).toEqual(choices);
      await expect(
        agent.selectionChoice(workspace.id, countedId)
      ).resolves.toEqual({
        connectionId: countedId,
        model: "fixture",
      });
      await expect(
        agent.selectionChoice(otherWorkspace.id, countedId)
      ).rejects.toThrow("native_chat_selection_unavailable");
      await expect(
        agent.selectProfile(
          otherWorkspace.id,
          { kind: "saved", id: countedId },
          () => {}
        )
      ).rejects.toThrow("native_chat_profile_unavailable");
      await agent.selectProfile(
        workspace.id,
        { kind: "saved", id: countedId },
        () => {}
      );
      const countedChat = agent.current(workspace.id, countedId)!.chat;
      // Chats belong to the workspace: the counted connection lists the chat
      // the other connection started.
      expect((await countedChat.list()).sessionIds).toEqual([session.id]);
      expect(countedChat.createSelected).toBeTypeOf("function");
      const countedSession = await countedChat.createSelected!({
        sessionId: randomUUID(),
        requestId: randomUUID(),
        selection: {
          connectionId: countedId,
          model: "fixture",
          effort: "medium",
        },
      });
      await countedChat.submit(
        countedSession,
        "legacy",
        "Use the saved connection.",
        undefined,
        undefined,
        undefined,
        1
      );
      await vi.waitFor(async () =>
        expect((await countedChat.observe(countedSession)).latest?.status).toBe(
          "succeeded"
        )
      );
      expect(counts).toEqual([]);
      expect(generated).toHaveLength(3);
      expect(requests[2]).toMatchObject({ model: "fixture", max_tokens: 4096 });
      expect(
        (await countedChat.transcriptPage(countedSession)).turns?.at(-1)
      ).toMatchObject({ contextWindowTokens: 8192 });

      await agent.close();
      savedConfig = config;
      vi.resetModules();
      agent = await launch();
      const after = await agent.profiles(workspace.id);
      expect(after.choices.map(({ id }) => id)).toEqual([newId]);
      expect(after.saved).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: newId, available: true }),
          expect.objectContaining({
            id: countedId,
            connection: "local (legacy)",
            available: false,
          }),
        ])
      );
      await expect(
        agent.selectProfile(
          workspace.id,
          { kind: "saved", id: countedId },
          () => {}
        )
      ).rejects.toThrow("native_chat_profile_changed");
      await expect(
        agent.selectionChoice(workspace.id, countedId)
      ).rejects.toThrow("native_chat_selection_unavailable");
      expect(counts).toEqual([]);
      expect(generated).toHaveLength(3);
      expect(sidecar.nativeAgentGatewayConnection).toHaveBeenCalledTimes(1);
    } finally {
      await agent?.close();
      await fs.rm(base, { recursive: true, force: true });
    }
  },
  25_000
);

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "opens a discovered Gateway model under its original account scope and output limit",
  async () => {
    const base = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-gateway-model-")
    );
    const source = {
      userDataPath: path.join(base, "agent"),
      desktopUserDataPath: path.join(base, "browser"),
      providerHome: path.join(base, "providers"),
      mediaRoot: path.join(base, "media"),
    };
    const root = path.join(base, "workspace");
    const origin = "https://editor.example.test";
    const model = {
      id: "fixture/alternate-chat",
      label: "Alternate chat",
      kind: "text",
      created: 0,
      owned_by: "fixture",
      interfaces: ["chat.completions"],
      input_modalities: ["text"],
      output_modalities: ["text"],
      operation_ids: [],
      capabilities: { tools: true },
      limits: { context_tokens: 8192, max_output_tokens: 1024 },
    };
    let organization = 17;
    let mints = 0;
    const requests: unknown[] = [];
    const onLifecycle =
      vi.fn<
        (
          workspaceId: string,
          notice: NativeChatLifecycle,
          current: () => boolean,
          profileId?: string
        ) => void
      >();
    const prepare: NativeProviderNetwork["prepare"] = (target, headers) => {
      expect(target).toBe(origin + "/api/v1/ai/chat/completions");
      expect(headers.get("authorization")).toBe("Bearer fixture.gg.key");
      return async (body) => {
        requests.push(JSON.parse(body.toString()));
        const chunk = {
          id: "gateway-model-fixture",
          choices: [
            {
              index: 0,
              delta: { content: "Alternate model answered." },
              finish_reason: "stop",
            },
          ],
        };
        return new Response(
          `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`,
          { headers: { "content-type": "text/event-stream" } }
        );
      };
    };
    let agent: import("./native-desktop-agent").NativeDesktopAgent | undefined;
    try {
      await Promise.all(
        [root, source.userDataPath, source.desktopUserDataPath].map(
          (directory) => fs.mkdir(directory, { mode: 0o700 })
        )
      );
      sidecar.selectNativeChat.mockReturnValue({
        ...source,
        configHome: source.providerHome,
      });
      sidecar.listProviderEndpoints.mockResolvedValue([]);
      sidecar.nativeBuiltInByok.mockRejectedValue(new Error("no saved key"));
      sidecar.listGatewayModels.mockResolvedValue([
        model,
        { ...model, id: TIER_MODEL_IDS[AGENT_DEFAULT_TIER] },
        { ...model, id: "fixture/no-tools", capabilities: { tools: false } },
        { ...model, id: "fixture/image", kind: "image" },
        { ...model, id: "fixture/invalid-limit", limits: {} },
      ]);
      sidecar.nativeAgentGatewayConnection.mockImplementation(
        (account, organizationId, signal) =>
          NativeGatewayConnection.open({
            origin,
            account,
            network: { prepare },
            organizationId,
            signal,
          })
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
        return NativeDesktopAgent.prepareFresh(
          new DesktopAccountSession({
            base_url: origin,
            fetch: async () => {
              mints += 1;
              return Response.json({
                token: "fixture.gg.key",
                account_subject: "fixture-user",
                expires_at: new Date(Date.now() + 120_000).toISOString(),
                organization: { id: organization },
              });
            },
          }),
          resources!,
          {
            provider: "gateway",
            openExternal: async () => {},
            selectableProfiles: true,
            onLifecycle,
          }
        );
      };
      agent = await launch();
      await agent.ensure(workspace.id);
      const original = agent.current(workspace.id)!.chat;
      expect(await original.inspectHooks?.()).toMatchObject({
        saved: [],
        active: [],
        results: [],
        activation: "current",
      });
      const originalSession = await original.create();
      const { choices } = await agent.profiles(workspace.id);
      expect(choices).toEqual([
        {
          id: expect.any(String),
          connection: "Grida",
          model: model.label,
          contextWindow: 8192,
          goalSpending: true,
          ultra: true,
        },
      ]);
      expect(await agent.profiles(workspace.id)).toEqual({
        modelChanges: true,
        defaultContextWindow: expect.any(Number),
        defaultGoalSpending: true,
        choices,
        saved: [],
      });
      expect(mints).toBe(1);
      // Gateway choices depend on a running workspace, so Welcome omits them.
      expect((await agent.welcomeProfiles()).choices).toEqual([]);
      expect(mints).toBe(1);

      const { id } = choices[0]!;
      await agent.selectProfile(workspace.id, { kind: "new", id }, () => {});
      expect(mints).toBe(2);
      const selected = agent.current(workspace.id, id)!.chat;
      await agent.selectProfile(workspace.id, { kind: "saved", id }, () => {});
      expect(agent.current(workspace.id, id)?.chat).toBe(selected);
      expect(mints).toBe(2);
      // Choosing a connection retires the workspace's previous worker, and the
      // chat the default model started stays in the shared list.
      expect(agent.current(workspace.id)).toBeNull();
      expect((await selected.list()).sessionIds).toEqual([originalSession.id]);
      await selected.load(originalSession.id);
      const session = await selected.create();
      await selected.submit(session, "alternate-input", "Use this model.");
      await vi.waitFor(async () => {
        expect((await selected.observe(session)).latest?.status).toBe(
          "succeeded"
        );
      });
      expect(requests).toEqual([
        expect.objectContaining({
          model: model.id,
          max_completion_tokens: model.limits.max_output_tokens,
        }),
      ]);

      await vi.waitFor(() =>
        expect(onLifecycle).toHaveBeenCalledExactlyOnceWith(
          workspace.id,
          expect.objectContaining({
            kind: "settled",
            status: "succeeded",
            sessionId: session.id,
          }),
          expect.any(Function),
          id
        )
      );
      const current = onLifecycle.mock.calls[0]![2];
      expect(current()).toBe(true);
      await agent.close();
      expect(current()).toBe(false);
      vi.resetModules();
      agent = await launch();
      await agent.selectProfile(workspace.id, { kind: "saved", id }, () => {});
      const restored = agent.current(workspace.id, id)!.chat;
      const saved = await restored.load(session.id);
      expect(
        (await restored.transcript(saved)).map(({ text }) => text)
      ).toContain("Alternate model answered.");
      expect(requests).toHaveLength(1);
      expect(onLifecycle).toHaveBeenCalledTimes(1);

      sidecar.listGatewayModels.mockResolvedValueOnce([]);
      await expect(
        agent.selectProfile(workspace.id, { kind: "saved", id }, () => {})
      ).rejects.toThrow("native_provider_model_unavailable");

      await agent.close();
      organization = 18;
      vi.resetModules();
      agent = await launch();
      await agent.ensure(workspace.id);
      // A saved connection keeps its identity; its context window comes from
      // a current choice, which an unavailable connection no longer has.
      const { contextWindow: _window, ...identity } = choices[0]!;
      expect((await agent.profiles(workspace.id)).saved).toEqual([
        { ...identity, available: false },
      ]);
      await expect(
        agent.selectProfile(workspace.id, { kind: "saved", id }, () => {})
      ).rejects.toThrow("native_chat_profile_changed");
      expect(agent.current(workspace.id, id)).toBeNull();
      expect(mints).toBe(4);
      expect(requests).toHaveLength(1);
    } finally {
      await agent?.close();
      await fs.rm(base, { recursive: true, force: true });
    }
  },
  20_000
);

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "runs a nested deck with only its physical child grant and its own durable transcript",
  async () => {
    const base = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-native-deck-")
    );
    const source = {
      userDataPath: path.join(base, "agent"),
      desktopUserDataPath: path.join(base, "browser"),
      providerHome: path.join(base, "providers"),
      mediaRoot: path.join(base, "media"),
    };
    const parent = path.join(base, "workspace");
    const first = path.join(parent, "Launch.canvas");
    const sibling = path.join(parent, "Sibling.canvas");
    const reads = [
      "inside.txt",
      "../outside.txt",
      "../Sibling.canvas/inside.txt",
      "alias.txt",
    ];
    const received: string[] = [];
    let agent: import("./native-desktop-agent").NativeDesktopAgent | undefined;
    try {
      for (const folder of [
        first,
        sibling,
        source.userDataPath,
        source.desktopUserDataPath,
      ])
        await fs.mkdir(folder, { recursive: true, mode: 0o700 });
      await fs.writeFile(path.join(first, "inside.txt"), "Launch deck content");
      await fs.writeFile(
        path.join(sibling, "inside.txt"),
        "Sibling deck content"
      );
      await fs.writeFile(
        path.join(parent, "outside.txt"),
        "Parent workspace content"
      );
      await fs.symlink(
        path.join(parent, "outside.txt"),
        path.join(first, "alias.txt")
      );
      const catalog = new NativeWorkspaceCatalog({
        browserData: source.desktopUserDataPath,
        projectsRoot: path.join(base, "projects"),
        protectedPaths: [source.userDataPath],
      });
      const selected = await catalog.openSelected(parent);
      const one = await catalog.nestedDeck(selected.id, "Launch.canvas");
      const two = await catalog.nestedDeck(selected.id, "Sibling.canvas");
      sidecar.selectNativeChat.mockReturnValue({
        ...source,
        configHome: source.providerHome,
      });
      sidecar.forgetWorkspace.mockImplementation((id) => catalog.forget(id));
      sidecar.nativeConfiguredEndpoint.mockResolvedValue({
        provider: "openai-compatible",
        endpoint: "http://127.0.0.1:1/v1",
        model: "fixture",
        providerNetwork: {
          prepare: () => async (body) => {
            const next = reads[received.length];
            received.push(body.toString());
            const delta = next
              ? {
                  tool_calls: [
                    {
                      index: 0,
                      id: `read-${received.length}`,
                      type: "function",
                      function: {
                        name: "read_file",
                        arguments: JSON.stringify({ path: next }),
                      },
                    },
                  ],
                }
              : { content: "Finished checking the deck boundary." };
            const event = JSON.stringify({
              id: "fixture",
              choices: [
                {
                  index: 0,
                  delta,
                  finish_reason: next ? "tool_calls" : "stop",
                },
              ],
            });
            return new Response(`data: ${event}\n\ndata: [DONE]\n\n`, {
              headers: { "content-type": "text/event-stream" },
            });
          },
        },
      });
      const { NativeDesktopAgent } = await import("./native-desktop-agent");
      agent = await NativeDesktopAgent.prepareFresh(
        new DesktopAccountSession({
          base_url: "https://editor.example.test",
          fetch: vi.fn<typeof fetch>(),
        }),
        resources!,
        {
          provider: { kind: "endpoint", id: "fixture" },
          openExternal: vi.fn<() => Promise<void>>(),
          workspaceCatalogRoot: path.dirname(catalog.directory),
          workspaceGrant: catalog.fileGrant.bind(catalog),
          selectableProfiles: true,
        }
      );
      await agent.ensureNestedDeck(one, () => {});
      await agent.ensureNestedDeck(two, () => {});
      expect(agent.current(selected.id)).toBeNull();
      expect(agent.current(one.workspaceId)).toBeNull();
      const launch = agent.currentNestedDeck(
        selected.id,
        one.workspaceId
      )!.chat;
      const other = agent.currentNestedDeck(selected.id, two.workspaceId)!.chat;
      const session = await launch.create();
      await expect(other.load(session.id)).rejects.toThrow("session_missing");
      await launch.submit(
        session,
        "fixture-input",
        "Check the deck boundary.",
        "plan"
      );
      await vi.waitFor(
        async () =>
          expect((await launch.observe(session)).latest?.status).toBe(
            "succeeded"
          ),
        { timeout: 6000 }
      );
      expect(received).toHaveLength(5);
      const providerContext = received.join("\n");
      expect(providerContext).toContain("Launch deck content");
      expect(providerContext).not.toContain("Parent workspace content");
      expect(providerContext).not.toContain("Sibling deck content");
      await agent.closeNestedDeck(one.workspaceId);
      await agent.ensureNestedDeck(one, () => {});
      const reopened = agent.currentNestedDeck(
        selected.id,
        one.workspaceId
      )!.chat;
      expect(
        (await reopened.transcript(await reopened.load(session.id))).map(
          ({ text }) => text
        )
      ).toContain("Finished checking the deck boundary.");
      expect(received).toHaveLength(5);
      await agent.forgetWorkspace(selected.id);
      expect(agent.currentNestedDeck(selected.id, one.workspaceId)).toBeNull();
      expect(agent.currentNestedDeck(selected.id, two.workspaceId)).toBeNull();
      await expect(
        catalog.nestedDeck(selected.id, "Launch.canvas")
      ).rejects.toThrow("workspace_not_registered");
    } finally {
      await agent?.close();
      await fs.rm(base, { recursive: true, force: true });
    }
  },
  15_000
);

function heldExchange() {
  return {
    cancelled: vi.fn<() => void>(),
    drain: Promise.withResolvers<void>(),
  };
}

it.runIf(Boolean(resources) && process.platform !== "win32").each([
  {
    selection: {
      kind: "byok",
      id: "openrouter",
      model: "openai/gpt-5.6-terra",
    } as const,
    endpoint: "https://openrouter.ai/api/v1",
    model: "openai/gpt-5.6-terra",
    unavailable: "native_provider_byok_key_missing",
    keyed: true,
    png: true,
  },
  {
    selection: {
      kind: "byok",
      id: "openrouter",
      model: "openai/gpt-5.5",
    } as const,
    endpoint: "https://openrouter.ai/api/v1",
    model: "openai/gpt-5.5",
    unavailable: "native_provider_byok_key_missing",
    keyed: true,
    png: true,
  },
  {
    selection: {
      kind: "byok",
      id: "vercel",
      model: "openai/gpt-5.6-terra",
    } as const,
    endpoint: "https://ai-gateway.vercel.sh/v1",
    model: "openai/gpt-5.6-terra",
    unavailable: "native_provider_byok_key_missing",
    keyed: true,
    png: false,
  },
  {
    selection: { kind: "endpoint", id: OLLAMA_ENDPOINT_PRESET.id } as const,
    endpoint: OLLAMA_ENDPOINT_PRESET.base_url,
    model: "qwen3:4b",
    unavailable: "native_provider_endpoint_not_approved",
    keyed: false,
    png: false,
  },
  {
    selection: { kind: "endpoint", id: "local" } as const,
    endpoint: "https://openrouter.ai/api/v1",
    model: "openai/gpt-5.6-terra",
    unavailable: "native_provider_endpoint_not_approved",
    keyed: false,
    png: false,
  },
  {
    selection: { kind: "endpoint", id: "local" } as const,
    endpoint: "https://openrouter.ai/api/v1",
    model: "openai/gpt-5.6-terra",
    unavailable: "native_provider_endpoint_not_approved",
    keyed: true,
    png: false,
  },
])(
  "starts $selection.kind/$model at $endpoint with keyed=$keyed and PNG=$png",
  async ({ selection, endpoint, model, unavailable, keyed, png }) => {
    const base = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-native-provider-launch-")
    );
    const source = {
      userDataPath: path.join(base, "agent"),
      desktopUserDataPath: path.join(base, "browser"),
      providerHome: path.join(base, "providers"),
      mediaRoot: path.join(base, "media"),
    };
    const root = path.join(base, "workspace");
    const secrets = new SecretsStore(
      new AuthStore(source.userDataPath),
      source.providerHome
    );
    const key = `${selection.id}-fixture-key`;
    let approved = false;
    const dispatch = vi.fn<
      (body: Buffer, signal: AbortSignal) => Promise<Response>
    >(async (body) => {
      expect(JSON.parse(body.toString())).toMatchObject({ model });
      return new Response(
        'data: {"id":"fixture","choices":[{"index":0,"delta":{"content":"Selected provider answered"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        { headers: { "content-type": "text/event-stream" } }
      );
    });
    const prepare = vi.fn<NativeProviderNetwork["prepare"]>(() => dispatch);
    let agent: import("./native-desktop-agent").NativeDesktopAgent | undefined;
    try {
      await Promise.all(
        [
          root,
          source.userDataPath,
          source.desktopUserDataPath,
          source.providerHome,
        ].map((directory) => fs.mkdir(directory, { mode: 0o700 }))
      );
      sidecar.selectNativeChat.mockReturnValue({
        ...source,
        configHome: source.providerHome,
      });
      sidecar.nativeBuiltInByok.mockImplementation((id, modelId) =>
        NativeProviderSelection.builtInByok(id, modelId, {
          credentialHome: source.providerHome,
          hasKey: (id) => secrets.has(id),
          network: async () => ({ prepare }),
        })
      );
      const configurations = [
        { id: selection.id, base_url: endpoint, models: [{ id: model }] },
      ];
      sidecar.listProviderEndpoints.mockResolvedValue(configurations);
      sidecar.nativeConfiguredEndpoint.mockImplementation((id, modelId) =>
        NativeProviderSelection.configuredEndpoint(id, modelId, {
          list: async () => configurations,
          hasKey: (id) => secrets.has(id),
          credentialHome: source.providerHome,
          network: async () => {
            if (!approved)
              throw new Error("native_provider_endpoint_not_approved");
            return { prepare };
          },
        })
      );
      const catalog = new NativeWorkspaceCatalog({
        browserData: source.desktopUserDataPath,
        projectsRoot: path.join(base, "projects"),
        protectedPaths: [source.userDataPath, source.providerHome],
      });
      const workspace = await catalog.openSelected(root);
      sidecar.findWorkspace.mockImplementation((id) => catalog.find(id));
      const { NativeDesktopAgent } = await import("./native-desktop-agent");
      agent = await NativeDesktopAgent.prepareFresh(
        new DesktopAccountSession({
          base_url: "https://editor.example.test",
          fetch: vi.fn<typeof fetch>(),
        }),
        resources!,
        { provider: selection, openExternal: vi.fn<() => Promise<void>>() }
      );
      if (selection.kind === "endpoint" && keyed) {
        await secrets.set(selection.id, key);
        await secrets.set("openrouter", "unrelated-fixture-key");
      }
      await expect(agent.ensure(workspace.id)).rejects.toThrow(unavailable);
      expect(agent.current(workspace.id)).toBeNull();
      expect(prepare).not.toHaveBeenCalled();
      if (selection.kind === "byok") await secrets.set(selection.id, key);
      else approved = true;

      await agent.ensure(workspace.id);
      const chat = agent.current(workspace.id)!.chat;
      expect(chat.acceptsPng).toBe(png);
      const session = await chat.create();
      const input = {
        action: "submit",
        inputId: "selected-provider",
        text: "Hello.",
        png: Uint8Array.from(Buffer.from(PNG, "base64")).buffer,
        operatingRegime: "act",
      };
      const submitText = async () => {
        await expect(chat.submitImage(session, input)).rejects.toThrow(
          "image_input_unavailable"
        );
        await expect(chat.inputReceipt(session, input.inputId)).rejects.toThrow(
          "input_unavailable"
        );
        expect(dispatch).not.toHaveBeenCalled();
        return chat.submit(session, input.inputId, input.text);
      };
      const submitted = await (png
        ? chat.submitImage(session, input)
        : submitText());
      await vi.waitFor(
        async () => {
          expect((await chat.observe(session)).latest).toMatchObject({
            turnId: submitted.turnId,
            status: "succeeded",
          });
        },
        { timeout: 5000 }
      );
      const verifyImageReceipt = async () => {
        const retained = await chat.inputReceipt(session, input.inputId);
        expect(retained.turnId).toBe(submitted.turnId);
        expect(await chat.submitImage(session, input)).toEqual(retained);
        await expect(
          chat.submitImage(session, {
            ...input,
            png: Uint8Array.from(Buffer.from(OTHER_PNG, "base64")).buffer,
          })
        ).rejects.toThrow("submission_input_changed");
      };
      if (png) await verifyImageReceipt();
      expect(dispatch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(dispatch.mock.calls[0][0].toString());
      expect(
        body.messages.filter(
          (message: { role: string }) => message.role === "user"
        )
      ).toEqual([
        {
          role: "user",
          content: png
            ? [
                { type: "text", text: input.text },
                {
                  type: "image_url",
                  image_url: { url: `data:image/png;base64,${PNG}` },
                },
              ]
            : input.text,
        },
      ]);
      expect(prepare.mock.calls[0][0]).toBe(`${endpoint}/chat/completions`);
      expect(prepare.mock.calls[0][1].get("authorization")).toBe(
        keyed ? `Bearer ${key}` : null
      );
      // Configured endpoints can reuse the approved local model for predictions.
      const prompt =
        selection.kind === "endpoint"
          ? await chat.predictPrompt!(session, await chat.observe(session))
          : null;
      const usesOllama = selection.id === OLLAMA_ENDPOINT_PRESET.id;
      expect(prompt).toBe(usesOllama ? "Selected provider answered" : null);
      expect(dispatch).toHaveBeenCalledTimes(usesOllama ? 2 : 1);
      expect(
        prepare.mock.calls
          .slice(1)
          .map(([url, headers]) => [url, headers.get("authorization")])
      ).toEqual(usesOllama ? [[`${endpoint}/chat/completions`, null]] : []);
      expect(sidecar.nativeAgentGatewayConnection).not.toHaveBeenCalled();
    } finally {
      await agent?.close();
      await fs.rm(base, { recursive: true, force: true });
    }
  },
  30_000
);

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "uses the sealed subscription owner and gates replacement on signed-out workspace custody",
  async () => {
    const base = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-native-desktop-agent-")
    );
    const source = {
      userDataPath: path.join(base, "agent"),
      desktopUserDataPath: path.join(base, "browser"),
      providerHome: path.join(base, "agent"),
      mediaRoot: path.join(base, "media"),
    };
    const root = path.join(base, "workspace");
    const auth = new AuthStore(source.userDataPath);
    const signOutWork = heldExchange();
    const quitWork = heldExchange();
    const held = [signOutWork, quitWork];
    const dispatch = vi.fn<
      (body: Buffer, signal: AbortSignal) => Promise<Response>
    >(async (_body, signal) => {
      const exchange = held.shift();
      if (!exchange) throw new Error("unexpected fixture dispatch");
      const abort = () => exchange.cancelled();
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
      await exchange.drain.promise;
      signal.throwIfAborted();
      throw new Error("fixture unexpectedly released before cancellation");
    });
    const prepare = vi.fn<NativeProviderNetwork["prepare"]>((target) =>
      target === CHATGPT_RESPONSES_URL ? dispatch : null
    );
    const browser = vi.fn<(url: string) => Promise<void>>();
    const accountHttp = vi.fn<typeof fetch>();
    const seed = (lineage: string) =>
      auth.set("chatgpt", {
        type: "oauth",
        access: "fixture-access",
        refresh: "fixture-refresh",
        account_id: "fixture-account",
        expires: Math.floor(Date.now() / 1000) + 3600,
        metadata: { credential_id: lineage },
      });
    let agent: import("./native-desktop-agent").NativeDesktopAgent | undefined;
    try {
      await Promise.all(
        [root, source.userDataPath, source.desktopUserDataPath].map(
          (directory) => fs.mkdir(directory, { mode: 0o700 })
        )
      );
      await seed("fixture-lineage");
      sidecar.selectNativeChat.mockReturnValue({
        ...source,
        configHome: source.providerHome,
      });
      sidecar.nativeAgentSubscriptionSettings.mockResolvedValue({
        userDataPath: source.userDataPath,
        network: { prepare },
      });
      const catalog = new NativeWorkspaceCatalog({
        browserData: source.desktopUserDataPath,
        projectsRoot: path.join(base, "projects"),
        protectedPaths: [source.userDataPath],
      });
      const workspace = await catalog.openSelected(root);
      sidecar.findWorkspace.mockImplementation((id) => catalog.find(id));
      const { NativeDesktopAgent } = await import("./native-desktop-agent");
      agent = await NativeDesktopAgent.prepareFresh(
        new DesktopAccountSession({
          base_url: "https://editor.example.test",
          fetch: accountHttp,
        }),
        resources!,
        { provider: "chatgpt", openExternal: browser }
      );
      const oauth = agent.chatgptOAuth!;
      const status = await oauth.status();
      expect(status).toMatchObject({
        ready: true,
        account: { id: "fixture-account" },
      });
      expect(JSON.stringify(status)).not.toContain("fixture-access");

      await agent.ensure(workspace.id);
      await agent.clearAccount();
      expect(agent.current(workspace.id)).toBeNull();
      expect(await auth.getStoredOAuth("chatgpt")).toMatchObject({
        account_id: "fixture-account",
      });
      await agent.ensure(workspace.id);
      const chat = agent.current(workspace.id)!.chat;
      const session = await chat.create();
      await chat.submit(
        session,
        "fixture-input",
        "A held subscription request"
      );
      await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
      expect(prepare.mock.calls[0][0]).toBe(CHATGPT_RESPONSES_URL);
      expect(prepare.mock.calls[0][1].get("authorization")).toBe(
        "Bearer fixture-access"
      );

      const signOut = oauth.signOut();
      await vi.waitFor(() =>
        expect(signOutWork.cancelled).toHaveBeenCalledTimes(1)
      );
      await expect(oauth.connect()).rejects.toThrow(
        "native_chatgpt_connection_unavailable"
      );
      expect(agent.current(workspace.id)).toBeNull();
      const replacement = agent.ensure(workspace.id);
      const completed = vi.fn<() => void>();
      void replacement.then(completed, completed);
      await vi.waitFor(async () =>
        expect(await auth.getStoredOAuth("chatgpt")).toBeUndefined()
      );
      expect(completed).not.toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledTimes(1);
      signOutWork.drain.resolve();
      await expect(signOut).resolves.toMatchObject({
        ready: false,
        signed_in: false,
      });
      await expect(replacement).rejects.toMatchObject({
        code: "chatgpt_not_signed_in",
      });
      await seed("fixture-reconnected");
      await agent.ensure(workspace.id);
      const reconnected = agent.current(workspace.id)!.chat;
      const fresh = await reconnected.create();
      await reconnected.submit(
        fresh,
        "fixture-quit",
        "Another held subscription request"
      );
      await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2));
      const quit = agent.close();
      const quitCompleted = vi.fn<() => void>();
      void quit.then(quitCompleted, quitCompleted);
      await vi.waitFor(() =>
        expect(quitWork.cancelled).toHaveBeenCalledTimes(1)
      );
      expect(agent.current(workspace.id)).toBeNull();
      expect(quitCompleted).not.toHaveBeenCalled();
      quitWork.drain.resolve();
      await quit;
      await expect(agent.ensure(workspace.id)).rejects.toThrow(
        "native_workspace_closing"
      );
      expect(await auth.getStoredOAuth("chatgpt")).toMatchObject({
        metadata: { credential_id: "fixture-reconnected" },
      });
      expect(sidecar.nativeAgentSubscriptionSettings).toHaveBeenCalledTimes(1);
      expect(sidecar.nativeAgentGatewayConnection).not.toHaveBeenCalled();
      expect(accountHttp).not.toHaveBeenCalled();
      expect(browser).not.toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledTimes(2);
    } finally {
      signOutWork.drain.resolve();
      quitWork.drain.resolve();
      try {
        await agent?.close();
      } finally {
        await fs.rm(base, { recursive: true, force: true });
      }
    }
  },
  25_000
);

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "preserves retained work before selecting saved OpenRouter and Vercel connections for idle chats",
  async () => {
    const base = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-native-provider-picker-")
    );
    const source = {
      userDataPath: path.join(base, "agent"),
      desktopUserDataPath: path.join(base, "browser"),
      providerHome: path.join(base, "providers"),
      mediaRoot: path.join(base, "media"),
    };
    const root = path.join(base, "workspace");
    const secrets = new SecretsStore(
      new AuthStore(source.userDataPath),
      source.providerHome
    );
    const model = "openai/gpt-5.6-terra";
    const origin = "https://editor.example.test";
    const gatewayTarget = origin + "/api/v1/ai/chat/completions";
    const providers = [
      ["openrouter", "OpenRouter", "https://openrouter.ai/api/v1"],
      ["vercel", "Vercel AI Gateway", "https://ai-gateway.vercel.sh/v1"],
    ] as const;
    const requested: Array<{ target: string; model: string }> = [];
    const prepare: NativeProviderNetwork["prepare"] = (target, headers) => {
      const provider = providers.find(
        ([, , endpoint]) => target === endpoint + "/chat/completions"
      );
      if (!provider && target !== gatewayTarget) return null;
      expect(headers.get("authorization")).toBe(
        provider ? `Bearer ${provider[0]}-fixture-key` : "Bearer fixture.gg.key"
      );
      return async (body) => {
        const request = JSON.parse(body.toString());
        requested.push({ target, model: request.model });
        const chunk = {
          id: "provider-picker-fixture",
          choices: [
            {
              index: 0,
              delta: provider
                ? { content: provider[1] + " answered." }
                : {
                    tool_calls: [
                      {
                        index: 0,
                        id: "fixture-question",
                        type: "function",
                        function: {
                          name: "question",
                          arguments: JSON.stringify({
                            questions: [
                              {
                                id: "continue_chat",
                                question: "Keep the original chat waiting?",
                                options: [
                                  { label: "Keep" },
                                  { label: "Continue" },
                                ],
                              },
                            ],
                          }),
                        },
                      },
                    ],
                  },
              finish_reason: provider ? "stop" : "tool_calls",
            },
          ],
        };
        return new Response(
          `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`,
          { headers: { "content-type": "text/event-stream" } }
        );
      };
    };
    let agent: import("./native-desktop-agent").NativeDesktopAgent | undefined;
    try {
      await Promise.all(
        [
          root,
          source.userDataPath,
          source.desktopUserDataPath,
          source.providerHome,
        ].map((directory) => fs.mkdir(directory, { mode: 0o700 }))
      );
      sidecar.selectNativeChat.mockReturnValue({
        ...source,
        configHome: source.providerHome,
      });
      sidecar.listProviderEndpoints.mockResolvedValue([]);
      sidecar.nativeBuiltInByok.mockImplementation((id, selected) =>
        NativeProviderSelection.builtInByok(id, selected, {
          credentialHome: source.providerHome,
          hasKey: (id) => secrets.has(id),
          network: async () => ({ prepare }),
        })
      );
      sidecar.nativeAgentGatewayConnection.mockImplementation(
        (account, organizationId, signal) =>
          NativeGatewayConnection.open({
            origin,
            account,
            network: { prepare },
            organizationId,
            signal,
          })
      );
      const workspaces = new NativeWorkspaceCatalog({
        browserData: source.desktopUserDataPath,
        projectsRoot: path.join(base, "projects"),
        protectedPaths: [source.userDataPath, source.providerHome],
      });
      const workspace = await workspaces.openSelected(root);
      sidecar.findWorkspace.mockImplementation((id) => workspaces.find(id));
      sidecar.forgetWorkspace.mockImplementation((id) => workspaces.forget(id));
      const launch = async () => {
        const { NativeDesktopAgent } = await import("./native-desktop-agent");
        return NativeDesktopAgent.prepareFresh(
          new DesktopAccountSession({
            base_url: origin,
            fetch: async () =>
              Response.json({
                token: "fixture.gg.key",
                account_subject: "fixture-user",
                expires_at: new Date(Date.now() + 120_000).toISOString(),
                organization: { id: 1 },
              }),
          }),
          resources!,
          {
            provider: "gateway",
            openExternal: async () => {},
            selectableProfiles: true,
          }
        );
      };
      agent = await launch();
      const desktop = agent;
      expect(await desktop.profiles(workspace.id)).toEqual({
        modelChanges: true,
        defaultContextWindow: expect.any(Number),
        defaultGoalSpending: true,
        choices: [],
        saved: [],
      });
      for (const [id] of providers) await secrets.set(id, `${id}-fixture-key`);
      await desktop.ensure(workspace.id);
      const original = desktop.current(workspace.id)!.chat;
      const pending = await original.create();
      await original.submit(pending, "gateway-input", "Keep waiting.");
      await vi.waitFor(async () =>
        expect((await original.observe(pending)).current?.disposition).toBe(
          "suspended"
        )
      );

      const choices = (await desktop.profiles(workspace.id)).choices;
      const firstProfile = choices.find(
        (choice) => choice.connection === "OpenRouter"
      )!;
      await expect(
        desktop.selectProfile(
          workspace.id,
          { kind: "new", id: firstProfile.id },
          () => {}
        )
      ).rejects.toThrow("native_chat_model_change_retained_turn");
      expect(desktop.current(workspace.id)?.chat).toBe(original);
      expect((await desktop.profiles(workspace.id)).saved).toEqual([]);
      expect(requested).toHaveLength(1);
      await original.stop(
        pending,
        await original.observe(pending),
        "resolve-original-turn"
      );
      await vi.waitFor(async () =>
        expect(await original.observe(pending)).toMatchObject({
          current: null,
          latest: { status: "cancelled" },
        })
      );
      await original.editQueue(pending, await original.observe(pending), {
        action: "resume",
        requestId: "resume-after-original-stop",
        observationId: "main-owned-observation",
      });
      expect(requested).toHaveLength(1);
      const sessions = new Map<
        string,
        { profileId: string; sessionId: string }
      >();
      for (const [, connection] of providers) {
        const { id } = choices.find(
          (choice) =>
            choice.connection === connection && choice.model === "GPT-5.6 Terra"
        )!;
        await desktop.selectProfile(
          workspace.id,
          { kind: "new", id },
          () => {}
        );
        const chat = desktop.current(workspace.id, id)!.chat;
        // Once retained work is resolved, the next deliberate input uses the
        // selected connection and the same chat's visible history.
        expect(desktop.current(workspace.id)).toBeNull();
        expect((await chat.list()).sessionIds).toEqual([
          ...[...sessions.values()].map(({ sessionId }) => sessionId).reverse(),
          pending.id,
        ]);
        const gateway = await chat.load(pending.id);
        await chat.submit(
          gateway,
          `continue-${sessions.size}`,
          "Continue here."
        );
        await vi.waitFor(async () =>
          expect(await chat.observe(gateway)).toMatchObject({
            current: null,
            latest: { status: "succeeded" },
          })
        );
        const session = await chat.create();
        await chat.submit(session, "byok-input", "Use the selected model.");
        await vi.waitFor(
          async () =>
            expect(await chat.observe(session)).toMatchObject({
              latest: { status: "succeeded" },
            }),
          { timeout: 5000 }
        );
        sessions.set(connection, { profileId: id, sessionId: session.id });
      }
      expect(
        new Set([...sessions.values()].map(({ profileId }) => profileId)).size
      ).toBe(2);
      // The resolved original worker is retired, with its chat still saved.
      await expect(original.observe(pending)).rejects.toThrow(
        "native_chat_closed"
      );
      expect(requested.slice(1)).toEqual(
        providers.flatMap(([, , endpoint]) =>
          Array.from({ length: 2 }, () => ({
            target: endpoint + "/chat/completions",
            model,
          }))
        )
      );

      await desktop.close();
      vi.resetModules();
      agent = await launch();
      const reopened = agent;
      const openrouter = sessions.get("OpenRouter")!;
      const vercel = sessions.get("Vercel AI Gateway")!;
      await reopened.selectProfile(
        workspace.id,
        { kind: "saved", id: openrouter.profileId },
        () => {}
      );
      const restored = reopened.current(
        workspace.id,
        openrouter.profileId
      )!.chat;
      expect((await restored.list()).sessionIds).toEqual([
        vercel.sessionId,
        openrouter.sessionId,
        pending.id,
      ]);
      const saved = await restored.load(openrouter.sessionId);
      expect(
        (await restored.transcript(saved)).map(({ text }) => text)
      ).toContain("OpenRouter answered.");
      await secrets.delete("vercel");
      expect((await reopened.profiles(workspace.id)).saved).toContainEqual(
        expect.objectContaining({ id: vercel.profileId, available: false })
      );
      await expect(
        reopened.selectProfile(
          workspace.id,
          { kind: "saved", id: vercel.profileId },
          () => {}
        )
      ).rejects.toThrow("native_provider_byok_key_missing");
      expect(reopened.current(workspace.id)).toBeNull();
      expect(reopened.current(workspace.id, vercel.profileId)).toBeNull();
      expect(requested).toHaveLength(5);

      await reopened.ensure(workspace.id);
      const defaultChat = reopened.current(workspace.id)!.chat;
      const captured = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      sidecar.findWorkspace.mockImplementationOnce(async (id) => {
        const old = await workspaces.find(id);
        captured.resolve();
        await release.promise;
        return old;
      });
      const stale = reopened
        .ensure(workspace.id)
        .catch((error: unknown) => error);
      await captured.promise;
      try {
        const forgotten = reopened.forgetWorkspace(workspace.id);
        expect(reopened.current(workspace.id)).toBeNull();
        expect(reopened.current(workspace.id, openrouter.profileId)).toBeNull();
        await forgotten;
        await expect(defaultChat.create()).rejects.toThrow(
          "native_chat_closed"
        );
        await expect(restored.create()).rejects.toThrow("native_chat_closed");
        expect(await workspaces.find(workspace.id)).toBeNull();
        await expect(reopened.ensure(workspace.id)).rejects.toThrow(
          "native_workspace_not_registered"
        );
        const registered = await workspaces.openSelected(root);
        expect(registered.id).toBe(workspace.id);
      } finally {
        release.resolve();
      }
      expect(await stale).toMatchObject({
        message: "native_workspace_closing",
      });
      expect(reopened.current(workspace.id)).toBeNull();
      await reopened.selectProfile(
        workspace.id,
        { kind: "saved", id: openrouter.profileId },
        () => {}
      );
      const reopenedProfile = reopened.current(
        workspace.id,
        openrouter.profileId
      )!.chat;
      expect(reopenedProfile).not.toBe(restored);
      expect((await reopenedProfile.list()).sessionIds).toEqual([
        vercel.sessionId,
        openrouter.sessionId,
        pending.id,
      ]);
      expect(requested).toHaveLength(5);
    } finally {
      await agent?.close();
      await fs.rm(base, { recursive: true, force: true });
    }
  },
  // Multiple native workers and credential checks span two host lifetimes.
  60_000
);
