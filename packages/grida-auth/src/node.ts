// GRIDA-SEC-010 — fixed loopback ceremony and destination-bound native transport.
// GRIDA-SEC-006 / GRIDA-GG: token — scoped grants stay with the explicit memory sink.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { AuthClient } from "./auth-client";
import { CredentialStore } from "./credential-store";

// GRIDA-SEC-014 — shared writer exclusion, independent of account lifecycle.
export { CredentialLock } from "./credential-lock";

/** Native adapter; credentials and browser launch remain explicit host capabilities. */
export function createNativeAuth(
  config: AuthClient.Config,
  options: {
    custody: AuthClient.Custody | AuthClient.CoordinatedCustody;
    openBrowser(url: string): Promise<void>;
    gg?: AuthClient.GgSink;
  }
): AuthClient {
  return new AuthClient(config, {
    custody: options.custody,
    openBrowser: options.openBrowser,
    get gg() {
      return options.gg;
    },
    now: Date.now,
    async pkce() {
      const verifier = randomBytes(32).toString("base64url");
      return {
        verifier,
        state: randomBytes(32).toString("base64url"),
        challenge: createHash("sha256").update(verifier).digest("base64url"),
      };
    },
    listen: Loopback.listen,
    request: nativeRequest,
  });
}

/**
 * Durable native login for a trusted host configuration. OS keyring is the
 * initial default; an explicitly selected file backend persists for this profile.
 * Storage controls expose no credentials. No Desktop/daemon process is needed.
 */
export async function createPersistentNativeAuth(
  config: AuthClient.Config,
  options: {
    openBrowser(url: string): Promise<void>;
    storage?: "keyring" | "file";
    /** Trusted process configuration only; never read this from a repository. */
    home?: string;
    gg?: AuthClient.GgSink;
  }
): Promise<{
  client: AuthClient;
  storage: {
    info(): Promise<CredentialStore.Info>;
    migrate(backend: "keyring" | "file"): Promise<CredentialStore.Info>;
  };
}> {
  let store: CredentialStore;
  // Validate and freeze the registration before any filesystem/keyring access.
  const client = createNativeAuth(config, {
    custody: { exclusive: (operation) => store.exclusive(operation) },
    openBrowser: options.openBrowser,
    get gg() {
      return options.gg;
    },
  });
  store = await CredentialStore.open(client.config, options);
  return {
    client,
    storage: Object.freeze({
      info: () => store.info(),
      migrate: (backend: "keyring" | "file") => store.migrate(backend),
    }),
  };
}

/** Fixed registered ports only. No browser opening or credential handling. */
class Loopback {
  static async listen(
    redirectUris: readonly string[],
    state: string
  ): Promise<AuthClient.Listener> {
    for (const redirectUri of redirectUris) {
      const listener = new Loopback(redirectUri, state);
      try {
        await listener.bind();
        return listener;
      } catch {
        await listener.close();
      }
    }
    throw new AuthClient.Failure("callback_unavailable");
  }

  readonly result: Promise<AuthClient.Callback>;
  private resolve!: (callback: AuthClient.Callback) => void;
  private reject!: (error: AuthClient.Failure) => void;
  private claimed = false;
  private settled = false;
  private server: Server;
  private sockets = new Set<Socket>();
  private timer?: ReturnType<typeof setTimeout>;
  private closing: Promise<void> | undefined;

  constructor(
    readonly redirectUri: string,
    private readonly state: string
  ) {
    const target = new URL(redirectUri);
    this.result = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    // Binding may fail before the caller receives this object.
    void this.result.catch(() => undefined);
    this.server = createServer({ maxHeaderSize: 8192 }, (request, response) => {
      const raw = request.url ?? "";
      if (
        this.claimed ||
        this.settled ||
        request.method !== "GET" ||
        request.headers.host !== target.host ||
        request.headers.origin !== undefined ||
        raw.length > 8192 ||
        raw.split("?")[0] !== target.pathname ||
        raw.includes("#")
      ) {
        return reply(response, 400, "Invalid authorization callback.");
      }
      const url = new URL(raw, target.origin);
      const params = url.searchParams;
      const allowed = new Set([
        "state",
        "code",
        "error",
        "error_description",
        "error_uri",
        "iss",
      ]);
      if (
        [...params.keys()].some(
          (key) => !allowed.has(key) || params.getAll(key).length !== 1
        )
      )
        return reply(response, 400, "Invalid authorization callback.");
      const returnedState = params.get("state") ?? "";
      const expected = Buffer.from(this.state);
      const actual = Buffer.from(returnedState);
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        return reply(response, 400, "Invalid authorization state.");
      const code = params.get("code");
      const error = params.get("error");
      if (
        !!code === !!error ||
        (code !== null && !/^[^\s]{1,4096}$/.test(code)) ||
        (error !== null && !/^[a-z_]{1,128}$/.test(error))
      )
        return reply(response, 400, "Invalid authorization callback.");
      this.claimed = true;
      clearTimeout(this.timer);
      const callback: AuthClient.Callback = {
        state: returnedState,
        ...(code ? { code } : { error: error! }),
        ...(params.has("iss") ? { issuer: params.get("iss")! } : {}),
      };
      // Claim once, but do not expose a terminal callback while its HTTP reply
      // is still buffered. In particular, denial immediately closes the native
      // ceremony and would otherwise abort the browser's callback navigation.
      const complete = () => {
        clearTimeout(this.timer);
        response.removeListener("finish", complete);
        response.removeListener("close", complete);
        if (!this.settled) {
          this.settled = true;
          this.resolve(callback);
        }
        void this.close();
      };
      response.once("finish", complete);
      response.once("close", complete);
      this.timer = setTimeout(() => {
        response.destroy();
        complete();
      }, 1000);
      // Receipt only: account success still requires exchange, identity, and custody.
      reply(
        response,
        200,
        "Authorization received. Return to the application to see the result."
      );
    });
    this.server.headersTimeout = 5000;
    this.server.requestTimeout = 5000;
    this.server.keepAliveTimeout = 1;
    this.server.on("connection", (socket) => {
      this.sockets.add(socket);
      socket.setTimeout(5000, () => socket.destroy());
      socket.once("close", () => this.sockets.delete(socket));
    });
    this.server.on("clientError", (_error, socket) => socket.destroy());
    this.server.on("error", () => {
      if (this.server.listening) this.fail("callback_unavailable");
    });
  }

  private bind(): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = () =>
        reject(new AuthClient.Failure("callback_unavailable"));
      this.server.once("error", onError);
      this.server.listen(
        {
          host: "127.0.0.1",
          port: Number(new URL(this.redirectUri).port),
          exclusive: true,
        },
        () => {
          this.server.removeListener("error", onError);
          this.timer = setTimeout(() => this.fail("callback_timeout"), 120_000);
          resolve();
        }
      );
    });
  }

  cancel(reason: "cancelled" | "browser_failed") {
    this.fail(reason);
  }

  close(): Promise<void> {
    if (this.closing) return this.closing;
    clearTimeout(this.timer);
    if (!this.settled) {
      this.settled = true;
      this.reject(new AuthClient.Failure("cancelled"));
    }
    this.closing = new Promise((resolve) => {
      // Let HTTP finish the accepted response and close its socket normally.
      // Incomplete requests/idle connections cannot keep the process alive.
      const deadline = setTimeout(() => {
        for (const socket of this.sockets) socket.destroy();
      }, 1000);
      this.server.close(() => {
        clearTimeout(deadline);
        resolve();
      });
    });
    return this.closing;
  }

  private fail(code: AuthClient.FailureCode) {
    if (this.settled) return;
    this.settled = true;
    this.reject(new AuthClient.Failure(code));
    void this.close();
  }
}

function reply(response: ServerResponse, status: number, message: string) {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
    connection: "close",
  });
  response.end(message);
}

function nativeRequest(
  request: AuthClient.Request
): AuthClient.RequestOperation {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const result = (async (): Promise<AuthClient.Response> => {
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: { accept: "application/json", ...request.headers },
        ...(request.body === undefined ? {} : { body: request.body }),
        redirect: "manual",
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      if (response.status < 200 || response.status >= 300) {
        await response.body?.cancel();
        return { status: response.status, body: null };
      }
      if (response.status === 204) {
        await response.body?.cancel();
        return { status: 204, body: null };
      }
      const reader = response.body?.getReader();
      if (!reader) throw new AuthClient.Failure("invalid_response");
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          length += chunk.value.byteLength;
          if (length > 65_536) throw new AuthClient.Failure("invalid_response");
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      try {
        return {
          status: response.status,
          body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown,
        };
      } catch {
        throw new AuthClient.Failure("invalid_response");
      }
    } catch (error) {
      throw error instanceof AuthClient.Failure
        ? error
        : new AuthClient.Failure("unavailable");
    } finally {
      clearTimeout(timer);
    }
  })();
  return { result, cancel: () => controller.abort() };
}
