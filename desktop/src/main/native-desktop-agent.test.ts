// GRIDA-SEC-004 / GRIDA-SEC-008 — native Desktop provider lifetime fixtures.
import { AuthStore } from "@grida/daemon/server";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { CHATGPT_RESPONSES_URL } from "../chatgpt-configuration";
import { DesktopAccountSession } from "./account-session";
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
  listWorkspaces:
    vi.fn<
      typeof import("./agent-sidecar-client").agentSidecarClient.listWorkspaces
    >(),
}));

vi.mock("./agent-sidecar-supervisor", () => sidecar);
vi.mock("./agent-sidecar-client", () => ({ agentSidecarClient: sidecar }));

const resources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;

function heldExchange() {
  return {
    cancelled: vi.fn<() => void>(),
    drain: Promise.withResolvers<void>(),
  };
}

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
      sidecar.listWorkspaces.mockResolvedValue([
        {
          id: "fixture-workspace",
          root,
          name: "Fixture",
          opened_at: 0,
          pinned: false,
        },
      ]);
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

      await agent.ensure("fixture-workspace");
      await agent.clearAccount();
      expect(agent.current("fixture-workspace")).toBeNull();
      expect(await auth.getStoredOAuth("chatgpt")).toMatchObject({
        account_id: "fixture-account",
      });
      await agent.ensure("fixture-workspace");
      const chat = agent.current("fixture-workspace")!.chat;
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
      expect(agent.current("fixture-workspace")).toBeNull();
      const replacement = agent.ensure("fixture-workspace");
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
      await agent.ensure("fixture-workspace");
      const reconnected = agent.current("fixture-workspace")!.chat;
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
      expect(agent.current("fixture-workspace")).toBeNull();
      expect(quitCompleted).not.toHaveBeenCalled();
      quitWork.drain.resolve();
      await quit;
      await expect(agent.ensure("fixture-workspace")).rejects.toThrow(
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
