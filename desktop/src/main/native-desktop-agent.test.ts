// GRIDA-SEC-004 / GRIDA-SEC-008 — native Desktop provider lifetime fixtures.
import { AuthStore, SecretsStore } from "@grida/daemon/server";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import { CHATGPT_RESPONSES_URL } from "../chatgpt-configuration";
import { DesktopAccountSession } from "./account-session";
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
      model: "openai/gpt-5.5",
    } as const,
    endpoint: "https://openrouter.ai/api/v1",
    model: "openai/gpt-5.5",
    unavailable: "native_provider_byok_key_missing",
  },
  {
    selection: { kind: "byok", id: "vercel", model: "openai/gpt-5.5" } as const,
    endpoint: "https://ai-gateway.vercel.sh/v1",
    model: "openai/gpt-5.5",
    unavailable: "native_provider_byok_key_missing",
  },
  {
    selection: { kind: "endpoint", id: "local" } as const,
    endpoint: "http://127.0.0.1:11434/v1",
    model: "fixture-model",
    unavailable: "native_provider_endpoint_not_approved",
  },
])(
  "starts the exact $selection.id profile through Desktop and refuses an unavailable selection",
  async ({ selection, endpoint, model, unavailable }) => {
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
          hasKey: async () => false,
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
      await expect(agent.ensure(workspace.id)).rejects.toThrow(unavailable);
      expect(agent.current(workspace.id)).toBeNull();
      expect(prepare).not.toHaveBeenCalled();
      if (selection.kind === "byok") await secrets.set(selection.id, key);
      else approved = true;

      await agent.ensure(workspace.id);
      const chat = agent.current(workspace.id)!.chat;
      const session = await chat.create();
      const submitted = await chat.submit(
        session,
        "selected-provider",
        "Hello."
      );
      await vi.waitFor(
        async () => {
          expect((await chat.observe(session)).latest).toMatchObject({
            turnId: submitted.turnId,
            status: "succeeded",
          });
        },
        { timeout: 5000 }
      );
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(prepare.mock.calls[0][0]).toBe(`${endpoint}/chat/completions`);
      expect(prepare.mock.calls[0][1].get("authorization")).toBe(
        selection.kind === "byok" ? `Bearer ${key}` : null
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
