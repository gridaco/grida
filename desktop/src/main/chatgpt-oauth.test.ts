// GRIDA-SEC-008 — main/sidecar OAuth orchestration and safe-status contract.
import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHATGPT_AUTHORIZE_URL,
  CHATGPT_CALLBACK_URIS,
  CHATGPT_SUBSCRIPTION_CONFIG,
} from "../chatgpt-configuration";
import { ChatGptOAuthCoordinator } from "./chatgpt-oauth";
import type { OAuthLoopbackCallback } from "./oauth-loopback-callback";

const readyStatus = {
  configured: true,
  signed_in: true,
  ready: true,
  signing_in: false,
  expires_at: 1_900_000_000_000,
  account: { id: "account-1", email: "user@example.com", plan: "plus" },
};
const signedOutStatus = {
  configured: true,
  signed_in: false,
  ready: false,
  signing_in: false,
};

describe("ChatGptOAuthCoordinator", () => {
  let callback: FakeCallback;
  let requests: Array<{ path: string; body: Record<string, unknown> }>;
  let openExternal: ReturnType<typeof vi.fn<(url: string) => Promise<void>>>;
  let status: Record<string, unknown> = readyStatus;

  beforeEach(() => {
    callback = new FakeCallback();
    requests = [];
    openExternal = vi.fn<(url: string) => Promise<void>>(async () => {
      await callback.complete();
    });
    status = readyStatus;
  });

  it("binds first, validates the provider URL, persists, then returns only safe status", async () => {
    const coordinator = createCoordinator();
    const result = await coordinator.connect();

    expect(openExternal).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/auth\.openai\.com\/oauth\/authorize\?/)
    );
    expect(requests.map((request) => request.path)).toEqual([
      "/auth/chatgpt/start",
      "/auth/chatgpt/complete",
    ]);
    expect(requests[0]?.body).toEqual({
      redirect_uri: CHATGPT_CALLBACK_URIS[0],
    });
    expect(requests[1]?.body).toMatchObject({
      attempt_id: "attempt_0123456789abcdef",
      code: "one-time-code",
      state: "state_0123456789abcdef",
    });
    expect(result).toEqual(readyStatus);
    expect(JSON.stringify(result)).not.toContain("access-token-must-not-cross");
  });

  it("refuses an unexpected authorization authority and cancels the sidecar attempt", async () => {
    const coordinator = createCoordinator({
      authorization_url:
        "https://auth.openai.com.attacker.example/oauth/authorize",
    });
    await expect(coordinator.connect()).rejects.toThrow(
      /unexpected authorization URL/
    );
    expect(openExternal).not.toHaveBeenCalled();
    expect(requests.map((request) => request.path)).toEqual([
      "/auth/chatgpt/start",
      "/auth/chatgpt/cancel",
    ]);
    expect(callback.attempt.cancel).toHaveBeenCalled();
  });

  it("refuses an authorization URL not correlated to the active attempt", async () => {
    const mismatched = new URL(authorizationUrl());
    mismatched.searchParams.set("state", "state_ffffffffffffffff");
    const coordinator = createCoordinator({
      authorization_url: mismatched.toString(),
    });

    await expect(coordinator.connect()).rejects.toThrow(
      /incomplete authorization URL/
    );
    expect(openExternal).not.toHaveBeenCalled();
    expect(requests.map((request) => request.path)).toEqual([
      "/auth/chatgpt/start",
      "/auth/chatgpt/cancel",
    ]);
  });

  it("cancels a connect that is still binding without creating server-side state", async () => {
    const start = deferred<OAuthLoopbackCallback.Attempt>();
    callback.startResult = start.promise;
    const coordinator = createCoordinator();
    const connecting = coordinator.connect();

    await coordinator.cancel();
    start.resolve(callback.attempt);

    await expect(connecting).resolves.toEqual({ outcome: "cancelled" });
    expect(requests).toEqual([]);
    expect(callback.attempt.cancel).toHaveBeenCalled();
  });

  it("cancels both listener and exact sidecar attempt while the browser is open", async () => {
    const browserOpened = deferred<void>();
    openExternal.mockImplementation(async () => {
      browserOpened.resolve();
    });
    const coordinator = createCoordinator();
    const connecting = coordinator.connect();
    await browserOpened.promise;

    await coordinator.cancel();
    await expect(connecting).resolves.toEqual({ outcome: "cancelled" });
    expect(requests.map((request) => request.path)).toEqual([
      "/auth/chatgpt/start",
      "/auth/chatgpt/cancel",
    ]);
  });

  it("does not classify an unrelated failure from cancellation text", async () => {
    openExternal.mockRejectedValueOnce(
      new Error("ChatGPT sign-in was cancelled")
    );
    const coordinator = createCoordinator();

    await expect(coordinator.connect()).rejects.toThrow(
      "ChatGPT sign-in was cancelled"
    );
    expect(requests.map((request) => request.path)).toEqual([
      "/auth/chatgpt/start",
      "/auth/chatgpt/cancel",
    ]);
  });

  it("reconstructs status and signs out without forwarding unknown fields", async () => {
    const coordinator = createCoordinator();
    expect(await coordinator.status()).toEqual(readyStatus);

    status = signedOutStatus;
    expect(await coordinator.signOut()).toEqual(signedOutStatus);
    expect(requests.map((request) => request.path)).toEqual([
      "/auth/chatgpt/status",
      "/auth/chatgpt/sign-out",
      "/auth/chatgpt/status",
    ]);
  });

  it("still signs out when exact-attempt cancellation transiently fails", async () => {
    const browserOpened = deferred<void>();
    openExternal.mockImplementation(async () => {
      browserOpened.resolve();
    });
    status = signedOutStatus;
    const coordinator = createCoordinator({ cancel_status: 503 });
    const connecting = coordinator.connect();
    await browserOpened.promise;

    await expect(coordinator.signOut()).resolves.toEqual(signedOutStatus);
    await expect(connecting).resolves.toEqual({ outcome: "cancelled" });
    const paths = requests.map((request) => request.path);
    expect(paths).toContain("/auth/chatgpt/cancel");
    expect(paths).toContain("/auth/chatgpt/sign-out");
    expect(paths.indexOf("/auth/chatgpt/sign-out")).toBeGreaterThan(
      paths.indexOf("/auth/chatgpt/cancel")
    );
  });

  function createCoordinator(
    options: { authorization_url?: string; cancel_status?: number } = {}
  ): ChatGptOAuthCoordinator {
    return new ChatGptOAuthCoordinator({
      callback,
      open_external: openExternal,
      sidecar_fetch: async (path, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<
          string,
          unknown
        >;
        requests.push({ path, body });
        switch (path) {
          case "/auth/chatgpt/start":
            return Response.json({
              attempt_id: "attempt_0123456789abcdef",
              state: "state_0123456789abcdef",
              authorization_url:
                options.authorization_url ?? authorizationUrl(),
            });
          case "/auth/chatgpt/complete":
            return Response.json({
              ...readyStatus,
              access_token: "access-token-must-not-cross",
            });
          case "/auth/chatgpt/cancel":
            if (options.cancel_status) {
              return Response.json(
                { code: "temporarily_unavailable" },
                { status: options.cancel_status }
              );
            }
            return Response.json({ ok: true, cancelled: true });
          case "/auth/chatgpt/status":
            return Response.json({
              ...status,
              refresh_token: "refresh-token-must-not-cross",
            });
          case "/auth/chatgpt/sign-out":
            return Response.json({ ok: true });
          default:
            return Response.json({ code: "not_found" }, { status: 404 });
        }
      },
    });
  }
});

describe("ChatGPT IPC registration", () => {
  it("registers every native-provider channel through guarded()", () => {
    const source = fs.readFileSync(
      new URL("./ipc-handlers.ts", import.meta.url),
      "utf8"
    );
    for (const channel of [
      "CHATGPT_CONNECT",
      "CHATGPT_CANCEL",
      "CHATGPT_STATUS",
      "CHATGPT_SIGN_OUT",
    ]) {
      expect(source).toMatch(
        new RegExp(`guarded\\(\\s*IPC_CHANNELS.${channel}`)
      );
      expect(source).not.toMatch(
        new RegExp(`ipcMain.handle\\(\\s*IPC_CHANNELS.${channel}`)
      );
    }
    expect(source).toMatch(
      /guarded\(\s*IPC_CHANNELS\.CHATGPT_CONNECT,\s*\(\)\s*=>\s*chatgptOAuth\.connect\(\)\s*\)/
    );
  });
});

class FakeCallback {
  activation: OAuthLoopbackCallback.Activation | null = null;
  private result = deferred<OAuthLoopbackCallback.Result>();
  readonly attempt: OAuthLoopbackCallback.Attempt = {
    port: 1455,
    redirect_uri: CHATGPT_CALLBACK_URIS[0],
    loopback_hosts: ["127.0.0.1", "::1"],
    activate: (activation) => {
      this.activation = activation;
    },
    cancel: vi.fn<() => void>(() => {
      this.result.reject(new Error("OAuth loopback callback was cancelled"));
    }),
    result: this.result.promise,
  };
  startResult: Promise<OAuthLoopbackCallback.Attempt> = Promise.resolve(
    this.attempt
  );

  start(): Promise<OAuthLoopbackCallback.Attempt> {
    return this.startResult;
  }

  close(): void {
    this.attempt.cancel();
  }

  async complete(): Promise<void> {
    if (!this.activation) throw new Error("callback was not activated");
    await this.activation.complete({
      code: "one-time-code",
      state: "state_0123456789abcdef",
      redirect_uri: CHATGPT_CALLBACK_URIS[0],
      signal: new AbortController().signal,
    });
    this.result.resolve({
      code: "one-time-code",
      state: "state_0123456789abcdef",
      redirect_uri: CHATGPT_CALLBACK_URIS[0],
    });
  }
}

function authorizationUrl(): string {
  const url = new URL(CHATGPT_AUTHORIZE_URL);
  url.searchParams.set(
    "client_id",
    CHATGPT_SUBSCRIPTION_CONFIG.oauth.client_id
  );
  url.searchParams.set("redirect_uri", CHATGPT_CALLBACK_URIS[0]);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    CHATGPT_SUBSCRIPTION_CONFIG.oauth.scopes.join(" ")
  );
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", "c".repeat(43));
  url.searchParams.set("state", "state_0123456789abcdef");
  for (const [key, value] of Object.entries(
    CHATGPT_SUBSCRIPTION_CONFIG.oauth.authorization_parameters ?? {}
  )) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  // Test cancellation can reject before the assertion attaches.
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}
