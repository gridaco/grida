// GRIDA-SEC-010 — public persistent factory across real isolated consumer processes.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

const execute = promisify(execFile);
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const identity = {
  id: "synthetic-user",
  email: "synthetic@example.test",
  display_name: "Synthetic",
};
const workerSource = String.raw`
import { createRequire } from 'node:module';
import { createPersistentNativeAuth } from '@grida/auth/node';
const require = createRequire(import.meta.url);
let auth;
function send(message) { process.send(message); }
process.on('message', async (message) => {
  try {
    if (message.type === 'init') {
      let nativeAddonAbsent = false;
      try { require.resolve('@github/keytar'); }
      catch (error) { nativeAddonAbsent = error.code === 'MODULE_NOT_FOUND'; }
      if (!nativeAddonAbsent) throw new Error('Unexpected native dependency');
      auth = await createPersistentNativeAuth(message.config, {
        home: message.home,
        storage: 'file',
        async openBrowser(url) { send({ type: 'browser', url }); },
      });
      send({ type: 'ready', nativeAddonAbsent, storage: await auth.storage.info() });
      return;
    }
    const action = message.action;
    if (!auth || !['login', 'refresh', 'verify', 'status', 'logout'].includes(action))
      throw new Error('Invalid consumer action');
    send({ type: 'started' });
    const result = await auth.client[action]();
    process.send({ type: 'result', ok: true, result }, () => process.disconnect());
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : 'consumer_failed';
    process.send({ type: 'result', ok: false, code }, () => process.disconnect());
  }
});
`;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

type Message = {
  type: string;
  ok?: boolean;
  code?: string;
  result?: unknown;
  url?: string;
  nativeAddonAbsent?: boolean;
  storage?: { backend: string };
};

/** One invocation per process, communicating safe results over IPC only. */
class Consumer {
  readonly child: ChildProcess;
  private messages: Message[] = [];
  private listeners = new Set<() => void>();
  private ended = false;

  constructor(root: string, config: object, home: string) {
    this.child = spawn(process.execPath, [path.join(root, "consumer.mjs")], {
      cwd: root,
      env: {
        HOME: root,
        PATH: path.dirname(process.execPath),
        NODE_NO_WARNINGS: "1",
      },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    this.child.on("message", (message) => {
      this.messages.push(message as Message);
      for (const listener of this.listeners) listener();
    });
    this.child.on("exit", () => {
      this.ended = true;
      for (const listener of this.listeners) listener();
    });
    this.child.send({ type: "init", config, home });
  }

  wait(type: string): Promise<Message> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(check);
        reject(new Error(`Synthetic consumer timed out waiting for ${type}`));
      }, 15_000);
      const check = () => {
        const message = this.messages.find((item) => item.type === type);
        const failure = this.messages.find(
          (item) => item.type === "result" && item.ok === false
        );
        if (message || failure || this.ended) {
          clearTimeout(timer);
          this.listeners.delete(check);
          if (message) resolve(message);
          else
            reject(
              new Error(
                `Synthetic consumer stopped before ${type}: ${failure?.code ?? "exit"}`
              )
            );
        }
      };
      this.listeners.add(check);
      check();
    });
  }

  run(action: string) {
    this.child.send({ type: "run", action });
    return this.wait("result");
  }

  async close() {
    if (this.ended) return;
    const done = new Promise<void>((resolve) =>
      this.child.once("exit", () => resolve())
    );
    this.child.kill("SIGKILL");
    await done;
  }
}

/** Synthetic OAuth authority: one-use S256 codes and immediately spent refresh tokens. */
class Issuer {
  private readonly server = createServer((request, response) => {
    void this.handle(request, response).catch(() =>
      this.respond(response, 500, {})
    );
  });
  private readonly codes = new Map<
    string,
    { challenge: string; redirect: string }
  >();
  private readonly refreshTokens = new Map<string, number>();
  private readonly accessTokens = new Map<string, number>();
  private readonly active = new Set<number>();
  private sequence = 0;
  private rotation = 0;
  private gate: {
    kind: "refresh" | "verify";
    entered: ReturnType<typeof deferred<void>>;
    release: ReturnType<typeof deferred<void>>;
  } | null = null;
  private releases: (() => void)[] = [];
  readonly refreshes: string[] = [];
  readonly verifications: string[] = [];
  readonly revocations: string[] = [];
  config!: {
    issuer: string;
    apiOrigin: string;
    clientId: string;
    redirectUris: string[];
  };

  async start() {
    await listen(this.server);
    const origin = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    // Reserve a callback registration before giving the fixed configuration to
    // consumers. The native factory owns binding it during each ceremony.
    const callback = createServer();
    await listen(callback);
    const port = (callback.address() as AddressInfo).port;
    await new Promise<void>((resolve) => callback.close(() => resolve()));
    this.config = {
      issuer: `${origin}/auth/v1`,
      apiOrigin: origin,
      clientId: "synthetic-public-client",
      redirectUris: [`http://127.0.0.1:${port}/callback`],
    };
  }

  hold(kind: "refresh" | "verify") {
    const gate = { kind, entered: deferred<void>(), release: deferred<void>() };
    this.gate = gate;
    this.releases.push(() => gate.release.resolve());
    return gate;
  }

  async approve(authorization: string) {
    const url = new URL(authorization);
    assert.equal(
      `${url.origin}${url.pathname}`,
      `${this.config.issuer}/oauth/authorize`
    );
    assert.equal(url.searchParams.get("client_id"), this.config.clientId);
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    const redirect = url.searchParams.get("redirect_uri")!;
    assert(this.config.redirectUris.includes(redirect));
    const code = randomUUID();
    this.codes.set(code, {
      challenge: url.searchParams.get("code_challenge")!,
      redirect,
    });
    const callback = new URL(redirect);
    callback.searchParams.set("state", url.searchParams.get("state")!);
    callback.searchParams.set("code", code);
    const response = await fetch(callback, {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 200);
    await response.text();
  }

  async close() {
    for (const release of this.releases) release();
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private respond(response: ServerResponse, status: number, body: unknown) {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  }

  private tokens(session: number) {
    const suffix = `${session}-${++this.rotation}`;
    const access = `synthetic-access-${suffix}`;
    const refresh = `synthetic-refresh-${suffix}`;
    this.accessTokens.set(access, session);
    this.refreshTokens.set(refresh, session);
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: "Bearer",
      expires_in: 3600,
    };
  }

  private async pause(kind: "refresh" | "verify") {
    if (this.gate?.kind !== kind) return;
    const gate = this.gate;
    this.gate = null;
    gate.entered.resolve();
    await gate.release.promise;
  }

  private async handle(request: IncomingMessage, response: ServerResponse) {
    if (request.method === "POST" && request.url === "/auth/v1/oauth/token") {
      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 8192) return this.respond(response, 413, {});
      }
      const form = new URLSearchParams(body);
      if (form.get("client_id") !== this.config.clientId)
        return this.respond(response, 400, {});
      if (form.get("grant_type") === "authorization_code") {
        const code = form.get("code") ?? "";
        const pending = this.codes.get(code);
        this.codes.delete(code);
        const challenge = createHash("sha256")
          .update(form.get("code_verifier") ?? "")
          .digest("base64url");
        if (
          !pending ||
          pending.challenge !== challenge ||
          pending.redirect !== form.get("redirect_uri")
        )
          return this.respond(response, 400, {});
        const session = ++this.sequence;
        this.active.add(session);
        return this.respond(response, 200, this.tokens(session));
      }
      if (form.get("grant_type") === "refresh_token") {
        const token = form.get("refresh_token") ?? "";
        this.refreshes.push(token);
        const session = this.refreshTokens.get(token);
        if (!session || !this.active.has(session))
          return this.respond(response, 400, {});
        this.refreshTokens.delete(token);
        await this.pause("refresh");
        return this.respond(response, 200, this.tokens(session));
      }
      return this.respond(response, 400, {});
    }
    const token = request.headers.authorization?.replace(/^Bearer /, "") ?? "";
    const session = this.accessTokens.get(token);
    if (!session || !this.active.has(session))
      return this.respond(response, 401, {});
    if (request.method === "GET" && request.url === "/api/v1/auth/me") {
      this.verifications.push(token);
      await this.pause("verify");
      return this.respond(response, 200, identity);
    }
    if (
      request.method === "POST" &&
      request.url === "/auth/v1/logout?scope=local"
    ) {
      this.revocations.push(token);
      this.active.delete(session);
      return this.respond(response, 200, {});
    }
    this.respond(response, 404, {});
  }
}

describe.skipIf(!["darwin", "linux"].includes(process.platform))(
  "persistent native public consumer",
  () => {
    let root: string;
    let home: string;
    let issuer: Issuer;
    const consumers: Consumer[] = [];

    beforeAll(async () => {
      root = await realpath(
        await mkdtemp(path.join(os.tmpdir(), "grida-auth-consumer-"))
      );
      await chmod(root, 0o700);
      const exported = path.join(root, "node_modules/@grida/auth");
      await mkdir(exported, { recursive: true, mode: 0o700 });
      // Build the actual public package every run; stale workspace dist cannot
      // make this proof pass. No source imports or native addons reach consumers.
      await execute(
        path.join(packageRoot, "node_modules/.bin/tsdown"),
        ["--out-dir", path.join(exported, "dist"), "--logLevel", "silent"],
        {
          cwd: packageRoot,
          env: {
            HOME: root,
            PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
            CI: "1",
          },
          timeout: 30_000,
          maxBuffer: 1_048_576,
        }
      );
      await copyFile(
        path.join(packageRoot, "package.json"),
        path.join(exported, "package.json")
      );
      await writeFile(path.join(root, "consumer.mjs"), workerSource, {
        mode: 0o600,
      });
    }, 40_000);

    beforeEach(async () => {
      home = path.join(root, randomUUID());
      issuer = new Issuer();
      await issuer.start();
    });

    afterEach(async () => {
      await Promise.all(
        consumers.splice(0).map((consumer) => consumer.close())
      );
      await issuer.close();
    });

    afterAll(async () => {
      if (root) await rm(root, { recursive: true, force: true });
    });

    async function consumer() {
      const value = new Consumer(root, issuer.config, home);
      consumers.push(value);
      const ready = await value.wait("ready");
      expect(ready.nativeAddonAbsent).toBe(true);
      expect(ready.storage?.backend).toBe("file");
      return value;
    }

    async function login() {
      const value = await consumer();
      const result = value.run("login");
      await issuer.approve((await value.wait("browser")).url!);
      expect(await result).toMatchObject({
        ok: true,
        result: { state: "signed-in", identity },
      });
      await value.close();
    }

    it("logs in and reports safe local status after process restart without the optional native addon", async () => {
      await login();
      const requestCount = issuer.verifications.length;
      const value = await consumer();
      const result = await value.run("status");
      expect(result).toMatchObject({
        ok: true,
        result: { state: "signed-in", identity },
      });
      expect(JSON.stringify(result)).not.toMatch(
        /synthetic-access|synthetic-refresh|code_verifier/
      );
      expect(issuer.verifications).toHaveLength(requestCount);
    }, 20_000);

    it("serializes refresh across real processes and exchanges each current rotated token once", async () => {
      await login();
      const [first, second] = await Promise.all([consumer(), consumer()]);
      const gate = issuer.hold("refresh");
      const a = first.run("refresh");
      await gate.entered.promise;
      const b = second.run("refresh");
      await second.wait("started");
      await delay(100);
      expect(issuer.refreshes).toHaveLength(1);
      gate.release.resolve();
      expect(await a).toMatchObject({ ok: true });
      expect(await b).toMatchObject({ ok: true });
      expect(issuer.refreshes).toEqual([
        "synthetic-refresh-1-1",
        "synthetic-refresh-1-2",
      ]);
      const restarted = await consumer();
      expect(await restarted.run("verify")).toMatchObject({ ok: true });
      expect(issuer.verifications.at(-1)).toBe("synthetic-access-1-3");
    }, 20_000);

    it("keeps verification writes from overwriting a concurrent process rotation", async () => {
      await login();
      const [verifier, refresher] = await Promise.all([consumer(), consumer()]);
      const gate = issuer.hold("verify");
      const a = verifier.run("verify");
      await gate.entered.promise;
      const b = refresher.run("refresh");
      await refresher.wait("started");
      await delay(100);
      expect(issuer.refreshes).toHaveLength(0);
      gate.release.resolve();
      expect(await a).toMatchObject({ ok: true });
      expect(await b).toMatchObject({ ok: true });
      const restarted = await consumer();
      expect(await restarted.run("verify")).toMatchObject({ ok: true });
      expect(issuer.verifications.at(-1)).toBe("synthetic-access-1-2");
    }, 20_000);

    it("persists logout invalidation against an earlier browser login in another process", async () => {
      await login();
      const pending = await consumer();
      const loginResult = pending.run("login");
      const authorization = (await pending.wait("browser")).url!;
      const signingOut = await consumer();
      expect(await signingOut.run("logout")).toMatchObject({
        ok: true,
        result: { state: "signed-out", revocation: "confirmed" },
      });
      expect(issuer.revocations).toHaveLength(1);
      await issuer.approve(authorization);
      expect(await loginResult).toMatchObject({
        ok: false,
        code: "session_changed",
      });
      const restarted = await consumer();
      expect(await restarted.run("status")).toMatchObject({
        ok: true,
        result: { state: "signed-out" },
      });
    }, 20_000);
  }
);
