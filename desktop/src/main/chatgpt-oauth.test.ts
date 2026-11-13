// GRIDA-SEC-008 — Main-owned OAuth orchestration and safe-status contract.
import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHATGPT_AUTHORIZE_URL,
  CHATGPT_CALLBACK_URIS,
  CHATGPT_SUBSCRIPTION_CONFIG,
} from "../chatgpt-configuration";
import {
  ChatGptOAuthCoordinator,
  unavailableChatGptOAuth,
} from "./chatgpt-oauth";
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
  let requests: Array<{ op: string; body: Record<string, unknown> }>;
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
    expect(requests.map((request) => request.op)).toEqual([
      "start",
      "complete",
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

  it("refuses an unexpected authorization authority and cancels the host attempt", async () => {
    const coordinator = createCoordinator({
      authorization_url:
        "https://auth.openai.com.attacker.example/oauth/authorize",
    });
    await expect(coordinator.connect()).rejects.toThrow(
      /unexpected authorization URL/
    );
    expect(openExternal).not.toHaveBeenCalled();
    expect(requests.map((request) => request.op)).toEqual(["start", "cancel"]);
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
    expect(requests.map((request) => request.op)).toEqual(["start", "cancel"]);
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

  it("cancels both listener and exact host attempt while the browser is open", async () => {
    const browserOpened = deferred<void>();
    openExternal.mockImplementation(async () => {
      browserOpened.resolve();
    });
    const coordinator = createCoordinator();
    const connecting = coordinator.connect();
    await browserOpened.promise;

    await coordinator.cancel();
    await expect(connecting).resolves.toEqual({ outcome: "cancelled" });
    expect(requests.map((request) => request.op)).toEqual(["start", "cancel"]);
  });

  it("joins the exact pending OAuth cancellation when the owner closes", async () => {
    const browserOpened = deferred<void>();
    const cancel = deferred<void>();
    openExternal.mockImplementation(async () => browserOpened.resolve());
    const coordinator = createCoordinator({ cancel_gate: cancel.promise });
    const connecting = coordinator.connect();
    await browserOpened.promise;
    const closed = coordinator.close();
    expect(coordinator.close()).toBe(closed);
    const complete = vi.fn<() => void>();
    void closed.then(complete, complete);
    try {
      await expect(coordinator.connect()).rejects.toThrow(
        "ChatGPT sign-in host is closed"
      );
      expect(callback.attempt.cancel).toHaveBeenCalled();
      expect(requests.filter(({ op }) => op === "cancel")).toEqual([
        {
          op: "cancel",
          body: { attempt_id: "attempt_0123456789abcdef" },
        },
      ]);
      expect(complete).not.toHaveBeenCalled();
    } finally {
      cancel.resolve();
      await closed;
    }
    await expect(connecting).resolves.toEqual({ outcome: "cancelled" });
  });

  it("does not classify an unrelated failure from cancellation text", async () => {
    openExternal.mockRejectedValueOnce(
      new Error("ChatGPT sign-in was cancelled")
    );
    const coordinator = createCoordinator();

    await expect(coordinator.connect()).rejects.toThrow(
      "ChatGPT sign-in was cancelled"
    );
    expect(requests.map((request) => request.op)).toEqual(["start", "cancel"]);
  });

  it("reconstructs status and signs out without forwarding unknown fields", async () => {
    const coordinator = createCoordinator();
    expect(await coordinator.status()).toEqual(readyStatus);

    status = signedOutStatus;
    expect(await coordinator.signOut()).toEqual(signedOutStatus);
    expect(requests.map((request) => request.op)).toEqual([
      "status",
      "sign_out",
      "status",
    ]);
  });

  it("forwards only a safe owner error code, never its message", async () => {
    const coordinator = new ChatGptOAuthCoordinator({
      callback,
      open_external: openExternal,
      ceremony: {
        start: async () => null,
        complete: async () => null,
        cancel: async () => true,
        status: async () => {
          throw Object.assign(new Error("refresh-token-must-not-cross"), {
            code: "chatgpt_token_refresh_failed",
          });
        },
        signOut: async () => undefined,
      },
    });
    const failure = await coordinator.status().catch((error: Error) => error);
    expect(failure).toEqual(
      new Error(
        "ChatGPT provider request failed (chatgpt_token_refresh_failed)"
      )
    );
  });

  it("still signs out when exact-attempt cancellation transiently fails", async () => {
    const browserOpened = deferred<void>();
    openExternal.mockImplementation(async () => {
      browserOpened.resolve();
    });
    status = signedOutStatus;
    const coordinator = createCoordinator({ cancel_failure: true });
    const connecting = coordinator.connect();
    await browserOpened.promise;

    await expect(coordinator.signOut()).resolves.toEqual(signedOutStatus);
    await expect(connecting).resolves.toEqual({ outcome: "cancelled" });
    const ops = requests.map((request) => request.op);
    expect(ops).toContain("cancel");
    expect(ops).toContain("sign_out");
    expect(ops.indexOf("sign_out")).toBeGreaterThan(ops.indexOf("cancel"));
  });

  function createCoordinator(
    options: {
      authorization_url?: string;
      cancel_failure?: boolean;
      cancel_gate?: Promise<void>;
    } = {}
  ): ChatGptOAuthCoordinator {
    return new ChatGptOAuthCoordinator({
      callback,
      open_external: openExternal,
      ceremony: {
        start: async (redirect_uri) => {
          requests.push({ op: "start", body: { redirect_uri } });
          return {
            attempt_id: "attempt_0123456789abcdef",
            state: "state_0123456789abcdef",
            authorization_url: options.authorization_url ?? authorizationUrl(),
          };
        },
        complete: async (input) => {
          requests.push({ op: "complete", body: input });
          return {
            ...readyStatus,
            access_token: "access-token-must-not-cross",
          };
        },
        cancel: async (attempt_id) => {
          requests.push({ op: "cancel", body: { attempt_id } });
          await options.cancel_gate;
          if (options.cancel_failure)
            throw Object.assign(new Error("credential owner detail"), {
              code: "temporarily_unavailable",
            });
          return true;
        },
        status: async () => {
          requests.push({ op: "status", body: {} });
          return { ...status, refresh_token: "refresh-token-must-not-cross" };
        },
        signOut: async () => {
          requests.push({ op: "sign_out", body: {} });
        },
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

  it("reports ChatGPT as not configured without a native subscription owner", async () => {
    const source = fs.readFileSync(
      new URL("./ipc-handlers.ts", import.meta.url),
      "utf8"
    );
    expect(source).toMatch(
      /options\.native_chatgpt_oauth\s*\?\?\s*unavailableChatGptOAuth/
    );
    expect(source).not.toContain("createChatGptOAuthCoordinator");
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      const unavailable = {
        configured: false,
        signed_in: false,
        ready: false,
        signing_in: false,
      };
      await expect(unavailableChatGptOAuth.status()).resolves.toEqual(
        unavailable
      );
      await expect(unavailableChatGptOAuth.signOut()).resolves.toEqual(
        unavailable
      );
      await expect(unavailableChatGptOAuth.cancel()).resolves.toBeUndefined();
      await expect(unavailableChatGptOAuth.connect()).rejects.toThrow(
        "ChatGPT sign-in is not available"
      );
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
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
