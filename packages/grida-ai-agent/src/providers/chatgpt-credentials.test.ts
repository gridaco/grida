// GRIDA-SEC-008 — OAuth replay, cancellation, refresh, and account-race pins.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthStore, type OAuthEntry } from "@grida/daemon/server";
import { CHATGPT_PROVIDER_ID } from "../protocol/chatgpt";
import {
  ChatGptCredentialError,
  ChatGptCredentialManager,
  type ChatGptOAuthConfig,
} from "./chatgpt-credentials";
import { ProviderHttp } from "./http";

const NOW = 1_800_000_000_000;
const REDIRECT_URI = "http://localhost:1455/auth/callback";
const CONFIG: ChatGptOAuthConfig = {
  authorize_url: "https://auth.example.test/oauth/authorize",
  token_url: "https://auth.example.test/oauth/token",
  client_id: "grida-test-client",
  redirect_uris: [REDIRECT_URI],
  scopes: ["openid", "profile", "email", "offline_access"],
  authorization_parameters: {
    audience: "chatgpt",
    originator: "grida-test",
  },
};

let baseDir: string;
let auth: AuthStore;

beforeEach(async () => {
  baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-chatgpt-auth-"));
  auth = new AuthStore(baseDir);
});

afterEach(async () => {
  await fs.rm(baseDir, { recursive: true, force: true });
});

describe("ChatGptCredentialManager", () => {
  it("binds state + PKCE, persists the exchange, and returns token-free status", async () => {
    let tokenForm: URLSearchParams | undefined;
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      tokenForm = new URLSearchParams(String(init?.body));
      return tokenResponse({
        access_token: "access-secret",
        refresh_token: "refresh-secret",
        expires_in: 3600,
        id_token: jwt({
          exp: NOW / 1000 + 3600,
          email: "person@example.test",
          "https://api.openai.com/auth": {
            chatgpt_account_id: "account-123",
            chatgpt_plan_type: "plus",
          },
        }),
      });
    });
    const manager = makeManager(request);
    const start = await manager.start(REDIRECT_URI);
    const authorize = new URL(start.authorization_url);

    expect(start.attempt_id).not.toBe(start.state);
    expect(authorize.origin + authorize.pathname).toBe(CONFIG.authorize_url);
    expect(authorize.searchParams.get("state")).toBe(start.state);
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorize.searchParams.get("code_verifier")).toBeNull();
    expect(authorize.searchParams.get("client_id")).toBe(CONFIG.client_id);
    expect(authorize.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);

    // Same-length mismatches fail without consuming the valid attempt. This
    // exercises the length-safe timingSafeEqual comparison path.
    await expect(
      manager.complete({
        attempt_id: start.attempt_id,
        code: "authorization-code",
        state: start.state.replace(/^./, start.state[0] === "a" ? "b" : "a"),
      })
    ).rejects.toMatchObject({
      code: "chatgpt_oauth_attempt_invalid",
    });

    const status = await manager.complete({
      attempt_id: start.attempt_id,
      code: "authorization-code",
      state: start.state,
    });
    const verifier = tokenForm?.get("code_verifier");
    expect(verifier).toBeTruthy();
    expect(
      crypto.createHash("sha256").update(verifier!).digest("base64url")
    ).toBe(authorize.searchParams.get("code_challenge"));
    expect(tokenForm?.get("code")).toBe("authorization-code");
    expect(tokenForm?.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(status).toEqual({
      configured: true,
      signed_in: true,
      ready: true,
      signing_in: false,
      expires_at: NOW + 3_600_000,
      account: {
        id: "account-123",
        email: "person@example.test",
        plan: "plus",
      },
    });
    expect(JSON.stringify(status)).not.toMatch(
      /access-secret|refresh-secret|authorization-code|code_verifier/
    );
    expect(await auth.get(CHATGPT_PROVIDER_ID)).toMatchObject({
      type: "oauth",
      access: "access-secret",
      refresh: "refresh-secret",
      account_id: "account-123",
      email: "person@example.test",
      plan: "plus",
    });
  });

  it.each([
    ["non-integer", 3600.5],
    ["finite overflow", Number.MAX_VALUE],
    ["epoch-millisecond overflow", Math.floor(Number.MAX_SAFE_INTEGER / 1000)],
  ])(
    "rejects a token response with %s expires_in before persistence",
    async (_label, expiresIn) => {
      const manager = makeManager(async () =>
        tokenResponse({
          access_token: "must-not-persist",
          refresh_token: "must-not-persist",
          expires_in: expiresIn,
          account_id: "account-123",
        })
      );
      const start = await manager.start(REDIRECT_URI);

      await expect(
        manager.complete({
          attempt_id: start.attempt_id,
          state: start.state,
          code: "code",
        })
      ).rejects.toMatchObject({ code: "chatgpt_oauth_exchange_failed" });
      expect(await auth.get(CHATGPT_PROVIDER_ID)).toBeUndefined();
    }
  );

  it.each([
    ["malformed", "not-a-jwt"],
    [
      "expired",
      jwt({
        exp: NOW / 1000 - 1,
        "https://api.openai.com/auth": {
          chatgpt_account_id: "must-not-be-trusted",
        },
      }),
    ],
  ])(
    "never treats %s JWT claims as provider-ready",
    async (_label, idToken) => {
      const manager = makeManager(async () =>
        tokenResponse({
          access_token: "access",
          refresh_token: "refresh",
          expires_in: 3600,
          id_token: idToken,
        })
      );
      const start = await manager.start(REDIRECT_URI);
      const status = await manager.complete({
        attempt_id: start.attempt_id,
        state: start.state,
        code: "code",
      });
      expect(status).toMatchObject({
        configured: true,
        signed_in: true,
        ready: false,
      });
      expect(status.account).toBeUndefined();
      await expect(manager.getAccessCredentials()).rejects.toMatchObject({
        code: "chatgpt_account_missing",
      });
    }
  );

  it("drops account metadata beyond the main-process UTF-8 status bound", async () => {
    const oversizedMultibyteAccount = "界".repeat(400);
    expect(oversizedMultibyteAccount.length).toBeLessThan(1024);
    expect(Buffer.byteLength(oversizedMultibyteAccount)).toBeGreaterThan(1024);
    const manager = makeManager(async () =>
      tokenResponse({
        access_token: "access",
        refresh_token: "refresh",
        expires_in: 3600,
        account_id: oversizedMultibyteAccount,
      })
    );
    const start = await manager.start(REDIRECT_URI);

    await expect(
      manager.complete({
        attempt_id: start.attempt_id,
        state: start.state,
        code: "code",
      })
    ).resolves.toMatchObject({
      signed_in: true,
      ready: false,
    });
    expect(await auth.get(CHATGPT_PROVIDER_ID)).not.toHaveProperty(
      "account_id"
    );
  });

  it("singleflights proactive refresh and persists a rotating token before returning", async () => {
    await auth.set(CHATGPT_PROVIDER_ID, {
      type: "oauth",
      access: "old-access",
      refresh: "old-refresh",
      expires: NOW / 1000 + 60,
      account_id: "account-123",
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const request = vi.fn<typeof fetch>(async () => {
      await gate;
      return tokenResponse({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
        id_token: jwt({
          exp: NOW / 1000 + 3600,
          "https://api.openai.com/auth": {
            chatgpt_account_id: "account-123",
          },
        }),
      });
    });
    const manager = makeManager(request);
    const first = manager.getAccessCredentials();
    const second = manager.getAccessCredentials();
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    release();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { access_token: "new-access", account_id: "account-123" },
      { access_token: "new-access", account_id: "account-123" },
    ]);
    expect(request).toHaveBeenCalledOnce();
    expect(await auth.get(CHATGPT_PROVIDER_ID)).toMatchObject({
      access: "new-access",
      refresh: "new-refresh",
    });
  });

  it("bounds refresh-token I/O and clears the timeout after abort", async () => {
    await auth.set(CHATGPT_PROVIDER_ID, {
      type: "oauth",
      access: "old-access",
      refresh: "old-refresh",
      expires: NOW / 1000,
      account_id: "account-123",
    });
    let entered!: () => void;
    const requestEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const refreshSignal: { current: AbortSignal | null } = { current: null };
    const manager = makeManager(async (_input, init) => {
      refreshSignal.current = init?.signal ?? null;
      entered();
      return new Promise<Response>((_resolve, reject) => {
        refreshSignal.current?.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true }
        );
      });
    });

    vi.useFakeTimers();
    try {
      const refreshResult = manager
        .getAccessCredentials()
        .catch((error: unknown) => error);
      await requestEntered;
      expect(refreshSignal.current).toBeInstanceOf(AbortSignal);
      expect(vi.getTimerCount()).toBe(1);

      await vi.advanceTimersByTimeAsync(30_000);

      expect(await refreshResult).toMatchObject({
        code: "chatgpt_token_refresh_failed",
      });
      expect(refreshSignal.current?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the refresh timeout when the token request settles early", async () => {
    await auth.set(CHATGPT_PROVIDER_ID, {
      type: "oauth",
      access: "old-access",
      refresh: "old-refresh",
      expires: NOW / 1000,
      account_id: "account-123",
    });
    const manager = makeManager(async () =>
      tokenResponse({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
        account_id: "account-123",
      })
    );

    vi.useFakeTimers();
    try {
      await expect(manager.getAccessCredentials()).resolves.toEqual({
        access_token: "new-access",
        account_id: "account-123",
      });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-reads persisted credentials and does not overwrite a newer access token on reactive refresh", async () => {
    const original: OAuthEntry = {
      type: "oauth",
      access: "rejected-access",
      refresh: "old-refresh",
      expires: NOW / 1000 + 3600,
      account_id: "account-123",
    };
    await auth.set(CHATGPT_PROVIDER_ID, original);
    const request = vi.fn<typeof fetch>();
    const manager = makeManager(request);
    await auth.set(CHATGPT_PROVIDER_ID, {
      ...original,
      access: "already-rotated",
      refresh: "already-rotated-refresh",
    });

    await expect(
      manager.refreshAfterUnauthorized("rejected-access")
    ).resolves.toEqual({
      access_token: "already-rotated",
      account_id: "account-123",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("does not resurrect a credential when sign-out wins an in-flight refresh", async () => {
    await auth.set(CHATGPT_PROVIDER_ID, {
      type: "oauth",
      access: "old-access",
      refresh: "old-refresh",
      expires: NOW / 1000,
      account_id: "account-123",
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let enteredRefresh!: () => void;
    const refreshEntered = new Promise<void>((resolve) => {
      enteredRefresh = resolve;
    });
    const manager = makeManager(async () => {
      enteredRefresh();
      await gate;
      return tokenResponse({
        access_token: "late-access",
        refresh_token: "late-refresh",
        expires_in: 3600,
        account_id: "account-123",
      });
    });
    const refresh = manager.getAccessCredentials();
    await refreshEntered;
    const signOut = manager.signOut();
    release();

    await expect(refresh).rejects.toMatchObject({
      code: "chatgpt_not_signed_in",
    });
    await signOut;
    expect(await auth.get(CHATGPT_PROVIDER_ID)).toBeUndefined();
  });

  it("cancels the exact in-flight code exchange without persisting its late response", async () => {
    let entered!: () => void;
    const exchangeEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const manager = makeManager(async () => {
      entered();
      await gate;
      return tokenResponse({
        access_token: "late-access",
        refresh_token: "late-refresh",
        expires_in: 3600,
        account_id: "account-123",
      });
    });
    const start = await manager.start(REDIRECT_URI);
    const completion = manager.complete({
      attempt_id: start.attempt_id,
      state: start.state,
      code: "code",
    });
    await exchangeEntered;
    await expect(manager.status()).resolves.toMatchObject({
      signed_in: false,
      ready: false,
      signing_in: true,
    });

    await expect(manager.cancel(start.attempt_id)).resolves.toBe(true);
    await expect(manager.status()).resolves.toEqual({
      configured: true,
      signed_in: false,
      ready: false,
      signing_in: false,
    });
    release();
    await expect(completion).rejects.toMatchObject({
      code: "chatgpt_oauth_attempt_invalid",
    });
    expect(await auth.get(CHATGPT_PROVIDER_ID)).toBeUndefined();
    expect(await manager.status()).toEqual({
      configured: true,
      signed_in: false,
      ready: false,
      signing_in: false,
    });
  });

  it("aborts an in-flight exchange and clears signing-in status immediately on sign-out", async () => {
    let entered!: () => void;
    const exchangeEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const manager = makeManager(async (_input, init) => {
      entered();
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        expect(signal).toBeInstanceOf(AbortSignal);
        signal!.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true }
        );
      });
    });
    const start = await manager.start(REDIRECT_URI);
    const completion = manager.complete({
      attempt_id: start.attempt_id,
      state: start.state,
      code: "code",
    });
    const completionRejection = completion.catch((error: unknown) => error);
    await exchangeEntered;

    const signOut = manager.signOut();
    await expect(manager.status()).resolves.toEqual({
      configured: true,
      signed_in: false,
      ready: false,
      signing_in: false,
    });
    await signOut;
    expect(await completionRejection).toMatchObject({
      code: "chatgpt_oauth_attempt_invalid",
    });
    expect(await auth.get(CHATGPT_PROVIDER_ID)).toBeUndefined();
  });

  it("rejects an overlapping exchange and permits immediate retry after exact cancellation", async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let calls = 0;
    const manager = makeManager(async () => {
      calls += 1;
      if (calls === 1) await firstGate;
      return tokenResponse({
        access_token: `access-${calls}`,
        refresh_token: `refresh-${calls}`,
        expires_in: 3600,
        account_id: "account-123",
      });
    });
    const oldStart = await manager.start(REDIRECT_URI);
    const oldCompletion = manager.complete({
      attempt_id: oldStart.attempt_id,
      state: oldStart.state,
      code: "old-code",
    });
    await vi.waitFor(() => expect(calls).toBe(1));
    await expect(manager.start(REDIRECT_URI)).rejects.toMatchObject({
      code: "chatgpt_oauth_attempt_invalid",
    });
    await manager.cancel(oldStart.attempt_id);
    const futureStart = await manager.start(REDIRECT_URI);
    const oldRejection = oldCompletion.catch((error: unknown) => error);
    releaseFirst();
    expect(await oldRejection).toMatchObject({
      code: "chatgpt_oauth_attempt_invalid",
    });

    await expect(
      manager.complete({
        attempt_id: futureStart.attempt_id,
        state: futureStart.state,
        code: "future-code",
      })
    ).resolves.toMatchObject({ signed_in: true, ready: true });
    expect(await auth.get(CHATGPT_PROVIDER_ID)).toMatchObject({
      access: "access-2",
      refresh: "refresh-2",
    });
  });

  it("does not let a late account refresh overwrite a newer OAuth completion", async () => {
    await auth.set(CHATGPT_PROVIDER_ID, {
      type: "oauth",
      access: "account-a-access",
      refresh: "account-a-refresh",
      expires: NOW / 1000,
      account_id: "account-a",
    });
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    let refreshEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      refreshEntered = resolve;
    });
    const manager = makeManager(async (_input, init) => {
      const form = new URLSearchParams(String(init?.body));
      if (form.get("grant_type") === "refresh_token") {
        refreshEntered();
        await refreshGate;
        return tokenResponse({
          access_token: "late-account-a-access",
          refresh_token: "late-account-a-refresh",
          expires_in: 3600,
          account_id: "account-a",
        });
      }
      return tokenResponse({
        access_token: "account-b-access",
        refresh_token: "account-b-refresh",
        expires_in: 3600,
        account_id: "account-b",
      });
    });

    const refresh = manager.getAccessCredentials();
    await entered;
    const start = await manager.start(REDIRECT_URI);
    await expect(
      manager.complete({
        attempt_id: start.attempt_id,
        state: start.state,
        code: "account-b-code",
      })
    ).resolves.toMatchObject({
      ready: true,
      account: { id: "account-b" },
    });
    releaseRefresh();

    await expect(refresh).resolves.toEqual({
      access_token: "account-b-access",
      account_id: "account-b",
    });
    expect(await auth.get(CHATGPT_PROVIDER_ID)).toMatchObject({
      access: "account-b-access",
      refresh: "account-b-refresh",
      account_id: "account-b",
    });
  });

  it("classifies fatal refresh without echoing an upstream token body", async () => {
    await auth.set(CHATGPT_PROVIDER_ID, {
      type: "oauth",
      access: "old-access",
      refresh: "secret-refresh",
      expires: NOW / 1000,
      account_id: "account-123",
    });
    const manager = makeManager(
      async () =>
        new Response('{"error":"invalid_grant","refresh":"secret-refresh"}', {
          status: 400,
        })
    );

    let error: unknown;
    try {
      await manager.getAccessCredentials();
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ChatGptCredentialError);
    expect(error).toMatchObject({
      code: "chatgpt_reauthentication_required",
    });
    expect(String(error)).not.toMatch(/invalid_grant|secret-refresh/);
    expect(await auth.get(CHATGPT_PROVIDER_ID)).toBeUndefined();
  });

  it("does not remove a newer account when an old account's fatal refresh arrives late", async () => {
    const accountA: OAuthEntry = {
      type: "oauth",
      access: "account-a-access",
      refresh: "account-a-refresh",
      expires: NOW / 1000,
      account_id: "account-a",
    };
    const accountB: OAuthEntry = {
      type: "oauth",
      access: "account-b-access",
      refresh: "account-b-refresh",
      expires: NOW / 1000 + 3600,
      account_id: "account-b",
    };
    await auth.set(CHATGPT_PROVIDER_ID, accountA);
    let entered!: () => void;
    const refreshEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const manager = makeManager(async () => {
      entered();
      await gate;
      return new Response('{"error":"invalid_grant"}', { status: 400 });
    });
    const refresh = manager.getAccessCredentials();
    await refreshEntered;
    await auth.set(CHATGPT_PROVIDER_ID, accountB);
    release();

    await expect(refresh).rejects.toMatchObject({
      code: "chatgpt_reauthentication_required",
    });
    expect(await auth.get(CHATGPT_PROVIDER_ID)).toEqual(accountB);
  });

  it("invalidates only the exact access credential rejected by inference", async () => {
    const rejected: OAuthEntry = {
      type: "oauth",
      access: "rejected-access",
      refresh: "rejected-refresh",
      expires: NOW / 1000 + 3600,
      account_id: "account-a",
    };
    const newer: OAuthEntry = {
      type: "oauth",
      access: "newer-access",
      refresh: "newer-refresh",
      expires: NOW / 1000 + 7200,
      account_id: "account-b",
    };
    await auth.set(CHATGPT_PROVIDER_ID, rejected);
    const manager = makeManager(vi.fn<typeof fetch>());

    await expect(
      manager.invalidateAfterUnauthorized("rejected-access")
    ).resolves.toBe(true);
    expect(await auth.get(CHATGPT_PROVIDER_ID)).toBeUndefined();

    await auth.set(CHATGPT_PROVIDER_ID, newer);
    await expect(
      manager.invalidateAfterUnauthorized("rejected-access")
    ).resolves.toBe(false);
    expect(await auth.get(CHATGPT_PROVIDER_ID)).toEqual(newer);
  });

  it("rejects an oversized declared token response before reading it", async () => {
    let cancelled = false;
    const manager = makeManager(async () => {
      const body = new ReadableStream<Uint8Array>({
        cancel() {
          cancelled = true;
        },
      });
      return new Response(body, {
        headers: { "content-length": String(1024 * 1024 + 1) },
      });
    });
    const start = await manager.start(REDIRECT_URI);

    await expect(
      manager.complete({
        attempt_id: start.attempt_id,
        state: start.state,
        code: "code",
      })
    ).rejects.toMatchObject({ code: "chatgpt_oauth_exchange_failed" });
    expect(cancelled).toBe(true);
  });

  it("stops reading a streamed token response at the byte limit", async () => {
    let cancelled = false;
    const chunks = [new Uint8Array(700 * 1024), new Uint8Array(400 * 1024)];
    let index = 0;
    const manager = makeManager(async () => {
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          const chunk = chunks[index++];
          if (chunk) controller.enqueue(chunk);
        },
        cancel() {
          cancelled = true;
        },
      });
      return new Response(body);
    });
    const start = await manager.start(REDIRECT_URI);

    await expect(
      manager.complete({
        attempt_id: start.attempt_id,
        state: start.state,
        code: "code",
      })
    ).rejects.toMatchObject({ code: "chatgpt_oauth_exchange_failed" });
    expect(cancelled).toBe(true);
  });
});

function makeManager(request: typeof fetch): ChatGptCredentialManager {
  return new ChatGptCredentialManager(
    auth,
    new ProviderHttp({ request, download: request }),
    CONFIG,
    { now: () => NOW }
  );
}

function tokenResponse(value: Record<string, unknown>): Response {
  return Response.json(value);
}

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.${Buffer.from(
    "signature"
  ).toString("base64url")}`;
}
