// GRIDA-SEC-010 — native custody, verified identity, and lifecycle regressions.
// GRIDA-SEC-006 / GRIDA-GG: token — fixed mint and scoped handoff regressions.
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

function harness(
  initial: AuthClient.Session | null = null,
  gg?: AuthClient.GgSink
) {
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
    gg,
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
  function client(gg?: AuthClient.GgSink) {
    const h = harness(null, gg);
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

const organizations: AuthClient.OrganizationsPage = {
  organizations: [{ id: 7, name: "example", display_name: "Example" }],
  next_cursor: null,
};
function accountReply(
  h: { host: AuthClient.Host; requests: AuthClient.Request[] },
  response: AuthClient.Response = { status: 200, body: organizations }
) {
  const original = h.host.request;
  h.host.request = vi.fn<AuthClient.Host["request"]>((request) => {
    if (request.url.startsWith(`${config.apiOrigin}/api/v1/account/`)) {
      h.requests.push(request);
      return { result: Promise.resolve(response), cancel() {} };
    }
    return original(request);
  });
}

const cachedCredits: AuthClient.Credits = {
  organization: { id: 7, name: "example", display_name: "" },
  account_present: true,
  state: "cached",
  source: "cache",
  currency: "USD",
  balance_cents: 75,
  cache_updated_at: "2026-09-07T01:02:03.123456+00:00",
  billing_gate: { allowed: true, reason: null },
};

const ggGrant: AuthClient.GgGrant = {
  token: "synthetic.scoped.signature",
  expires_at: new Date(now + 15 * 60_000).toISOString(),
  organization: { id: 7, name: "example" },
};
const ggAccess: AuthClient.GgAccess = {
  expires_at: ggGrant.expires_at,
  organization: ggGrant.organization,
};

function ggReply(
  h: { host: AuthClient.Host; requests: AuthClient.Request[] },
  response: AuthClient.Response = { status: 200, body: ggGrant }
) {
  const original = h.host.request;
  h.host.request = (request) => {
    if (request.url === `${config.apiOrigin}/api/v1/auth/gg`) {
      h.requests.push(request);
      return { result: Promise.resolve(response), cancel() {} };
    }
    return original(request);
  };
}

describe("AuthClient.requestGgAccess", () => {
  it("keeps returned metadata independent of sink mutation attempts", async () => {
    const changes: boolean[] = [];
    let retained: AuthClient.GgGrant | undefined;
    const h = harness(session(), {
      accept(grant) {
        retained = grant;
        changes.push(Reflect.set(grant, "expires_at", grant.token));
        changes.push(Reflect.set(grant.organization, "name", grant.token));
        changes.push(Reflect.set(grant.organization, "token", grant.token));
      },
    });
    ggReply(h);
    const result = await h.client.requestGgAccess({ organization_id: 7 });
    expect(changes).toEqual([false, false, false]);
    expect(result).toEqual(ggAccess);
    expect(result).not.toBe(retained);
    expect(result.organization).not.toBe(retained?.organization);
    expect(JSON.stringify(result)).not.toContain(ggGrant.token);
  });

  it("hands off one projected scoped grant while returning only safe metadata", async () => {
    const accept = vi.fn<AuthClient.GgSink["accept"]>(() => undefined);
    const h = harness(session(), { accept });
    ggReply(h, {
      status: 200,
      body: {
        ...ggGrant,
        access_token: "must-not-leak",
        organization: { ...ggGrant.organization, private: "must-not-leak" },
      },
    });
    expect(await h.client.requestGgAccess({ organization_id: 7 })).toEqual(
      ggAccess
    );
    expect(h.requests).toEqual([
      {
        url: `${config.apiOrigin}/api/v1/auth/gg`,
        method: "POST",
        headers: {
          authorization: "Bearer old-access-secret",
          "content-type": "application/json",
        },
        body: '{"organization_id":7}',
      },
    ]);
    expect(accept).toHaveBeenCalledExactlyOnceWith(ggGrant);
    const grant = accept.mock.calls[0]![0];
    expect(Object.isFrozen(grant)).toBe(true);
    expect(Object.isFrozen(grant.organization)).toBe(true);
    expect(h.writes).toEqual([]);
    expect(h.stored()).toEqual(session());
    expect(JSON.stringify(await h.client.status())).not.toContain(
      ggGrant.token
    );
  });

  it("requires a sink before custody or refresh and captures the bound callable once", async () => {
    const missing = harness(session({ expiresAt: now - 1 }));
    const read = vi.spyOn(missing.host.custody, "read");
    await expect(
      missing.client.requestGgAccess({ organization_id: 7 })
    ).rejects.toMatchObject({ code: "gg_unavailable" });
    expect(read).not.toHaveBeenCalled();
    expect(missing.requests).toEqual([]);

    const receiver = {
      grants: [] as AuthClient.GgGrant[],
      accept(grant: AuthClient.GgGrant): undefined {
        this.grants.push(grant);
      },
    };
    const h = harness(session(), receiver);
    receiver.accept = () => {
      throw new Error("replacement-must-not-run");
    };
    h.host.gg = {
      accept: () => {
        throw new Error("replacement-must-not-run");
      },
    };
    ggReply(h);
    expect(await h.client.requestGgAccess({ organization_id: 7 })).toEqual(
      ggAccess
    );
    expect(receiver.grants).toEqual([ggGrant]);
  });

  it("sanitizes invalid or throwing sink configuration at construction", () => {
    const h = harness();
    for (const gg of [
      null,
      {},
      { accept: 1 },
      {
        get accept() {
          throw new Error("private-configuration");
        },
      },
    ]) {
      expect(
        () => new AuthClient(config, { ...h.host, gg: gg as never })
      ).toThrow("Grida authentication failed (invalid_config)");
    }
    expect(
      () =>
        new AuthClient(config, {
          ...h.host,
          get gg(): AuthClient.GgSink {
            throw new Error("private-configuration");
          },
        })
    ).toThrow("Grida authentication failed (invalid_config)");
  });

  it.each([
    undefined,
    null,
    {},
    [],
    { organization_id: 0 },
    { organization_id: -1 },
    { organization_id: 1.5 },
    { organization_id: Number.MAX_SAFE_INTEGER + 1 },
    { organization_id: "7" },
    { organization_id: 7, url: "https://elsewhere.invalid" },
    Object.create({ organization_id: 7 }),
    { organization_id: 7, [Symbol("extra")]: true },
  ])("rejects invalid mint input before custody or I/O: %j", async (input) => {
    const accept = vi.fn<AuthClient.GgSink["accept"]>(() => undefined);
    const h = harness(session(), { accept });
    const read = vi.spyOn(h.host.custody, "read");
    await expect(
      h.client.requestGgAccess(input as never)
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(read).not.toHaveBeenCalled();
    expect(h.requests).toEqual([]);
    expect(accept).not.toHaveBeenCalled();
  });

  it("snapshots the organization once and contains throwing input accessors", async () => {
    const h = harness(session(), { accept: () => undefined });
    ggReply(h);
    let reads = 0;
    await h.client.requestGgAccess({
      get organization_id() {
        return ++reads === 1 ? 7 : 8;
      },
    });
    expect(reads).toBe(1);
    const input = { organization_id: 7 };
    const pending = h.client.requestGgAccess(input);
    input.organization_id = 8;
    expect(await pending).toEqual(ggAccess);
    await expect(
      h.client.requestGgAccess({
        get organization_id(): number {
          throw new Error("private-input");
        },
      })
    ).rejects.toMatchObject({
      code: "invalid_input",
      message: "Grida authentication failed (invalid_input)",
    });
    expect(h.requests.map((request) => request.body)).toEqual([
      '{"organization_id":7}',
      '{"organization_id":7}',
    ]);
  });

  it.each([
    null,
    { ...ggGrant, token: "" },
    { ...ggGrant, token: "not-a-scoped-jwt" },
    { ...ggGrant, token: "a.b.c\n" },
    { ...ggGrant, token: `${"a".repeat(16384)}.b.c` },
    { ...ggGrant, organization: { id: 8, name: "example" } },
    { ...ggGrant, organization: { id: 7, name: "Invalid Name" } },
    { ...ggGrant, expires_at: new Date(now).toISOString() },
    { ...ggGrant, expires_at: new Date(now + 16 * 60_000 + 1).toISOString() },
    { ...ggGrant, expires_at: "2027-02-30T00:00:00Z" },
    { ...ggGrant, expires_at: now + 60_000 },
  ])(
    "rejects malformed or mismatched mint envelopes without handoff: %j",
    async (body) => {
      const accept = vi.fn<AuthClient.GgSink["accept"]>(() => undefined);
      const h = harness(session(), { accept });
      ggReply(h, { status: 200, body });
      await expect(
        h.client.requestGgAccess({ organization_id: 7 })
      ).rejects.toMatchObject({ code: "invalid_response" });
      expect(accept).not.toHaveBeenCalled();
      expect(h.requests).toHaveLength(1);
    }
  );

  it.each(["accessToken", "refreshToken"] as const)(
    "refuses an echoed account %s even when it has JWT shape",
    async (key) => {
      const accept = vi.fn<AuthClient.GgSink["accept"]>(() => undefined);
      const h = harness(session({ [key]: ggGrant.token }), { accept });
      ggReply(h);
      await expect(
        h.client.requestGgAccess({ organization_id: 7 })
      ).rejects.toMatchObject({ code: "invalid_response" });
      expect(accept).not.toHaveBeenCalled();
    }
  );

  it("checks expiry again immediately before memory handoff", async () => {
    const accept = vi.fn<AuthClient.GgSink["accept"]>(() => undefined);
    const h = harness(session(), { accept });
    ggReply(h);
    let reads = 0;
    h.host.custody.read = async () => {
      if (++reads === 2) h.host.now = () => now + 15 * 60_000;
      return session();
    };
    await expect(
      h.client.requestGgAccess({ organization_id: 7 })
    ).rejects.toMatchObject({ code: "invalid_response" });
    expect(accept).not.toHaveBeenCalled();
  });

  it.each([
    [400, "unavailable"],
    [401, "token_rejected"],
    [403, "forbidden"],
    [429, "rate_limited"],
    [503, "unavailable"],
    [302, "unavailable"],
  ])(
    "sanitizes HTTP %i as %s without remint or replay",
    async (status, code) => {
      const accept = vi.fn<AuthClient.GgSink["accept"]>(() => undefined);
      const h = harness(session(), { accept });
      ggReply(h, {
        status: status as number,
        body: { token: ggGrant.token, error: "private-upstream" },
      });
      await expect(
        h.client.requestGgAccess({ organization_id: 7 })
      ).rejects.toMatchObject({
        code,
        message: `Grida authentication failed (${code})`,
      });
      expect(accept).not.toHaveBeenCalled();
      expect(h.requests).toHaveLength(1);
      expect(h.writes).toEqual([]);
    }
  );

  it.each([false, true])(
    "retains accepted rotation after mint failure (coordinated=%s)",
    async (coordinated) => {
      const initial = session({ expiresAt: now - 1 });
      const store = sharedCustody(initial);
      const accept = vi.fn<AuthClient.GgSink["accept"]>(() => undefined);
      const h = coordinated
        ? store.client({ accept })
        : harness(initial, { accept });
      ggReply(h, { status: 503, body: "private-upstream" });
      await expect(
        h.client.requestGgAccess({ organization_id: 7 })
      ).rejects.toMatchObject({ code: "unavailable" });
      expect((coordinated ? store.stored() : h.stored())?.refreshToken).toBe(
        "new-refresh-secret"
      );
      expect(h.requests.at(-1)?.headers.authorization).toBe(
        "Bearer new-access-secret"
      );
      expect(accept).not.toHaveBeenCalled();
      expect(
        h.requests.filter((request) => request.url.endsWith("/auth/gg"))
      ).toHaveLength(1);
    }
  );

  it.each([false, true])(
    "blocks mint if live identity fails after accepted rotation (coordinated=%s)",
    async (coordinated) => {
      const previous = session({ expiresAt: now - 1 });
      const store = sharedCustody(previous);
      const accept = vi.fn<AuthClient.GgSink["accept"]>(() => undefined);
      const h = coordinated
        ? store.client({ accept })
        : harness(previous, { accept });
      const original = h.host.request;
      h.host.request = (request) =>
        request.url.endsWith("/auth/me")
          ? {
              result: Promise.resolve({ status: 503, body: null }),
              cancel() {},
            }
          : original(request);
      await expect(
        h.client.requestGgAccess({ organization_id: 7 })
      ).rejects.toMatchObject({ code: "unavailable" });
      expect(coordinated ? store.stored() : h.stored()).toEqual({
        ...previous,
        refreshToken: "new-refresh-secret",
      });
      expect(accept).not.toHaveBeenCalled();
      expect(
        h.requests.some((request) => request.url.endsWith("/auth/gg"))
      ).toBe(false);
    }
  );

  it.each([false, true])(
    "prevents handoff after logout even when transport ignores cancellation (coordinated=%s)",
    async (coordinated) => {
      const store = sharedCustody(session());
      const accept = vi.fn<AuthClient.GgSink["accept"]>(() => undefined);
      const h = coordinated
        ? store.client({ accept })
        : harness(session(), { accept });
      const entered = deferred<void>();
      const response = deferred<AuthClient.Response>();
      const original = h.host.request;
      const cancel = vi.fn<() => void>();
      h.host.request = (request) => {
        if (request.url.endsWith("/auth/gg")) {
          entered.resolve();
          return { result: response.promise, cancel };
        }
        return original(request);
      };
      const pending = h.client
        .requestGgAccess({ organization_id: 7 })
        .catch((error: unknown) => error);
      await entered.promise;
      const logout = h.client.logout();
      expect(cancel).toHaveBeenCalledOnce();
      response.resolve({ status: 200, body: ggGrant });
      expect(await pending).toMatchObject({ code: "cancelled" });
      await logout;
      expect(accept).not.toHaveBeenCalled();
      expect(coordinated ? store.stored() : h.stored()).toBeNull();
    }
  );

  it("orders a different writer's logout after the synchronous handoff", async () => {
    const store = sharedCustody(session());
    const accept = vi.fn<AuthClient.GgSink["accept"]>(() => {
      expect(store.active()).toBe(1);
      expect(store.stored()).not.toBeNull();
    });
    const first = store.client({ accept });
    const second = store.client();
    const entered = deferred<void>();
    const response = deferred<AuthClient.Response>();
    first.host.request = () => {
      entered.resolve();
      return { result: response.promise, cancel() {} };
    };
    const pending = first.client.requestGgAccess({ organization_id: 7 });
    await entered.promise;
    const logout = second.client.logout();
    response.resolve({ status: 200, body: ggGrant });
    expect(await pending).toEqual(ggAccess);
    await logout;
    expect(accept).toHaveBeenCalledExactlyOnceWith(ggGrant);
    expect(store.stored()).toBeNull();
    await expect(
      first.client.requestGgAccess({ organization_id: 7 })
    ).rejects.toMatchObject({ code: "signed_out" });
    expect(accept).toHaveBeenCalledOnce();
  });

  it("refuses a memory handoff if a concurrent refresh replaced its account credentials", async () => {
    const accept = vi.fn<AuthClient.GgSink["accept"]>(() => undefined);
    const h = harness(session(), { accept });
    const entered = deferred<void>();
    const response = deferred<AuthClient.Response>();
    const original = h.host.request;
    h.host.request = (request) => {
      if (request.url.endsWith("/auth/gg")) {
        entered.resolve();
        return { result: response.promise, cancel() {} };
      }
      return original(request);
    };
    const pending = h.client
      .requestGgAccess({ organization_id: 7 })
      .catch((error: unknown) => error);
    await entered.promise;
    await h.client.refresh();
    response.resolve({ status: 200, body: ggGrant });
    expect(await pending).toMatchObject({ code: "session_changed" });
    expect(accept).not.toHaveBeenCalled();
    expect(h.stored()?.refreshToken).toBe("new-refresh-secret");
  });

  it.each([false, true])(
    "does not rollback a retained grant or retry after the sink throws (coordinated=%s)",
    async (coordinated) => {
      let retained: AuthClient.GgGrant | undefined;
      const accept = vi.fn<AuthClient.GgSink["accept"]>((grant) => {
        retained = grant;
        throw new Error(`private-sink-${grant.token}`);
      });
      const initial = session({ expiresAt: now - 1 });
      const store = sharedCustody(initial);
      const h = coordinated
        ? store.client({ accept })
        : harness(initial, { accept });
      ggReply(h);
      await expect(
        h.client.requestGgAccess({ organization_id: 7 })
      ).rejects.toMatchObject({
        code: "gg_handoff_failed",
        message: "Grida authentication failed (gg_handoff_failed)",
      });
      expect(retained).toEqual(ggGrant);
      expect(accept).toHaveBeenCalledOnce();
      expect((coordinated ? store.stored() : h.stored())?.refreshToken).toBe(
        "new-refresh-secret"
      );
      expect(
        h.requests.filter((request) => request.url.endsWith("/auth/gg"))
      ).toHaveLength(1);
    }
  );

  it.each([false, true])(
    "does not retract a delivered grant when logout starts before the caller resumes (coordinated=%s)",
    async (coordinated) => {
      const delivered = deferred<void>();
      const accept = vi.fn<AuthClient.GgSink["accept"]>(() => {
        delivered.resolve();
      });
      const store = sharedCustody(session());
      const h = coordinated
        ? store.client({ accept })
        : harness(session(), { accept });
      ggReply(h);
      const pending = h.client.requestGgAccess({ organization_id: 7 });
      await delivered.promise;
      const logout = h.client.logout();
      expect(await pending).toEqual(ggAccess);
      await logout;
      expect(accept).toHaveBeenCalledExactlyOnceWith(ggGrant);
      expect(coordinated ? store.stored() : h.stored()).toBeNull();
    }
  );

  it("excludes login during mint and releases that exclusion after a transport error", async () => {
    const h = harness(session(), { accept: () => undefined });
    const entered = deferred<void>();
    const response = deferred<AuthClient.Response>();
    h.host.request = () => {
      entered.resolve();
      return { result: response.promise, cancel() {} };
    };
    const mint = h.client
      .requestGgAccess({ organization_id: 7 })
      .catch((error: unknown) => error);
    await entered.promise;
    await expect(h.client.login()).rejects.toMatchObject({
      code: "session_busy",
    });
    response.reject(new Error("private-transport"));
    expect(await mint).toMatchObject({
      code: "unavailable",
      message: "Grida authentication failed (unavailable)",
    });
    const login = h.client.login().catch((error: unknown) => error);
    await h.bound;
    await expect(
      h.client.requestGgAccess({ organization_id: 7 })
    ).rejects.toMatchObject({ code: "session_busy" });
    await h.client.cancelLogin();
    expect(await login).toMatchObject({ code: "cancelled" });
  });

  it("rejects an async sink without awaiting it or exposing its rejection", async () => {
    const asyncResult = deferred<void>();
    const accept = vi.fn<() => Promise<void>>(() => asyncResult.promise);
    const h = harness(session(), { accept: accept as never });
    ggReply(h);
    await expect(
      h.client.requestGgAccess({ organization_id: 7 })
    ).rejects.toMatchObject({ code: "gg_handoff_failed" });
    asyncResult.reject(new Error("private-async-sink"));
    await Promise.resolve();
    expect(accept).toHaveBeenCalledOnce();
    expect(await h.client.logout()).toMatchObject({ state: "signed-out" });
  });
});

describe("AuthClient.requestAccount credits.read", () => {
  it("sends only the selected organization to the fixed path and projects every reply level", async () => {
    const h = harness(session());
    accountReply(h, {
      status: 200,
      body: {
        ...cachedCredits,
        organization: { ...cachedCredits.organization, token: "secret" },
        billing_gate: { ...cachedCredits.billing_gate, provider_id: "secret" },
        access_token: "secret",
      },
    });
    expect(
      await h.client.requestAccount("credits.read", { organization_id: 7 })
    ).toEqual(cachedCredits);
    expect(h.requests).toEqual([
      {
        url: `${config.apiOrigin}/api/v1/account/credits?organization_id=7`,
        method: "GET",
        headers: { authorization: "Bearer old-access-secret" },
      },
    ]);
    expect(h.writes).toHaveLength(0);
  });

  it.each([
    {
      ...cachedCredits,
      state: "not_provisioned",
      account_present: false,
      balance_cents: null,
      cache_updated_at: null,
      billing_gate: { allowed: false, reason: "not_provisioned" },
    },
    {
      ...cachedCredits,
      state: "not_provisioned",
      balance_cents: null,
      cache_updated_at: null,
      billing_gate: { allowed: false, reason: "not_provisioned" },
    },
    {
      ...cachedCredits,
      state: "uncached",
      balance_cents: null,
      cache_updated_at: null,
    },
    {
      ...cachedCredits,
      state: "uncached",
      balance_cents: null,
      cache_updated_at: null,
      billing_gate: { allowed: false, reason: "below_floor" },
    },
    {
      ...cachedCredits,
      balance_cents: 0,
      billing_gate: { allowed: false, reason: "below_floor" },
    },
    {
      ...cachedCredits,
      balance_cents: -1,
      billing_gate: { allowed: false, reason: "no_balance" },
    },
    { ...cachedCredits, balance_cents: Number.MIN_SAFE_INTEGER },
    { ...cachedCredits, cache_updated_at: "2026-09-07T01:02:03.12345678901Z" },
    {
      ...cachedCredits,
      balance_cents: Number.MAX_SAFE_INTEGER,
      cache_updated_at: "2000-02-29T00:00:00Z",
    },
  ])(
    "preserves valid cache states without interpreting amounts, freshness or the server gate: %j",
    async (body) => {
      const h = harness(session());
      accountReply(h, { status: 200, body });
      expect(
        await h.client.requestAccount("credits.read", { organization_id: 7 })
      ).toEqual(body);
    }
  );

  it.each([
    undefined,
    null,
    [],
    {},
    { organization_id: undefined },
    { organization_id: 0 },
    { organization_id: -1 },
    { organization_id: 1.5 },
    { organization_id: "7" },
    { organization_id: NaN },
    { organization_id: Infinity },
    { organization_id: Number.MAX_SAFE_INTEGER + 1 },
    { organization_id: 7, user_id: "other" },
    { organization_id: 7, [Symbol("headers")]: "secret" },
    Object.create({ organization_id: 7 }),
  ])(
    "rejects noncanonical input before custody or transport: %j",
    async (input) => {
      const h = harness(session());
      const read = vi.spyOn(h.host.custody, "read");
      await expect(
        h.client.requestAccount("credits.read", input as never)
      ).rejects.toMatchObject({ code: "invalid_input" });
      expect(read).not.toHaveBeenCalled();
      expect(h.host.request).not.toHaveBeenCalled();
    }
  );

  it("snapshots the organization once before awaiting and sanitizes throwing accessors", async () => {
    const h = harness(session());
    accountReply(h, { status: 200, body: cachedCredits });
    let reads = 0;
    await h.client.requestAccount("credits.read", {
      get organization_id() {
        return ++reads === 1 ? 7 : ("7&user_id=other" as never);
      },
    });
    expect(reads).toBe(1);
    const input = { organization_id: 7 };
    const pending = h.client.requestAccount("credits.read", input);
    input.organization_id = 9;
    await pending;
    const custodyRead = vi.spyOn(h.host.custody, "read");
    await expect(
      h.client.requestAccount("credits.read", {
        get organization_id(): number {
          throw new Error("private-accessor-secret");
        },
      })
    ).rejects.toMatchObject({
      code: "invalid_input",
      message: "Grida authentication failed (invalid_input)",
    });
    expect(custodyRead).not.toHaveBeenCalled();
    expect(h.requests.map((request) => request.url)).toEqual(
      Array(2).fill(
        `${config.apiOrigin}/api/v1/account/credits?organization_id=7`
      )
    );
  });

  it.each([
    { organization: null },
    { organization: { ...cachedCredits.organization, id: 8 } },
    { organization: { ...cachedCredits.organization, display_name: null } },
    { organization: { ...cachedCredits.organization, name: "" } },
    { organization: { ...cachedCredits.organization, id: "7" } },
    { source: "live" },
    { currency: "EUR" },
    { account_present: false },
    { account_present: 1 },
    { state: "missing" },
    { state: "uncached" },
    { state: "not_provisioned" },
    { balance_cents: null },
    { balance_cents: 0.5 },
    { balance_cents: "75" },
    { balance_cents: Number.MAX_SAFE_INTEGER + 1 },
    { balance_cents: NaN },
    { cache_updated_at: null },
    { cache_updated_at: "2026-09-07" },
    { cache_updated_at: "2026-09-07T01:02:03" },
    { cache_updated_at: "2026-02-30T01:02:03Z" },
    { cache_updated_at: "1900-02-29T01:02:03Z" },
    { cache_updated_at: "2026-09-07T24:00:00Z" },
    { cache_updated_at: `2026-09-07T00:00:00.${"1".repeat(65)}Z` },
    { billing_gate: null },
    { billing_gate: { allowed: true, reason: "below_floor" } },
    { billing_gate: { allowed: false, reason: null } },
    { billing_gate: { allowed: false, reason: "not_provisioned" } },
    { billing_gate: { allowed: "true", reason: null } },
    {
      state: "uncached",
      balance_cents: null,
      cache_updated_at: null,
      account_present: false,
    },
    { state: "not_provisioned", balance_cents: null, cache_updated_at: null },
  ])(
    "refuses inconsistent or malformed credits without returning upstream fields: %j",
    async (change) => {
      const h = harness(session());
      accountReply(h, {
        status: 200,
        body: { ...cachedCredits, ...change, access_token: "secret" },
      });
      await expect(
        h.client.requestAccount("credits.read", { organization_id: 7 })
      ).rejects.toMatchObject({
        code: "invalid_response",
        message: "Grida authentication failed (invalid_response)",
      });
      expect(h.requests).toHaveLength(1);
      expect(h.writes).toHaveLength(0);
    }
  );

  it.each([
    [401, "token_rejected"],
    [403, "forbidden"],
    [503, "unavailable"],
    [302, "unavailable"],
  ])(
    "maps HTTP %i without exposing the response, refreshing or replaying",
    async (status, code) => {
      const h = harness(session());
      accountReply(h, { status: status as number, body: "private-diagnostic" });
      await expect(
        h.client.requestAccount("credits.read", { organization_id: 7 })
      ).rejects.toMatchObject({
        code,
        message: `Grida authentication failed (${code})`,
      });
      expect(h.requests).toHaveLength(1);
      expect(h.writes).toHaveLength(0);
    }
  );

  it.each([false, true])(
    "retains accepted rotation after a failed credits read (coordinated=%s)",
    async (coordinated) => {
      const initial = session({ expiresAt: now - 1 });
      const store = sharedCustody(initial);
      const h = coordinated ? store.client() : harness(initial);
      accountReply(h, { status: 503, body: "private-diagnostic" });
      await expect(
        h.client.requestAccount("credits.read", { organization_id: 7 })
      ).rejects.toMatchObject({ code: "unavailable" });
      expect((coordinated ? store.stored() : h.stored())?.refreshToken).toBe(
        "new-refresh-secret"
      );
      expect(
        h.requests.filter((request) => request.url.includes("/account/credits"))
      ).toEqual([
        {
          url: `${config.apiOrigin}/api/v1/account/credits?organization_id=7`,
          method: "GET",
          headers: { authorization: "Bearer new-access-secret" },
        },
      ]);
    }
  );

  it.each([false, true])(
    "fences credits after logout even when transport ignores cancellation (coordinated=%s)",
    async (coordinated) => {
      const store = sharedCustody(session());
      const h = coordinated ? store.client() : harness(session());
      const entered = deferred<void>();
      const reply = deferred<AuthClient.Response>();
      const original = h.host.request;
      const cancel = vi.fn<() => void>();
      h.host.request = (request) => {
        if (request.url.includes("/account/credits")) {
          entered.resolve();
          return { result: reply.promise, cancel };
        }
        return original(request);
      };
      const read = h.client
        .requestAccount("credits.read", { organization_id: 7 })
        .catch((error: unknown) => error);
      await entered.promise;
      const logout = h.client.logout();
      expect(cancel).toHaveBeenCalledOnce();
      reply.resolve({ status: 200, body: cachedCredits });
      expect(await read).toMatchObject({ code: "cancelled" });
      await logout;
      expect(coordinated ? store.stored() : h.stored()).toBeNull();
    }
  );

  it("holds shared authority through credits acceptance before another writer clears custody", async () => {
    const store = sharedCustody(session());
    const first = store.client();
    const second = store.client();
    const entered = deferred<void>();
    const reply = deferred<AuthClient.Response>();
    first.host.request = () => {
      entered.resolve();
      return { result: reply.promise, cancel() {} };
    };
    const read = first.client.requestAccount("credits.read", {
      organization_id: 7,
    });
    await entered.promise;
    const logout = second.client.logout();
    expect(store.stored()).not.toBeNull();
    reply.resolve({ status: 200, body: cachedCredits });
    expect(await read).toEqual(cachedCredits);
    await logout;
    await expect(
      first.client.requestAccount("credits.read", { organization_id: 7 })
    ).rejects.toMatchObject({ code: "signed_out" });
  });
});

describe("AuthClient.requestAccount", () => {
  it("sends only the fixed GET and projects one ordered page without credentials or upstream extras", async () => {
    const h = harness(session());
    accountReply(h, {
      status: 200,
      body: {
        organizations: [
          { id: 7, name: "example", display_name: "", access_token: "secret" },
          {
            id: 12,
            name: "another",
            display_name: "Another",
            owner: "private",
          },
        ],
        next_cursor: 12,
        refresh_token: "secret",
      },
    });
    expect(
      await h.client.requestAccount("organizations.list", { after: 3 })
    ).toEqual({
      organizations: [
        { id: 7, name: "example", display_name: "" },
        { id: 12, name: "another", display_name: "Another" },
      ],
      next_cursor: 12,
    });
    expect(h.requests).toEqual([
      {
        url: `${config.apiOrigin}/api/v1/account/organizations?after=3`,
        method: "GET",
        headers: { authorization: "Bearer old-access-secret" },
      },
    ]);
    expect(h.writes).toHaveLength(0);
  });

  it("accepts an explicit empty terminal page without inventing memberships", async () => {
    const h = harness(session());
    const empty = { organizations: [], next_cursor: null };
    accountReply(h, { status: 200, body: empty });
    expect(await h.client.requestAccount("organizations.list")).toEqual(empty);
    expect(h.requests[0]?.url).toBe(
      `${config.apiOrigin}/api/v1/account/organizations`
    );
  });

  it("snapshots the validated cursor once despite an accessor or later caller mutation", async () => {
    const h = harness(session());
    accountReply(h);
    let reads = 0;
    const accessor = {
      get after() {
        return ++reads === 1 ? 3 : ("7&user_id=other" as never);
      },
    };
    await h.client.requestAccount("organizations.list", accessor);
    expect(reads).toBe(1);
    const input = { after: 3 };
    const pending = h.client.requestAccount("organizations.list", input);
    input.after = 99;
    await pending;
    expect(h.requests.map((request) => request.url)).toEqual([
      `${config.apiOrigin}/api/v1/account/organizations?after=3`,
      `${config.apiOrigin}/api/v1/account/organizations?after=3`,
    ]);
  });

  it("sanitizes a throwing cursor accessor before custody or transport access", async () => {
    const h = harness(session());
    const read = vi.spyOn(h.host.custody, "read");
    await expect(
      h.client.requestAccount("organizations.list", {
        get after(): number {
          throw new Error("private-accessor-details");
        },
      })
    ).rejects.toMatchObject({
      code: "invalid_input",
      message: "Grida authentication failed (invalid_input)",
    });
    expect(read).not.toHaveBeenCalled();
    expect(h.host.request).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    { user_id: "other" },
    { after: 0 },
    { after: -1 },
    { after: 1.5 },
    { after: "7" },
    { after: Number.MAX_SAFE_INTEGER + 1 },
    { after: NaN },
    { after: 7, limit: 200 },
    { [Symbol("headers")]: "secret" },
  ])(
    "rejects invalid fixed-operation input before custody or network I/O: %j",
    async (input) => {
      const h = harness(session());
      const read = vi.spyOn(h.host.custody, "read");
      await expect(
        h.client.requestAccount("organizations.list", input as never)
      ).rejects.toMatchObject({ code: "invalid_input" });
      expect(read).not.toHaveBeenCalled();
      expect(h.host.request).not.toHaveBeenCalled();
    }
  );

  it("refuses caller-defined operations and signed-out access before transport", async () => {
    const h = harness();
    await expect(
      h.client.requestAccount("https://elsewhere.invalid" as never)
    ).rejects.toMatchObject({ code: "unsupported_operation" });
    await expect(
      h.client.requestAccount("organizations.list")
    ).rejects.toMatchObject({ code: "signed_out" });
    expect(h.host.request).not.toHaveBeenCalled();
  });

  it.each([
    [401, "token_rejected"],
    [403, "forbidden"],
    [429, "unavailable"],
    [503, "unavailable"],
    [302, "unavailable"],
    [204, "unavailable"],
  ])("maps HTTP %i safely without refresh or replay", async (status, code) => {
    const h = harness(session());
    accountReply(h, {
      status: status as number,
      body: { message: "private-provider-diagnostic" },
    });
    await expect(
      h.client.requestAccount("organizations.list")
    ).rejects.toMatchObject({
      code,
      message: `Grida authentication failed (${code})`,
    });
    expect(h.requests).toHaveLength(1);
    expect(h.writes).toHaveLength(0);
  });

  it.each([
    null,
    {},
    { organizations: [], next_cursor: 1 },
    { organizations: [], next_cursor: undefined },
    { organizations: organizations.organizations, next_cursor: 8 },
    { organizations: organizations.organizations, next_cursor: "7" },
    {
      organizations: [{ id: 7, name: "example", display_name: null }],
      next_cursor: null,
    },
    {
      organizations: [{ id: 7, name: "", display_name: "" }],
      next_cursor: null,
    },
    {
      organizations: [{ id: 7, name: "a".repeat(40), display_name: "" }],
      next_cursor: null,
    },
    {
      organizations: [{ id: 0, name: "example", display_name: "" }],
      next_cursor: null,
    },
    {
      organizations: [
        { id: Number.MAX_SAFE_INTEGER + 1, name: "example", display_name: "" },
      ],
      next_cursor: null,
    },
    {
      organizations: [
        ...organizations.organizations,
        ...organizations.organizations,
      ],
      next_cursor: null,
    },
    {
      organizations: [
        { id: 8, name: "eight", display_name: "" },
        ...organizations.organizations,
      ],
      next_cursor: null,
    },
    {
      organizations: Array.from({ length: 101 }, (_, i) => ({
        id: i + 1,
        name: "example",
        display_name: "",
      })),
      next_cursor: null,
    },
  ])(
    "rejects malformed, unbounded or non-progressing wire pages: %j",
    async (body) => {
      const h = harness(session());
      accountReply(h, { status: 200, body });
      await expect(
        h.client.requestAccount("organizations.list")
      ).rejects.toMatchObject({ code: "invalid_response" });
      expect(h.writes).toHaveLength(0);
    }
  );

  it("refuses records at or before the requested cursor", async () => {
    const h = harness(session());
    accountReply(h);
    await expect(
      h.client.requestAccount("organizations.list", { after: 7 })
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("shares near-expiry refresh across memory reads and sends only the verified replacement bearer", async () => {
    const h = harness(session({ expiresAt: now + 30_000 }));
    accountReply(h);
    await Promise.all([
      h.client.requestAccount("organizations.list"),
      h.client.requestAccount("organizations.list"),
    ]);
    expect(
      h.requests.filter((r) => r.url.endsWith("/oauth/token"))
    ).toHaveLength(1);
    const reads = h.requests.filter((r) =>
      r.url.includes("/account/organizations")
    );
    expect(reads).toHaveLength(2);
    expect(
      reads.every((r) => r.headers.authorization === "Bearer new-access-secret")
    ).toBe(true);
  });

  it("serializes independent near-expiry readers and reuses the latest verified session", async () => {
    const store = sharedCustody(session({ expiresAt: now - 1 }));
    const first = store.client();
    const second = store.client();
    accountReply(first);
    accountReply(second);
    await Promise.all([
      first.client.requestAccount("organizations.list"),
      second.client.requestAccount("organizations.list"),
    ]);
    expect(
      [...first.requests, ...second.requests].filter((r) =>
        r.url.endsWith("/oauth/token")
      )
    ).toHaveLength(1);
    expect(second.requests[0]?.headers.authorization).toBe(
      "Bearer new-access-secret"
    );
    expect(store.acquisitions()).toBe(2);
    expect(store.active()).toBe(0);
  });

  it("keeps an accepted rotation when the account request fails without replaying the read", async () => {
    const store = sharedCustody(session({ expiresAt: now - 1 }));
    const h = store.client();
    accountReply(h, { status: 503, body: "private-diagnostic" });
    await expect(
      h.client.requestAccount("organizations.list")
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(store.stored()?.refreshToken).toBe("new-refresh-secret");
    expect(store.stored()?.accessToken).toBe("new-access-secret");
    expect(
      h.requests.filter((r) => r.url.includes("/account/organizations"))
    ).toHaveLength(1);
    expect(store.active()).toBe(0);
  });

  it.each([false, true])(
    "preserves accepted rotation if live identity fails before the account request (coordinated=%s)",
    async (coordinated) => {
      const previous = session({ expiresAt: now - 1 });
      const store = sharedCustody(previous);
      const h = coordinated ? store.client() : harness(previous);
      accountReply(h);
      const original = h.host.request;
      let unavailable = true;
      h.host.request = (request) => {
        if (request.url.endsWith("/api/v1/auth/me") && unavailable) {
          h.requests.push(request);
          return {
            result: Promise.resolve({ status: 503, body: null }),
            cancel() {},
          };
        }
        return original(request);
      };
      await expect(
        h.client.requestAccount("organizations.list")
      ).rejects.toMatchObject({ code: "unavailable" });
      expect(coordinated ? store.stored() : h.stored()).toEqual({
        ...previous,
        refreshToken: "new-refresh-secret",
      });
      expect(
        h.requests.some((r) => r.url.includes("/account/organizations"))
      ).toBe(false);
      unavailable = false;
      expect(await h.client.requestAccount("organizations.list")).toEqual(
        organizations
      );
      const grants = h.requests.filter((r) => r.url.endsWith("/oauth/token"));
      expect(new URLSearchParams(grants[1]?.body).get("refresh_token")).toBe(
        "new-refresh-secret"
      );
    }
  );

  it.each([false, true])(
    "logout fences an outstanding result even when transport ignores cancellation (coordinated=%s)",
    async (coordinated) => {
      const store = sharedCustody(session());
      const h = coordinated ? store.client() : harness(session());
      const entered = deferred<void>();
      const response = deferred<AuthClient.Response>();
      const cancel = vi.fn<() => void>();
      const original = h.host.request;
      h.host.request = (request) => {
        if (request.url.includes("/account/organizations")) {
          entered.resolve();
          return { result: response.promise, cancel };
        }
        return original(request);
      };
      const result = h.client
        .requestAccount("organizations.list")
        .catch((error: unknown) => error);
      await entered.promise;
      const logout = h.client.logout();
      expect(cancel).toHaveBeenCalledOnce();
      response.resolve({ status: 200, body: organizations });
      expect(await result).toMatchObject({ code: "cancelled" });
      await logout;
      expect(coordinated ? store.stored() : h.stored()).toBeNull();
    }
  );

  it("holds shared authority until result acceptance, so a different writer's logout waits", async () => {
    const store = sharedCustody(session());
    const first = store.client();
    const second = store.client();
    const entered = deferred<void>();
    const response = deferred<AuthClient.Response>();
    first.host.request = () => {
      entered.resolve();
      return { result: response.promise, cancel() {} };
    };
    const read = first.client.requestAccount("organizations.list");
    await entered.promise;
    const logout = second.client.logout();
    expect(store.active()).toBe(1);
    expect(store.stored()).not.toBeNull();
    response.resolve({ status: 200, body: organizations });
    expect(await read).toEqual(organizations);
    await logout;
    expect(store.stored()).toBeNull();
    await expect(
      first.client.requestAccount("organizations.list")
    ).rejects.toMatchObject({ code: "signed_out" });
  });

  it("rejects a memory read if a concurrent refresh replaced its captured credentials", async () => {
    const h = harness(session());
    const entered = deferred<void>();
    const response = deferred<AuthClient.Response>();
    const original = h.host.request;
    h.host.request = (request) => {
      if (request.url.includes("/account/organizations")) {
        entered.resolve();
        return { result: response.promise, cancel() {} };
      }
      return original(request);
    };
    const read = h.client
      .requestAccount("organizations.list")
      .catch((error: unknown) => error);
    await entered.promise;
    await h.client.refresh();
    response.resolve({ status: 200, body: organizations });
    expect(await read).toMatchObject({ code: "session_changed" });
    expect(h.stored()?.refreshToken).toBe("new-refresh-secret");
  });

  it("refuses login during an account read and releases that exclusion after transport failure", async () => {
    const h = harness(session());
    const entered = deferred<void>();
    const response = deferred<AuthClient.Response>();
    h.host.request = () => {
      entered.resolve();
      return { result: response.promise, cancel() {} };
    };
    const read = h.client
      .requestAccount("organizations.list")
      .catch((error: unknown) => error);
    await entered.promise;
    await expect(h.client.login()).rejects.toMatchObject({
      code: "session_busy",
    });
    response.reject(new Error("private-network-details"));
    expect(await read).toMatchObject({
      code: "unavailable",
      message: "Grida authentication failed (unavailable)",
    });
    const login = h.client.login().catch((error: unknown) => error);
    await h.bound;
    await expect(
      h.client.requestAccount("organizations.list")
    ).rejects.toMatchObject({ code: "session_busy" });
    await h.client.cancelLogin();
    expect(await login).toMatchObject({ code: "cancelled" });
  });
});

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
