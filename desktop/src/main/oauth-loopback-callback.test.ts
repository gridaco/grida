/**
 * GRIDA-SEC-008 — contract pins for the main-owned OAuth callback listener.
 */
import crypto from "node:crypto";
import http, { type IncomingHttpHeaders, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OAuthLoopbackCallback } from "./oauth-loopback-callback";

const hosts = new Set<OAuthLoopbackCallback>();
const blockers = new Set<Server>();

afterEach(async () => {
  for (const host of hosts) host.close();
  hosts.clear();
  await Promise.all([...blockers].map(closeServer));
  blockers.clear();
});

describe("OAuthLoopbackCallback", () => {
  it("binds localhost on IPv4 and IPv6 and shows success only after completion", async () => {
    const host = await callbackHost();
    const attempt = await host.start();
    const state = "state_0123456789abcdef0123456789";
    const completionStarted = deferred<OAuthLoopbackCallback.Callback>();
    const releaseCompletion = deferred<void>();
    attempt.activate({
      state,
      complete: async (callback) => {
        completionStarted.resolve(callback);
        await releaseCompletion.promise;
      },
    });

    expect(attempt.redirect_uri).toBe(
      `http://localhost:${attempt.port}/auth/callback`
    );
    expect(attempt.loopback_hosts).toContain("127.0.0.1");

    const invalid = await request(attempt, {
      connect_host: "127.0.0.1",
      target: `/auth/callback?code=forged&state=${state}-wrong`,
    });
    expect(invalid.status).toBe(400);

    let resultSettled = false;
    void attempt.result.then(
      () => {
        resultSettled = true;
      },
      () => {
        resultSettled = true;
      }
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(resultSettled).toBe(false);

    const connectHost = attempt.loopback_hosts.includes("::1")
      ? "::1"
      : "127.0.0.1";
    const browserResponse = request(attempt, {
      connect_host: connectHost,
      target: `/auth/callback?code=real-code&state=${state}`,
    });
    const callback = await completionStarted.promise;
    let browserSettled = false;
    void browserResponse.finally(() => {
      browserSettled = true;
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(callback).toEqual(
      expect.objectContaining({
        code: "real-code",
        state,
        redirect_uri: attempt.redirect_uri,
      })
    );
    expect(callback.signal.aborted).toBe(false);
    expect(browserSettled).toBe(false);

    releaseCompletion.resolve();
    const response = await browserResponse;
    expect(response.status).toBe(200);
    expect(response.body).toContain("Signed in with ChatGPT");
    expect(response.body).toContain('data-outcome="success"');
    expect(response.body).toContain(
      'class="provider-mark" role="img" aria-label="OpenAI"'
    );
    expect(response.body).toContain("@media (prefers-color-scheme: dark)");
    expect(response.body).not.toContain("<script");
    expect(response.body).not.toContain("real-code");
    expect(response.body).not.toContain(state);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["content-length"]).toBe(
      String(Buffer.byteLength(response.body))
    );

    const styles = response.body.match(/<style>([\s\S]+)<\/style>/)?.[1];
    expect(styles).toBeDefined();
    const styleHash = crypto
      .createHash("sha256")
      .update(styles!, "utf8")
      .digest("base64");
    expect(response.headers["content-security-policy"]).toBe(
      `default-src 'none'; style-src 'sha256-${styleHash}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
    );
    await expect(attempt.result).resolves.toEqual({
      code: "real-code",
      state,
      redirect_uri: attempt.redirect_uri,
    });

    // The exact ports are reusable immediately after the terminal response.
    const next = await host.start();
    next.cancel();
    await expect(next.result).rejects.toThrow(/cancelled/);
  });

  it("bounds the exact GET callback without consuming malformed requests", async () => {
    const host = await callbackHost();
    const attempt = await host.start();
    const state = "state_abcdef0123456789abcdef012345";
    const complete = vi.fn<OAuthLoopbackCallback.Activation["complete"]>(
      async () => undefined
    );
    attempt.activate({ state, complete });

    expect(
      (
        await request(attempt, {
          target: `/auth/callback?code=x&state=${state}`,
          host_header: `127.0.0.1:${attempt.port}`,
        })
      ).status
    ).toBe(400);
    expect(
      (
        await request(attempt, {
          method: "POST",
          target: `/auth/callback?code=x&state=${state}`,
        })
      ).status
    ).toBe(405);
    expect(
      (
        await request(attempt, {
          target: `/another-path?code=x&state=${state}`,
        })
      ).status
    ).toBe(404);
    expect(
      (
        await request(attempt, {
          target: `/auth/callback?state=wrong-state-0123456789&extra=${"x".repeat(
            4_100
          )}`,
        })
      ).status
    ).toBe(400);
    expect(
      (
        await request(attempt, {
          target: `/auth/callback?state=${state}&state=${state}&code=x`,
        })
      ).status
    ).toBe(400);
    expect(complete).not.toHaveBeenCalled();

    const response = await request(attempt, {
      target: `/auth/callback?ignored=bounded&state=${state}&code=real-code`,
    });
    expect(response.status).toBe(200);
    expect(complete).toHaveBeenCalledTimes(1);
    await expect(attempt.result).resolves.toMatchObject({ code: "real-code" });
  });

  it("atomically claims one callback and refuses a concurrent replay", async () => {
    const host = await callbackHost();
    const attempt = await host.start();
    const state = "state_111111111111111111111111111";
    const completionStarted = deferred<void>();
    const releaseCompletion = deferred<void>();
    const complete = vi.fn<OAuthLoopbackCallback.Activation["complete"]>(
      async () => {
        completionStarted.resolve();
        await releaseCompletion.promise;
      }
    );
    attempt.activate({ state, complete });
    await expect(host.start()).rejects.toThrow(/already active/);

    const accepted = request(attempt, {
      target: `/auth/callback?state=${state}&code=one-time-code`,
    });
    await completionStarted.promise;
    const replay = await request(attempt, {
      target: `/auth/callback?state=${state}&code=replayed-code`,
    }).catch((error: NodeJS.ErrnoException) => error.code ?? "refused");

    const replayRefusal =
      typeof replay === "string" ? replay : `HTTP_${replay.status}`;
    expect([
      "ECONNREFUSED",
      "ECONNRESET",
      "refused",
      "HTTP_409",
      "HTTP_410",
    ]).toContain(replayRefusal);
    expect(complete).toHaveBeenCalledTimes(1);

    releaseCompletion.resolve();
    expect((await accepted).status).toBe(200);
    await expect(attempt.result).resolves.toMatchObject({
      code: "one-time-code",
    });
  });

  it("renders provider and completion failures without reflecting details", async () => {
    const ports = await freePorts(4);
    const providerHost = createHost(ports.slice(0, 2));
    const providerAttempt = await providerHost.start();
    const state = "state_222222222222222222222222222";
    const complete = vi.fn<OAuthLoopbackCallback.Activation["complete"]>(
      async () => undefined
    );
    providerAttempt.activate({ state, complete });

    const denied = await request(providerAttempt, {
      target: `/auth/callback?state=${state}&error=access_denied&error_description=sensitive-upstream-detail`,
    });
    expect(denied.status).toBe(400);
    expect(denied.body).toContain('data-outcome="error"');
    expect(denied.body).toContain('aria-label="OpenAI"');
    expect(denied.body).not.toContain("sensitive-upstream-detail");
    expect(complete).not.toHaveBeenCalled();
    await expect(providerAttempt.result).rejects.toThrow(/not granted/);

    const completionHost = createHost(ports.slice(2, 4));
    const completionAttempt = await completionHost.start();
    completionAttempt.activate({
      state,
      complete: async () => {
        throw new Error("sensitive persistence diagnostic");
      },
    });
    const failed = await request(completionAttempt, {
      target: `/auth/callback?state=${state}&code=one-time-code`,
    });
    expect(failed.status).toBe(502);
    expect(failed.body).not.toContain("sensitive persistence diagnostic");
    await expect(completionAttempt.result).rejects.toThrow(/completion failed/);
  });

  it("aborts in-flight completion when the active attempt is cancelled", async () => {
    const host = await callbackHost();
    const attempt = await host.start();
    const state = "state_333333333333333333333333333";
    const completionStarted = deferred<AbortSignal>();
    attempt.activate({
      state,
      complete: async ({ signal }) => {
        completionStarted.resolve(signal);
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      },
    });

    const browserResponse = request(attempt, {
      target: `/auth/callback?state=${state}&code=one-time-code`,
    });
    const signal = await completionStarted.promise;
    attempt.cancel();

    expect(signal.aborted).toBe(true);
    const response = await browserResponse;
    expect(response.status).toBe(409);
    expect(response.body).toContain("Sign-in was cancelled");
    expect(response.body).not.toContain("Signed in with ChatGPT");
    await expect(attempt.result).rejects.toThrow(/cancelled/);
  });

  it("times out, cancels, and closes every terminal listener", async () => {
    const ports = await freePorts(2);
    const host = createHost(ports, 25);
    const timedOut = await host.start();
    await expect(timedOut.result).rejects.toThrow(/timed out/);

    const cancelled = await host.start();
    cancelled.cancel();
    await expect(cancelled.result).rejects.toThrow(/cancelled/);

    const reusable = await host.start();
    reusable.cancel();
    await expect(reusable.result).rejects.toThrow(/cancelled/);
  });

  it("uses the configured fallback when either loopback family owns the preferred port", async () => {
    const [preferred, fallback] = await freePorts(2);
    const ipv4Blocker = await listen(preferred, "127.0.0.1");
    blockers.add(ipv4Blocker);
    const ipv4Host = createHost([preferred, fallback]);
    const ipv4Attempt = await ipv4Host.start();
    expect(ipv4Attempt.port).toBe(fallback);
    ipv4Attempt.cancel();
    await expect(ipv4Attempt.result).rejects.toThrow(/cancelled/);
    await closeServer(ipv4Blocker);
    blockers.delete(ipv4Blocker);

    const ipv6Blocker = await tryListen(preferred, "::1");
    if (!ipv6Blocker) return;
    blockers.add(ipv6Blocker);
    const ipv6Host = createHost([preferred, fallback]);
    const ipv6Attempt = await ipv6Host.start();
    expect(ipv6Attempt.port).toBe(fallback);
    ipv6Attempt.cancel();
    await expect(ipv6Attempt.result).rejects.toThrow(/cancelled/);
  });

  it("rejects non-fixed listener configuration", () => {
    expect(
      () =>
        new OAuthLoopbackCallback({
          ports: [0],
          path: "/auth/callback",
        })
    ).toThrow(/ports/);
    expect(
      () =>
        new OAuthLoopbackCallback({
          ports: [14_455],
          path: "//attacker.example/callback",
        })
    ).toThrow(/path/);
    expect(
      () =>
        new OAuthLoopbackCallback({
          ports: [14_455],
          path: "/auth/callback",
          timeout_ms: 10 * 60 * 1_000 + 1,
        })
    ).toThrow(/timeout/);
  });
});

async function callbackHost(): Promise<OAuthLoopbackCallback> {
  return createHost(await freePorts(2));
}

function createHost(
  ports: number[],
  timeoutMs?: number
): OAuthLoopbackCallback {
  if (ports.length === 0) throw new Error("test requires at least one port");
  const host = new OAuthLoopbackCallback({
    ports: ports as [number, ...number[]],
    path: "/auth/callback",
    timeout_ms: timeoutMs,
  });
  hosts.add(host);
  return host;
}

async function request(
  attempt: OAuthLoopbackCallback.Attempt,
  options: Readonly<{
    target: string;
    method?: string;
    connect_host?: "127.0.0.1" | "::1";
    host_header?: string;
  }>
): Promise<
  Readonly<{
    status: number;
    body: string;
    headers: IncomingHttpHeaders;
  }>
> {
  const connectHost = options.connect_host ?? "127.0.0.1";
  return new Promise((resolve, reject) => {
    const outgoing = http.request(
      {
        hostname: connectHost,
        family: connectHost === "::1" ? 6 : 4,
        port: attempt.port,
        method: options.method ?? "GET",
        path: options.target,
        headers: {
          Host: options.host_header ?? `localhost:${attempt.port}`,
          Connection: "close",
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: response.headers,
          })
        );
      }
    );
    outgoing.once("error", reject);
    outgoing.setTimeout(2_000, () =>
      outgoing.destroy(new Error("test callback request timed out"))
    );
    outgoing.end();
  });
}

async function freePorts(count: number): Promise<number[]> {
  const ports = new Set<number>();
  while (ports.size < count) {
    const server = await listen(0, "127.0.0.1");
    const address = server.address();
    if (!address || typeof address === "string") {
      await closeServer(server);
      throw new Error("test server did not bind a TCP port");
    }
    ports.add(address.port);
    await closeServer(server);
  }
  return [...ports];
}

function listen(port: number, host: string): Promise<Server> {
  const server = http.createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ port, host, exclusive: true }, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}

async function tryListen(port: number, host: string): Promise<Server | null> {
  try {
    return await listen(port, host);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EAFNOSUPPORT" || code === "EADDRNOTAVAIL") return null;
    throw error;
  }
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    try {
      server.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T extends void ? void | undefined : T) => void;
} {
  let resolve!: (value: T extends void ? void | undefined : T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise as typeof resolve;
  });
  return { promise, resolve };
}
