// GRIDA-SEC-010 — native custody, verified identity, and lifecycle regressions.
import { describe, expect, it, vi } from "vitest";
import { AuthClient } from "./index";

const config: AuthClient.Config = {
  issuer: "https://auth.example.com/auth/v1",
  clientId: "native-client",
  apiOrigin: "https://api.example.com",
  redirectUris: ["http://127.0.0.1:55435/callback"],
};
const identity = {
  id: "user-one",
  email: "one@example.com",
  display_name: "One",
};
const state = "s".repeat(43);
const now = 1_800_000_000_000;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function session(
  overrides: Partial<AuthClient.Session> = {}
): AuthClient.Session {
  return {
    ...config,
    accessToken: "old-access-secret",
    refreshToken: "old-refresh-secret",
    expiresAt: now + 3_600_000,
    identity,
    ...overrides,
  };
}

function harness(initial: AuthClient.Session | null = null) {
  let stored = initial;
  const callback = deferred<AuthClient.Callback>();
  const bound = deferred<void>();
  const writes: AuthClient.Session[] = [];
  const requests: AuthClient.Request[] = [];
  const listener: AuthClient.Listener = {
    redirectUri: config.redirectUris[0]!,
    result: callback.promise,
    cancel: vi.fn<AuthClient.Listener["cancel"]>((code) =>
      callback.reject(new AuthClient.Failure(code))
    ),
    close: vi.fn<AuthClient.Listener["close"]>(async () => undefined),
  };
  const host: AuthClient.Host & { custody: AuthClient.Custody } = {
    now: () => now,
    pkce: async () => ({
      state,
      verifier: "v".repeat(43),
      challenge: "c".repeat(43),
    }),
    custody: {
      async read() {
        return stored;
      },
      async write(next) {
        writes.push(next);
        stored = next;
      },
      async clear() {
        stored = null;
      },
    },
    async listen() {
      bound.resolve();
      return listener;
    },
    openBrowser: vi.fn<AuthClient.Host["openBrowser"]>(async () => undefined),
    request: vi.fn<AuthClient.Host["request"]>((request) => {
      requests.push(request);
      return {
        cancel() {},
        result: Promise.resolve(
          request.url.endsWith("/oauth/token")
            ? {
                status: 200,
                body: {
                  access_token: "new-access-secret",
                  refresh_token: "new-refresh-secret",
                  token_type: "Bearer",
                  expires_in: 3600,
                },
              }
            : request.url.endsWith("/api/v1/auth/me")
              ? { status: 200, body: identity }
              : { status: 204, body: null }
        ),
      };
    }),
  };
  const client = new AuthClient(config, host);
  return {
    client,
    host,
    listener,
    callback,
    bound: bound.promise,
    writes,
    requests,
    stored: () => stored,
  };
}

/** A host implementation of the public contract, shared by independent clients.
 * Persistence is simulated; these tests prove lifecycle use of authority, not OS locking.
 */
function sharedCustody(initial: AuthClient.Session | null) {
  let stored = initial;
  let revision = 0;
  let active = 0;
  let acquisitions = 0;
  let tail: Promise<unknown> = Promise.resolve();
  const writes: (AuthClient.Session | null)[] = [];
  const beforeWrite = vi.fn<(next: AuthClient.Session) => Promise<void>>(
    async () => undefined
  );
  const custody: AuthClient.CoordinatedCustody = {
    exclusive<T>(operation: (tx: AuthClient.CustodyTransaction) => Promise<T>) {
      const result = tail.then(async () => {
        expect(active).toBe(0);
        ++active;
        ++acquisitions;
        const tx: AuthClient.CustodyTransaction = {
          async read() {
            expect(active).toBe(1);
            return {
              revision: `revision-${revision}`,
              session: structuredClone(stored),
            };
          },
          async write(next) {
            expect(active).toBe(1);
            await beforeWrite(next);
            stored = structuredClone(next);
            writes.push(stored);
            ++revision;
          },
          async clear() {
            expect(active).toBe(1);
            stored = null;
            writes.push(null);
            ++revision;
          },
        };
        try {
          return await operation(tx);
        } finally {
          --active;
        }
      });
      tail = result.catch(() => undefined);
      return result;
    },
  };
  function client() {
    const h = harness();
    const host: AuthClient.Host = { ...h.host, custody };
    return { ...h, host, client: new AuthClient(config, host) };
  }
  return {
    client,
    custody,
    writes,
    beforeWrite,
    stored: () => stored,
    revision: () => revision,
    active: () => active,
    acquisitions: () => acquisitions,
  };
}

function tokenResponse(suffix: string): AuthClient.Response {
  return {
    status: 200,
    body: {
      access_token: `access-${suffix}`,
      refresh_token: `refresh-${suffix}`,
      token_type: "Bearer",
      expires_in: 3600,
    },
  };
}

describe("AuthClient", () => {
  it.each([
    { issuer: "http://auth.example.com/auth/v1" },
    { issuer: "https://auth.example.com/auth/v1/" },
    { issuer: "https://evil@auth.example.com/auth/v1" },
    { issuer: "https://auth.example.com/auth/v1?next=evil" },
    { apiOrigin: "https://api.example.com/path" },
    { apiOrigin: "http://127.0.0.1:3000" },
    { clientId: "" },
    { redirectUris: ["http://localhost:55435/callback"] },
    { redirectUris: ["http://127.0.0.1:0/callback"] },
    { redirectUris: ["http://127.0.0.1:65536/callback"] },
    { redirectUris: ["http://127.0.0.1:55435/callback?next=evil"] },
    { redirectUris: ["http://127.0.0.1:55435/../callback"] },
    { redirectUris: ["http://127.0.0.1:55435/%63allback"] },
    { redirectUris: [] },
  ])(
    "rejects untrusted or noncanonical configuration before I/O: %j",
    (change) => {
      const { host } = harness();
      expect(() => new AuthClient({ ...config, ...change }, host)).toThrow(
        expect.objectContaining({ code: "invalid_config" })
      );
      expect(host.request).not.toHaveBeenCalled();
    }
  );

  it("binds before browser launch and commits only after live bearer identity", async () => {
    const h = harness();
    const login = h.client.login();
    await h.bound;
    expect(h.stored()).toBeNull();
    h.callback.resolve({ state, code: "authorization-code-secret" });
    const status = await login;
    const url = new URL(vi.mocked(h.host.openBrowser).mock.calls[0]![0]);
    expect(url.origin + url.pathname).toBe(`${config.issuer}/oauth/authorize`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: config.redirectUris[0],
      scope: "email profile",
      state,
      code_challenge: "c".repeat(43),
      code_challenge_method: "S256",
    });
    expect(h.requests.map((r) => r.url)).toEqual([
      `${config.issuer}/oauth/token`,
      `${config.apiOrigin}/api/v1/auth/me`,
    ]);
    expect(
      Object.fromEntries(new URLSearchParams(h.requests[0]!.body))
    ).toEqual({
      grant_type: "authorization_code",
      client_id: config.clientId,
      code: "authorization-code-secret",
      code_verifier: "v".repeat(43),
      redirect_uri: config.redirectUris[0],
    });
    expect(h.requests[0]!.headers["content-type"]).toBe(
      "application/x-www-form-urlencoded"
    );
    expect(h.requests[1]!.headers.authorization).toBe(
      "Bearer new-access-secret"
    );
    expect(h.stored()?.refreshToken).toBe("new-refresh-secret");
    expect(status).toEqual({
      state: "signed-in",
      identity,
      expiresAt: now + 3_600_000,
    });
    expect(JSON.stringify(status)).not.toMatch(/secret|token|verifier/i);
    expect(h.listener.close).toHaveBeenCalledOnce();
  });

  it.each([
    [{ state: "wrong", code: "code" }, "invalid_callback"],
    [
      { state, code: "code", issuer: "https://other.example.com/auth/v1" },
      "invalid_callback",
    ],
    [{ state, code: "code", error: "access_denied" }, "invalid_callback"],
    [{ state, error: "access_denied" }, "access_denied"],
  ] as const)(
    "rejects an invalid or denied callback without a token request",
    async (callback, code) => {
      const h = harness(session());
      const login = h.client.login();
      const result = login.catch((error: unknown) => error);
      await h.bound;
      h.callback.resolve(callback);
      expect(await result).toMatchObject({ code });
      expect(h.requests).toHaveLength(0);
      expect(h.stored()?.accessToken).toBe("old-access-secret");
      expect(h.listener.close).toHaveBeenCalledOnce();
    }
  );

  it("rejects a simultaneous login and cancels the bound attempt", async () => {
    const h = harness();
    const login = h.client.login();
    const rejected = login.catch((error: unknown) => error);
    await h.bound;
    await expect(h.client.login()).rejects.toMatchObject({
      code: "login_in_progress",
    });
    await h.client.cancelLogin();
    expect(await rejected).toMatchObject({ code: "cancelled" });
    expect(h.requests).toHaveLength(0);
    expect(h.stored()).toBeNull();
  });

  it("sanitizes browser launch failure and closes the listener", async () => {
    const h = harness();
    h.host.openBrowser = async () => {
      throw new Error("browser-secret");
    };
    await expect(h.client.login()).rejects.toMatchObject({
      code: "browser_failed",
      message: "Grida authentication failed (browser_failed)",
    });
    expect(h.listener.close).toHaveBeenCalledOnce();
  });

  it("preserves the prior session when live identity rejects the new login", async () => {
    const h = harness(session());
    const original = h.host.request;
    h.host.request = (request) =>
      request.method === "GET"
        ? {
            cancel() {},
            result: Promise.resolve({
              status: 401,
              body: { secret: "never-copy" },
            }),
          }
        : original(request);
    const login = h.client.login();
    await h.bound;
    h.callback.resolve({ state, code: "code" });
    await expect(login).rejects.toMatchObject({ code: "token_rejected" });
    expect(h.stored()?.accessToken).toBe("old-access-secret");
  });

  it("single-flights refresh and saves the rotated refresh token before returning", async () => {
    const h = harness(session());
    const a = h.client.refresh();
    const b = h.client.refresh();
    expect(a).toBe(b);
    await Promise.all([a, b]);
    expect(
      h.requests.filter((r) => r.url.endsWith("/oauth/token"))
    ).toHaveLength(1);
    expect(
      Object.fromEntries(new URLSearchParams(h.requests[0]!.body))
    ).toEqual({
      grant_type: "refresh_token",
      client_id: config.clientId,
      refresh_token: "old-refresh-secret",
    });
    expect(h.stored()?.refreshToken).toBe("new-refresh-secret");
  });

  it("does not resurrect a session when logout wins a late refresh response", async () => {
    const h = harness(session());
    const token = deferred<AuthClient.Response>();
    const entered = deferred<void>();
    h.host.request = (request) => {
      if (request.url.endsWith("/oauth/token")) {
        entered.resolve();
        return { result: token.promise, cancel() {} };
      }
      return {
        result: Promise.resolve({ status: 204, body: null }),
        cancel() {},
      };
    };
    const refreshing = h.client.refresh();
    const rejected = refreshing.catch((error: unknown) => error);
    await entered.promise;
    expect(await h.client.logout()).toEqual({
      state: "signed-out",
      revocation: "confirmed",
    });
    token.resolve({
      status: 200,
      body: {
        access_token: "late-access",
        refresh_token: "late-refresh",
        expires_in: 3600,
        token_type: "Bearer",
      },
    });
    expect(await rejected).toMatchObject({
      code: "cancelled",
    });
    expect(h.stored()).toBeNull();
  });

  it("clears only its custody and requests session-local logout even when remote revocation fails", async () => {
    const h = harness(session());
    h.host.request = (request) => {
      expect(h.stored()).toBeNull();
      expect(request).toEqual({
        url: `${config.issuer}/logout?scope=local`,
        method: "POST",
        headers: { authorization: "Bearer old-access-secret" },
      });
      return {
        cancel() {},
        result: Promise.reject(new Error("secret-upstream-body")),
      };
    };
    expect(await h.client.logout()).toEqual({
      state: "signed-out",
      revocation: "unconfirmed",
    });
    expect(await h.client.logout()).toEqual({
      state: "signed-out",
      revocation: "not-needed",
    });
  });

  it("rejects custody from a different issuer, client, or API before network I/O", async () => {
    for (const change of [
      { issuer: "other" },
      { clientId: "other" },
      { apiOrigin: "other" },
    ]) {
      const h = harness(session(change));
      await expect(h.client.verify()).rejects.toMatchObject({
        code: "session_binding_mismatch",
      });
      expect(h.requests).toHaveLength(0);
    }
  });

  it("reports local expiry without network and requires live identity for verify", async () => {
    const h = harness(session({ expiresAt: now - 1 }));
    expect((await h.client.status()).state).toBe("refresh-needed");
    expect(h.requests).toHaveLength(0);
    expect((await h.client.verify()).state).toBe("signed-in");
    expect(
      h.requests.filter((r) => r.url.endsWith("/api/v1/auth/me"))
    ).toHaveLength(2);
  });

  it("projects only public identity fields from host custody", async () => {
    const storedIdentity = {
      ...identity,
      accessToken: "stored-identity-secret",
    };
    const h = harness(session({ identity: storedIdentity }));
    const status = await h.client.status();
    expect(status).toEqual({
      state: "signed-in",
      identity,
      expiresAt: now + 3_600_000,
    });
    expect(JSON.stringify(status)).not.toContain("stored-identity-secret");
  });

  it("rolls back a cancelled login whose custody write was already in flight", async () => {
    const h = harness(session());
    const writing = deferred<void>();
    const release = deferred<void>();
    const original = h.host.custody.write;
    h.host.custody.write = async (next) => {
      if (next.accessToken === "new-access-secret") {
        writing.resolve();
        await release.promise;
      }
      await original(next);
    };
    const login = h.client.login();
    const rejected = login.catch((error: unknown) => error);
    await h.bound;
    h.callback.resolve({ state, code: "code" });
    await writing.promise;
    await h.client.cancelLogin();
    release.resolve();
    expect(await rejected).toMatchObject({ code: "cancelled" });
    expect(h.stored()?.accessToken).toBe("old-access-secret");
  });

  it("does not let an earlier live verification overwrite rotated credentials", async () => {
    const h = harness(session());
    const verifying = deferred<AuthClient.Response>();
    const entered = deferred<void>();
    const original = h.host.request;
    h.host.request = (request) => {
      if (request.headers.authorization === "Bearer old-access-secret") {
        entered.resolve();
        return { result: verifying.promise, cancel() {} };
      }
      return original(request);
    };
    const verify = h.client.verify();
    const rejected = verify.catch((error: unknown) => error);
    await entered.promise;
    await h.client.refresh();
    verifying.resolve({ status: 200, body: identity });
    expect(await rejected).toMatchObject({
      code: "session_changed",
    });
    expect(h.stored()?.refreshToken).toBe("new-refresh-secret");
  });

  it("leaves a new login intact when revocation of the previous session finishes later", async () => {
    const h = harness(session());
    const revocation = deferred<AuthClient.Response>();
    const entered = deferred<void>();
    const revoked: string[] = [];
    const original = h.host.request;
    h.host.request = (request) => {
      if (request.url.endsWith("/logout?scope=local")) {
        revoked.push(request.headers.authorization!);
        entered.resolve();
        return { result: revocation.promise, cancel() {} };
      }
      return original(request);
    };
    const logout = h.client.logout();
    await entered.promise;
    expect(revoked).toEqual(["Bearer old-access-secret"]);
    const login = h.client.login();
    await h.bound;
    h.callback.resolve({ state, code: "new-code" });
    await login;
    revocation.resolve({ status: 204, body: null });
    await logout;
    expect(h.stored()?.accessToken).toBe("new-access-secret");
  });

  it.each([
    { access_token: "contains whitespace" },
    { refresh_token: "" },
    { token_type: "MAC" },
    { expires_in: -1 },
    { expires_in: "3600" },
  ])(
    "rejects malformed token responses without changing custody: %j",
    async (change) => {
      const h = harness(session());
      h.host.request = () => ({
        cancel() {},
        result: Promise.resolve({
          status: 200,
          body: {
            access_token: "secret",
            refresh_token: "secret",
            token_type: "Bearer",
            expires_in: 3600,
            ...change,
          },
        }),
      });
      await expect(h.client.refresh()).rejects.toMatchObject({
        code: "invalid_response",
      });
      expect(h.stored()?.accessToken).toBe("old-access-secret");
    }
  );

  it("refuses a new login while refresh may rotate the current session", async () => {
    const h = harness(session());
    const rotating = deferred<AuthClient.Response>();
    const entered = deferred<void>();
    const original = h.host.request;
    h.host.request = (request) => {
      if (request.url.endsWith("/oauth/token")) {
        entered.resolve();
        return { result: rotating.promise, cancel() {} };
      }
      return original(request);
    };
    const refresh = h.client.refresh();
    await entered.promise;
    await expect(h.client.login()).rejects.toMatchObject({
      code: "session_busy",
    });
    rotating.resolve({
      status: 200,
      body: {
        access_token: "rotated-access",
        refresh_token: "rotated-refresh",
        expires_in: 3600,
        token_type: "Bearer",
      },
    });
    await refresh;
    const login = h.client.login();
    await h.bound;
    h.callback.resolve({ state, error: "access_denied" });
    await expect(login).rejects.toMatchObject({ code: "access_denied" });
    expect(h.stored()?.refreshToken).toBe("rotated-refresh");
  });

  it("refuses refresh during a login that may later be cancelled", async () => {
    const h = harness(session());
    const login = h.client.login();
    const rejected = login.catch((error: unknown) => error);
    await h.bound;
    await expect(h.client.refresh()).rejects.toMatchObject({
      code: "session_busy",
    });
    await h.client.cancelLogin();
    expect(await rejected).toMatchObject({ code: "cancelled" });
    expect(h.stored()?.refreshToken).toBe("old-refresh-secret");
    expect(h.requests).toHaveLength(0);
  });

  it("sanitizes a failing host cleanup and releases the login slot", async () => {
    const h = harness();
    h.listener.close = async () => {
      throw new Error("host-secret");
    };
    const login = h.client.login();
    await h.bound;
    h.callback.resolve({ state, error: "access_denied" });
    await expect(login).rejects.toMatchObject({
      code: "callback_unavailable",
      message: "Grida authentication failed (callback_unavailable)",
    });
    await expect(h.client.login()).rejects.toMatchObject({
      code: "callback_unavailable",
    });
  });

  it("preserves rotation across an identity outage without claiming a newly verified session", async () => {
    const previous = session({ expiresAt: now - 1 });
    const h = harness(previous);
    const original = h.host.request;
    let identityUnavailable = true;
    h.host.request = (request) => {
      if (request.method === "GET" && identityUnavailable) {
        return {
          result: Promise.resolve({ status: 503, body: null }),
          cancel() {},
        };
      }
      return original(request);
    };
    await expect(h.client.refresh()).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(h.stored()).toEqual({
      ...previous,
      refreshToken: "new-refresh-secret",
    });
    expect(await h.client.status()).toEqual({
      state: "refresh-needed",
      identity: previous.identity,
      expiresAt: previous.expiresAt,
    });
    identityUnavailable = false;
    expect((await h.client.refresh()).state).toBe("signed-in");
    const grants = h.requests.filter((request) =>
      request.url.endsWith("/oauth/token")
    );
    expect(new URLSearchParams(grants[1]!.body).get("refresh_token")).toBe(
      "new-refresh-secret"
    );
    expect(h.stored()?.accessToken).toBe("new-access-secret");
  });

  it("fails before identity I/O when accepted rotation cannot be saved", async () => {
    const h = harness(session());
    h.host.custody.write = async () => {
      throw new Error("private storage details");
    };
    await expect(h.client.refresh()).rejects.toMatchObject({
      code: "custody_failed",
      message: "Grida authentication failed (custody_failed)",
    });
    expect(h.requests.map((request) => request.url)).toEqual([
      `${config.issuer}/oauth/token`,
    ]);
    expect(h.stored()?.accessToken).toBe("old-access-secret");
  });

  it("lets logout win after rotation is saved while live identity is still pending", async () => {
    const h = harness(session());
    const verifying = deferred<AuthClient.Response>();
    const entered = deferred<void>();
    const original = h.host.request;
    h.host.request = (request) => {
      if (request.method === "GET") {
        entered.resolve();
        return { result: verifying.promise, cancel() {} };
      }
      return original(request);
    };
    const refresh = h.client.refresh().catch((error: unknown) => error);
    await entered.promise;
    expect(h.stored()?.refreshToken).toBe("new-refresh-secret");
    expect(h.stored()?.accessToken).toBe("old-access-secret");
    expect((await h.client.logout()).revocation).toBe("confirmed");
    verifying.resolve({ status: 200, body: identity });
    expect(await refresh).toMatchObject({ code: "cancelled" });
    expect(h.stored()).toBeNull();
  });

  it("serializes rotating grants from independent clients and rereads the replacement token", async () => {
    const store = sharedCustody(session());
    const first = store.client();
    const second = store.client();
    const entered = deferred<void>();
    const release = deferred<AuthClient.Response>();
    const grants: (string | null)[] = [];
    first.host.request = (request) => {
      if (request.method === "POST") {
        grants.push(new URLSearchParams(request.body).get("refresh_token"));
        entered.resolve();
        return { result: release.promise, cancel() {} };
      }
      return {
        result: Promise.resolve({ status: 200, body: identity }),
        cancel() {},
      };
    };
    const original = second.host.request;
    second.host.request = vi.fn<AuthClient.Host["request"]>((request) => {
      if (request.method === "POST") {
        grants.push(new URLSearchParams(request.body).get("refresh_token"));
        return {
          result: Promise.resolve(tokenResponse("second")),
          cancel() {},
        };
      }
      return original(request);
    });
    const a = first.client.refresh();
    await entered.promise;
    const b = second.client.refresh();
    expect(second.host.request).not.toHaveBeenCalled();
    release.resolve(tokenResponse("first"));
    await Promise.all([a, b]);
    expect(grants).toEqual(["old-refresh-secret", "refresh-first"]);
    expect(store.stored()?.refreshToken).toBe("refresh-second");
    expect(store.acquisitions()).toBe(2);
    expect(store.active()).toBe(0);
  });

  it("keeps verification under authority and rereads a preceding refresh before writing identity", async () => {
    const store = sharedCustody(session());
    const first = store.client();
    const second = store.client();
    const entered = deferred<void>();
    const release = deferred<AuthClient.Response>();
    const original = first.host.request;
    first.host.request = (request) => {
      if (request.method === "GET") {
        entered.resolve();
        return { result: release.promise, cancel() {} };
      }
      return original(request);
    };
    const refresh = first.client.refresh();
    await entered.promise;
    const verify = second.client.verify();
    expect(second.requests).toHaveLength(0);
    release.resolve({ status: 200, body: identity });
    await Promise.all([refresh, verify]);
    expect(second.requests[0]?.headers.authorization).toBe(
      "Bearer new-access-secret"
    );
    expect(store.stored()?.refreshToken).toBe("new-refresh-secret");
    expect(store.revision()).toBe(3);
    expect(store.active()).toBe(0);
  });

  it("refreshes expired verification without reentering exclusive authority", async () => {
    const store = sharedCustody(session({ expiresAt: now - 1 }));
    const h = store.client();
    expect((await h.client.verify()).state).toBe("signed-in");
    expect(store.acquisitions()).toBe(1);
    expect(
      h.requests.filter((request) => request.url.endsWith("/oauth/token"))
    ).toHaveLength(1);
    expect(store.active()).toBe(0);
  });

  it("invalidates an earlier consent attempt when another client logs out while already signed out", async () => {
    const store = sharedCustody(null);
    const first = store.client();
    const second = store.client();
    const login = first.client.login().catch((error: unknown) => error);
    await first.bound;
    expect(store.active()).toBe(0);
    expect(await second.client.logout()).toEqual({
      state: "signed-out",
      revocation: "not-needed",
    });
    first.callback.resolve({ state, code: "earlier-code" });
    expect(await login).toMatchObject({ code: "session_changed" });
    expect(store.stored()).toBeNull();
    expect(store.revision()).toBe(1);
  });

  it("lets only one of two logins commit against the same durable revision", async () => {
    const store = sharedCustody(null);
    const first = store.client();
    const second = store.client();
    const a = first.client.login().catch((error: unknown) => error);
    const b = second.client.login();
    await Promise.all([first.bound, second.bound]);
    expect(store.active()).toBe(0);
    second.callback.resolve({ state, code: "winning-code" });
    await b;
    first.callback.resolve({ state, code: "late-code" });
    expect(await a).toMatchObject({ code: "session_changed" });
    expect(store.writes).toHaveLength(1);
    expect(store.stored()?.accessToken).toBe("new-access-secret");
  });

  it("releases authority after identity failure without rolling back an accepted rotation", async () => {
    const store = sharedCustody(session({ expiresAt: now - 1 }));
    const first = store.client();
    const second = store.client();
    const original = first.host.request;
    first.host.request = (request) =>
      request.method === "GET"
        ? { result: Promise.resolve({ status: 503, body: null }), cancel() {} }
        : original(request);
    await expect(first.client.refresh()).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(store.stored()?.refreshToken).toBe("new-refresh-secret");
    expect(store.stored()?.accessToken).toBe("old-access-secret");
    expect(store.active()).toBe(0);
    await second.client.refresh();
    expect(
      new URLSearchParams(second.requests[0]?.body).get("refresh_token")
    ).toBe("new-refresh-secret");
  });

  it("sanitizes a failed mutation and releases authority before subsequent operations", async () => {
    const store = sharedCustody(session());
    const h = store.client();
    store.beforeWrite.mockRejectedValueOnce(
      new Error("private-storage-secret")
    );
    await expect(h.client.refresh()).rejects.toMatchObject({
      code: "custody_failed",
      message: "Grida authentication failed (custody_failed)",
    });
    expect(h.requests).toHaveLength(1);
    expect(store.active()).toBe(0);
    await h.client.logout();
    expect(store.stored()).toBeNull();
  });

  it("never restores spent refresh credentials when logout interrupts an accepted rotation save", async () => {
    const store = sharedCustody(session());
    const h = store.client();
    const entered = deferred<void>();
    const release = deferred<void>();
    store.beforeWrite.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
    });
    const refresh = h.client.refresh().catch((error: unknown) => error);
    await entered.promise;
    const logout = h.client.logout();
    release.resolve();
    expect(await refresh).toMatchObject({ code: "cancelled" });
    await logout;
    expect(store.writes.map((value) => value?.refreshToken ?? null)).toEqual([
      "new-refresh-secret",
      null,
    ]);
    expect(store.stored()).toBeNull();
    expect(store.active()).toBe(0);
  });

  it("compensates a cancelled login under the same authority while advancing the durable revision", async () => {
    const previous = session();
    const store = sharedCustody(previous);
    const h = store.client();
    const entered = deferred<void>();
    const release = deferred<void>();
    store.beforeWrite.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
    });
    const login = h.client.login().catch((error: unknown) => error);
    await h.bound;
    h.callback.resolve({ state, code: "code" });
    await entered.promise;
    await h.client.cancelLogin();
    release.resolve();
    expect(await login).toMatchObject({ code: "cancelled" });
    expect(store.stored()).toEqual(previous);
    expect(store.revision()).toBe(2);
    expect(store.active()).toBe(0);
  });

  it("rejects failed authority acquisition without exposing host errors or starting a ceremony", async () => {
    const h = harness();
    const custody: AuthClient.CoordinatedCustody = {
      async exclusive() {
        throw new Error("private-lock-path");
      },
    };
    const client = new AuthClient(config, { ...h.host, custody });
    await expect(client.login()).rejects.toMatchObject({
      code: "custody_failed",
      message: "Grida authentication failed (custody_failed)",
    });
    await expect(client.status()).rejects.toMatchObject({
      code: "custody_failed",
    });
    expect(h.host.openBrowser).not.toHaveBeenCalled();
    expect(h.requests).toHaveLength(0);
  });

  it("reads safe local status under authority without mutating the revision or contacting the issuer", async () => {
    const store = sharedCustody(session({ expiresAt: now - 1 }));
    const h = store.client();
    const status = await h.client.status();
    expect(status).toEqual({
      state: "refresh-needed",
      identity,
      expiresAt: now - 1,
    });
    expect(JSON.stringify(status)).not.toMatch(/secret|revision|token/);
    expect(h.requests).toHaveLength(0);
    expect(store.revision()).toBe(0);
    expect(store.acquisitions()).toBe(1);
    expect(store.active()).toBe(0);
  });

  it("orders a pending local logout before a later login even when host admission is not FIFO", async () => {
    const store = sharedCustody(session());
    const h = harness();
    const entered = deferred<void>();
    const release = deferred<void>();
    let acquisitions = 0;
    const custody: AuthClient.CoordinatedCustody = {
      async exclusive(operation) {
        // First acquisition is waiting, not holding authority. A different
        // invocation could overtake it if the client submitted one now.
        if (++acquisitions === 1) {
          entered.resolve();
          await release.promise;
        }
        return store.custody.exclusive(operation);
      },
    };
    const client = new AuthClient(config, { ...h.host, custody });
    const logout = client.logout();
    await entered.promise;
    const login = client.login();
    expect(acquisitions).toBe(1);
    release.resolve();
    await logout;
    await h.bound;
    h.callback.resolve({ state, code: "later-code" });
    await login;
    expect(store.writes.map((value) => value?.accessToken ?? null)).toEqual([
      null,
      "new-access-secret",
    ]);
    expect(h.requests[0]?.headers.authorization).toBe(
      "Bearer old-access-secret"
    );
  });

  it("does not compensate an accepted memory-custody rotation when logout arrives during its write", async () => {
    const h = harness(session());
    const entered = deferred<void>();
    const release = deferred<void>();
    const write = h.host.custody.write;
    h.host.custody.write = async (next) => {
      entered.resolve();
      await release.promise;
      await write(next);
    };
    const refresh = h.client.refresh().catch((error: unknown) => error);
    await entered.promise;
    const logout = h.client.logout();
    release.resolve();
    expect(await refresh).toMatchObject({ code: "cancelled" });
    await logout;
    expect(h.writes.map((value) => value.refreshToken)).toEqual([
      "new-refresh-secret",
    ]);
    expect(h.stored()).toBeNull();
  });
});
