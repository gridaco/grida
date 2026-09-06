// GRIDA-SEC-010 — loopback callbacks and credential transport regressions.
import { createHash } from "node:crypto";
import {
  createServer,
  request as httpRequest,
  ServerResponse,
} from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthClient } from "./index";
import { createNativeAuth } from "./node";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(cleanups.splice(0).map((close) => close()));
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

async function server(handler?: Parameters<typeof createServer>[0]) {
  const instance = handler ? createServer(handler) : createServer();
  const sockets = new Set<Socket>();
  instance.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    instance.once("error", reject);
    instance.listen(0, "127.0.0.1", resolve);
  });
  const port = (instance.address() as AddressInfo).port;
  const close = () =>
    new Promise<void>((resolve) => {
      instance.close(() => resolve());
      for (const socket of sockets) socket.destroy();
    });
  cleanups.push(close);
  return { instance, port, origin: `http://127.0.0.1:${port}`, close };
}

async function redirect() {
  const reservation = await server();
  await reservation.close();
  return `${reservation.origin}/callback`;
}

async function fixture() {
  const calls: { path: string; body: string; authorization?: string }[] = [];
  const upstream = await server();
  upstream.instance.on("request", (request, response) => {
    const parts: Buffer[] = [];
    request.on("data", (chunk) => parts.push(chunk));
    request.on("end", () => {
      const call = {
        path: request.url!,
        body: Buffer.concat(parts).toString(),
        authorization: request.headers.authorization,
      };
      calls.push(call);
      if (call.path === "/auth/v1/oauth/token") {
        const isRefresh =
          new URLSearchParams(call.body).get("grant_type") === "refresh_token";
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            token_type: "Bearer",
            access_token: isRefresh
              ? "rotated-access-secret"
              : "initial-access-secret",
            refresh_token: isRefresh
              ? "rotated-refresh-secret"
              : "initial-refresh-secret",
            expires_in: 3600,
          })
        );
      } else if (call.path === "/api/v1/auth/me") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            id: "synthetic-user",
            email: null,
            display_name: "Synthetic",
            ignored: "not-public",
          })
        );
      } else if (call.path === "/auth/v1/logout?scope=local") {
        response.writeHead(204);
        response.end();
      } else {
        response.writeHead(404);
        response.end();
      }
    });
  });
  let session: AuthClient.Session | null = null;
  const custody: AuthClient.Custody = {
    async read() {
      return session;
    },
    async write(value) {
      session = value;
    },
    async clear() {
      session = null;
    },
  };
  const config: AuthClient.Config = {
    clientId: "synthetic-public-client",
    issuer: `${upstream.origin}/auth/v1`,
    apiOrigin: upstream.origin,
    redirectUris: [await redirect()],
  };
  return { config, custody, calls, session: () => session, upstream };
}

function callback(authorizationUrl: string) {
  const authorization = new URL(authorizationUrl);
  const url = new URL(authorization.searchParams.get("redirect_uri")!);
  url.searchParams.set("state", authorization.searchParams.get("state")!);
  url.searchParams.set("code", "synthetic-code-secret");
  return url;
}

function rawCallback(
  url: URL,
  path = url.pathname + url.search,
  headers = {},
  method = "GET"
) {
  return new Promise<number>((resolve, reject) => {
    const request = httpRequest(
      { host: "127.0.0.1", port: url.port, path, method, headers },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode!));
      }
    );
    request.once("error", reject);
    request.end();
  });
}

async function provesClosed(uri: string) {
  const instance = createServer();
  cleanups.push(
    () => new Promise<void>((resolve) => instance.close(() => resolve()))
  );
  await new Promise<void>((resolve, reject) => {
    instance.once("error", reject);
    instance.listen(Number(new URL(uri).port), "127.0.0.1", resolve);
  });
}

describe("createNativeAuth", () => {
  it.each(["organizations.list", "credits.read"] as const)(
    "carries %s over bounded native HTTP without cookies, redirects or raw response fields",
    async (operation) => {
      let mode: "ok" | "oversized" | "redirect" = "ok";
      let calls = 0;
      const upstream = await server();
      upstream.instance.on("request", (request, response) => {
        ++calls;
        expect(request.url).toBe(
          operation === "organizations.list"
            ? "/api/v1/account/organizations?after=1"
            : "/api/v1/account/credits?organization_id=2"
        );
        expect(request.method).toBe("GET");
        expect(request.headers.authorization).toBe(
          "Bearer account-access-secret"
        );
        expect(request.headers.cookie).toBeUndefined();
        if (mode === "redirect") {
          response.writeHead(302, { location: "/unexpected" }).end();
          return;
        }
        response.writeHead(200, {
          "content-type": "application/json",
          "x-private": "secret",
        });
        response.end(
          JSON.stringify(
            operation === "organizations.list"
              ? {
                  organizations: [
                    {
                      id: 2,
                      name: "example",
                      display_name:
                        mode === "oversized" ? "x".repeat(65_536) : "Example",
                      private: "secret",
                    },
                  ],
                  next_cursor: null,
                  access_token: "secret",
                }
              : {
                  organization: {
                    id: 2,
                    name: "example",
                    display_name: "Example",
                    private: "secret",
                  },
                  account_present: true,
                  state: "cached",
                  source: "cache",
                  currency: "USD",
                  balance_cents: 0,
                  cache_updated_at: "2026-09-07T00:00:00Z",
                  billing_gate: {
                    allowed: false,
                    reason: "below_floor",
                    provider: "secret",
                  },
                  access_token:
                    mode === "oversized" ? "x".repeat(65_536) : "secret",
                }
          )
        );
      });
      const config: AuthClient.Config = {
        issuer: `${upstream.origin}/auth/v1`,
        apiOrigin: upstream.origin,
        clientId: "synthetic-public-client",
        redirectUris: ["http://127.0.0.1:55435/callback"],
      };
      const session: AuthClient.Session = {
        issuer: config.issuer,
        apiOrigin: config.apiOrigin,
        clientId: config.clientId,
        identity: {
          id: "synthetic-user",
          email: null,
          display_name: "Synthetic",
        },
        accessToken: "account-access-secret",
        refreshToken: "account-refresh-secret",
        expiresAt: Date.now() + 3_600_000,
      };
      const client = createNativeAuth(config, {
        custody: {
          async read() {
            return session;
          },
          async write() {
            throw new Error("Unexpected custody write");
          },
          async clear() {
            throw new Error("Unexpected custody clear");
          },
        },
        async openBrowser() {
          throw new Error("Unexpected browser launch");
        },
      });
      const read = () =>
        operation === "organizations.list"
          ? client.requestAccount("organizations.list", { after: 1 })
          : client.requestAccount("credits.read", { organization_id: 2 });
      expect(await read()).toEqual(
        operation === "organizations.list"
          ? {
              organizations: [
                { id: 2, name: "example", display_name: "Example" },
              ],
              next_cursor: null,
            }
          : {
              organization: { id: 2, name: "example", display_name: "Example" },
              account_present: true,
              state: "cached",
              source: "cache",
              currency: "USD",
              balance_cents: 0,
              cache_updated_at: "2026-09-07T00:00:00Z",
              billing_gate: { allowed: false, reason: "below_floor" },
            }
      );
      mode = "oversized";
      await expect(read()).rejects.toMatchObject({ code: "invalid_response" });
      mode = "redirect";
      await expect(read()).rejects.toMatchObject({ code: "unavailable" });
      expect(calls).toBe(3);
    }
  );

  it("runs S256 login, live verification, refresh, and session-local logout over owned loopback servers", async () => {
    const f = await fixture();
    let launched = "";
    const client = createNativeAuth(f.config, {
      custody: f.custody,
      async openBrowser(url) {
        launched = url;
        const response = await fetch(callback(url));
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.text()).not.toMatch(
          /synthetic-code|access-secret|refresh-secret/
        );
      },
    });
    const status = await client.login();
    expect(status).toMatchObject({
      state: "signed-in",
      identity: {
        id: "synthetic-user",
        email: null,
        display_name: "Synthetic",
      },
    });
    const authorization = new URL(launched);
    const body = new URLSearchParams(f.calls[0]!.body);
    expect(
      createHash("sha256")
        .update(body.get("code_verifier")!)
        .digest("base64url")
    ).toBe(authorization.searchParams.get("code_challenge"));
    expect(body.get("redirect_uri")).toBe(f.config.redirectUris[0]);
    expect(body.has("client_secret")).toBe(false);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect((await client.verify()).state).toBe("signed-in");
    expect((await client.refresh()).state).toBe("signed-in");
    expect(f.session()?.refreshToken).toBe("rotated-refresh-secret");
    expect(await client.logout()).toEqual({
      state: "signed-out",
      revocation: "confirmed",
    });
    expect(f.calls.at(-1)).toEqual({
      path: "/auth/v1/logout?scope=local",
      body: "",
      authorization: "Bearer rotated-access-secret",
    });
    expect(f.session()).toBeNull();
    expect(JSON.stringify(status)).not.toMatch(/secret|ignored/);
    await provesClosed(f.config.redirectUris[0]!);
  });

  it("keeps a pending ceremony usable after wrong method, path, host, state, and duplicate parameters", async () => {
    const f = await fixture();
    const statuses: number[] = [];
    const client = createNativeAuth(f.config, {
      custody: f.custody,
      async openBrowser(url) {
        const valid = callback(url);
        statuses.push(await rawCallback(valid, undefined, {}, "POST"));
        statuses.push(await rawCallback(valid, `/other${valid.search}`));
        statuses.push(
          await rawCallback(valid, `/other/../callback${valid.search}`)
        );
        statuses.push(
          await rawCallback(valid, undefined, { host: "attacker.example" })
        );
        statuses.push(
          await rawCallback(valid, undefined, {
            origin: "https://attacker.example",
          })
        );
        statuses.push(
          await rawCallback(valid, `${valid.pathname}?state=wrong&code=code`)
        );
        statuses.push(
          await rawCallback(
            valid,
            `${valid.pathname}${valid.search}&state=duplicate`
          )
        );
        statuses.push(
          await rawCallback(
            valid,
            `${valid.pathname}${valid.search}&access_token=forbidden`
          )
        );
        statuses.push(await rawCallback(valid));
      },
    });
    await client.login();
    expect(statuses.slice(0, 8)).toEqual(Array(8).fill(400));
    // The browser task may finish just after the native task; callback receipt was accepted.
    expect(
      f.calls.filter((call) => call.path.endsWith("/oauth/token"))
    ).toHaveLength(1);
    await provesClosed(f.config.redirectUris[0]!);
  });

  it("rejects callback issuer mismatch without exchanging the code", async () => {
    const f = await fixture();
    const client = createNativeAuth(f.config, {
      custody: f.custody,
      async openBrowser(url) {
        const received = callback(url);
        received.searchParams.set("iss", "https://wrong.example/auth/v1");
        await fetch(received);
      },
    });
    await expect(client.login()).rejects.toMatchObject({
      code: "invalid_callback",
    });
    expect(f.calls).toHaveLength(0);
    await provesClosed(f.config.redirectUris[0]!);
  });

  it("accepts denial only with matching state and closes the callback listener", async () => {
    const f = await fixture();
    const client = createNativeAuth(f.config, {
      custody: f.custody,
      async openBrowser(url) {
        const denied = callback(url);
        denied.searchParams.delete("code");
        denied.searchParams.set("error", "access_denied");
        denied.searchParams.set(
          "error_description",
          "never-reflect-this-secret"
        );
        const response = await fetch(denied);
        expect(await response.text()).not.toContain("never-reflect");
      },
    });
    await expect(client.login()).rejects.toMatchObject({
      code: "access_denied",
    });
    expect(f.calls).toHaveLength(0);
    await provesClosed(f.config.redirectUris[0]!);
  });

  it.each(["finish", "deadline"] as const)(
    "waits for callback receipt %s before exposing denial and closing its socket",
    async (completion) => {
      const f = await fixture();
      const receipt =
        "Authorization received. Return to the application to see the result.";
      const endEntered = deferred<void>();
      const release = deferred<void>();
      const originalEnd = ServerResponse.prototype.end;
      const end = vi
        .spyOn(ServerResponse.prototype, "end")
        .mockImplementation(function (
          this: ServerResponse,
          ...args: Parameters<ServerResponse["end"]>
        ) {
          if (args[0] === receipt) {
            endEntered.resolve();
            void release.promise.then(() => originalEnd.apply(this, args));
            return this;
          }
          return originalEnd.apply(this, args);
        });
      let browserResponse: Promise<string | null> | undefined;
      const client = createNativeAuth(f.config, {
        custody: f.custody,
        async openBrowser(url) {
          const denied = callback(url);
          denied.searchParams.delete("code");
          denied.searchParams.set("error", "access_denied");
          browserResponse = fetch(denied)
            .then((response) => response.text())
            .catch(() => null);
        },
      });
      let terminal = false;
      const login = client.login().catch((error: AuthClient.Failure) => {
        terminal = true;
        return error.code;
      });
      try {
        await endEntered.promise;
        await new Promise<void>((resolve) => setImmediate(resolve));
        const terminalBeforeFlush = terminal;
        if (completion === "finish") release.resolve();
        expect(await login).toBe("access_denied");
        expect(await browserResponse).toBe(
          completion === "finish" ? receipt : null
        );
        expect(terminalBeforeFlush).toBe(false);
        await provesClosed(f.config.redirectUris[0]!);
      } finally {
        release.resolve();
        end.mockRestore();
        await client.cancelLogin();
      }
    }
  );

  it("tries the next explicitly registered port when one is occupied", async () => {
    const f = await fixture();
    const blocker = await server();
    const second = f.config.redirectUris[0]!;
    const seen: string[] = [];
    const client = createNativeAuth(
      { ...f.config, redirectUris: [`${blocker.origin}/callback`, second] },
      {
        custody: f.custody,
        async openBrowser(url) {
          seen.push(new URL(url).searchParams.get("redirect_uri")!);
          await fetch(callback(url));
        },
      }
    );
    await client.login();
    expect(seen).toEqual([second]);
  });

  it("fails before launching a browser when every registered port is occupied", async () => {
    const f = await fixture();
    const blocker = await server();
    const openBrowser = vi.fn<(url: string) => Promise<void>>(
      async () => undefined
    );
    const client = createNativeAuth(
      { ...f.config, redirectUris: [`${blocker.origin}/callback`] },
      { custody: f.custody, openBrowser }
    );
    await expect(client.login()).rejects.toMatchObject({
      code: "callback_unavailable",
    });
    expect(openBrowser).not.toHaveBeenCalled();
  });

  it("closes the real listener and its sockets on explicit cancellation", async () => {
    const f = await fixture();
    const opened = deferred<void>();
    const client = createNativeAuth(f.config, {
      custody: f.custody,
      async openBrowser() {
        opened.resolve();
      },
    });
    const login = client.login();
    const rejected = login.catch((error: unknown) => error);
    await opened.promise;
    await client.cancelLogin();
    expect(await rejected).toMatchObject({ code: "cancelled" });
    await provesClosed(f.config.redirectUris[0]!);
  });

  it("expires a pending callback after two minutes and releases its port", async () => {
    const f = await fixture();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const opened = deferred<void>();
    const client = createNativeAuth(f.config, {
      custody: f.custody,
      async openBrowser() {
        opened.resolve();
      },
    });
    const login = client.login();
    const rejected = login.catch((error: unknown) => error);
    await opened.promise;
    await vi.advanceTimersByTimeAsync(120_000);
    vi.useRealTimers();
    expect(await rejected).toMatchObject({
      code: "callback_timeout",
    });
    await provesClosed(f.config.redirectUris[0]!);
  });

  it("does not follow token endpoint redirects or reveal an upstream error body", async () => {
    const f = await fixture();
    f.upstream.instance.removeAllListeners("request");
    const paths: string[] = [];
    f.upstream.instance.on("request", (request, response) => {
      paths.push(request.url!);
      response.writeHead(302, { location: `${f.upstream.origin}/capture` });
      response.end("upstream-secret-that-must-not-escape");
    });
    const client = createNativeAuth(f.config, {
      custody: f.custody,
      async openBrowser(url) {
        await fetch(callback(url));
      },
    });
    await expect(client.login()).rejects.toMatchObject({
      code: "unavailable",
      message: "Grida authentication failed (unavailable)",
    });
    expect(paths).toEqual(["/auth/v1/oauth/token"]);
    expect(f.session()).toBeNull();
  });

  it("bounds successful response bodies before parsing token JSON", async () => {
    const f = await fixture();
    f.upstream.instance.removeAllListeners("request");
    f.upstream.instance.on("request", (_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ secret: "x".repeat(65_536) }));
    });
    const client = createNativeAuth(f.config, {
      custody: f.custody,
      async openBrowser(url) {
        await fetch(callback(url));
      },
    });
    await expect(client.login()).rejects.toMatchObject({
      code: "invalid_response",
    });
    expect(f.session()).toBeNull();
    await provesClosed(f.config.redirectUris[0]!);
  });

  it("aborts token requests after the bounded network deadline", async () => {
    const f = await fixture();
    const entered = deferred<void>();
    f.upstream.instance.removeAllListeners("request");
    f.upstream.instance.on("request", () => entered.resolve());
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const client = createNativeAuth(f.config, {
      custody: f.custody,
      async openBrowser(url) {
        await fetch(callback(url));
      },
    });
    const login = client.login();
    const rejected = login.catch((error: unknown) => error);
    await entered.promise;
    await vi.advanceTimersByTimeAsync(15_000);
    vi.useRealTimers();
    expect(await rejected).toMatchObject({
      code: "unavailable",
    });
    expect(f.session()).toBeNull();
    await provesClosed(f.config.redirectUris[0]!);
  });
});
