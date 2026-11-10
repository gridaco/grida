// GRIDA-SEC-004 / GRIDA-SEC-008 — native Desktop provider lifetime fixtures.
import { AuthStore, SecretsStore } from "@grida/daemon/server";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import { CHATGPT_RESPONSES_URL } from "../chatgpt-configuration";
import { DesktopAccountSession } from "./account-session";
import { NativeGatewayConnection } from "./native-gateway-connection";
import { NativeProviderSelection } from "./native-provider-selection";
import { NativeWorkspaceCatalog } from "./native-workspace-catalog";
import type { NativeProviderNetwork } from "./native-provider-egress";

const sidecar = vi.hoisted(() => ({
  sealLegacyChatForColdStart:
    vi.fn<
      typeof import("./agent-sidecar-supervisor").sealLegacyChatForColdStart
    >(),
  nativeAgentSubscriptionSettings:
    vi.fn<
      typeof import("./agent-sidecar-supervisor").nativeAgentSubscriptionSettings
    >(),
  nativeAgentGatewayConnection:
    vi.fn<
      typeof import("./agent-sidecar-supervisor").nativeAgentGatewayConnection
    >(),
  findWorkspace:
    vi.fn<
      typeof import("./agent-sidecar-client").agentSidecarClient.findWorkspace
    >(),
  listProviderEndpoints:
    vi.fn<
      typeof import("./agent-sidecar-client").agentSidecarClient.listProviderEndpoints
    >(),
  nativeBuiltInByok:
    vi.fn<
      typeof import("./agent-sidecar-client").agentSidecarClient.nativeBuiltInByok
    >(),
  nativeConfiguredEndpoint:
    vi.fn<
      typeof import("./agent-sidecar-client").agentSidecarClient.nativeConfiguredEndpoint
    >(),
}));

vi.mock("./agent-sidecar-supervisor", () => sidecar);
vi.mock("./agent-sidecar-client", () => ({ agentSidecarClient: sidecar }));

const resources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPg/88AAAIvAQ+3s0AMAAAAAElFTkSuQmCC";
const OTHER_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z88AAAMfAQ+5sXHtAAAAAElFTkSuQmCC";

beforeEach(() => vi.resetModules());

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
    png: false,
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
    selection: { kind: "endpoint", id: "local" } as const,
    endpoint: "http://127.0.0.1:11434/v1",
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
      scratchBase: path.join(base, "scratch"),
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
      sidecar.sealLegacyChatForColdStart.mockResolvedValue(source);
      sidecar.nativeBuiltInByok.mockImplementation((id, modelId) =>
        NativeProviderSelection.builtInByok(id, modelId, {
          credentialHome: source.providerHome,
          hasKey: (id) => secrets.has(id),
          network: async () => ({ prepare }),
        })
      );
      sidecar.nativeConfiguredEndpoint.mockImplementation((id, modelId) =>
        NativeProviderSelection.configuredEndpoint(id, modelId, {
          list: async () => [
            { id: "local", base_url: endpoint, models: [{ id: model }] },
          ],
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
      scratchBase: path.join(base, "scratch"),
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
      sidecar.sealLegacyChatForColdStart.mockResolvedValue(source);
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
  "keeps saved OpenRouter and Vercel model chats with their exact workers and custody",
  async () => {
    const base = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-native-provider-picker-")
    );
    const source = {
      userDataPath: path.join(base, "agent"),
      desktopUserDataPath: path.join(base, "browser"),
      scratchBase: path.join(base, "scratch"),
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
                            question: "Keep the original chat waiting?",
                            options: ["Keep", "Continue"],
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
      sidecar.sealLegacyChatForColdStart.mockResolvedValue(source);
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
        expect((await chat.list()).sessionIds).toEqual([]);
        await expect(chat.load(pending.id)).rejects.toThrow("session_missing");
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
      expect(desktop.current(workspace.id)?.chat).toBe(original);
      expect((await original.observe(pending)).current?.disposition).toBe(
        "suspended"
      );
      expect(requested.slice(1)).toEqual(
        providers.map(([, , endpoint]) => ({
          target: endpoint + "/chat/completions",
          model,
        }))
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
        openrouter.sessionId,
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
      expect(requested).toHaveLength(3);
    } finally {
      await agent?.close();
      await fs.rm(base, { recursive: true, force: true });
    }
  },
  30_000
);
