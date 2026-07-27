/**
 * GRIDA-SEC-008 — main-owned OAuth loopback callback boundary.
 *
 * The authorization code and state arrive through a world-reachable local
 * HTTP endpoint. This module binds only the IPv4/IPv6 loopback interfaces,
 * accepts one bounded callback for one active attempt, and does not render a
 * success page until the caller's completion step has finished.
 */
import crypto from "node:crypto";
import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { Socket } from "node:net";

const IPV4_LOOPBACK = "127.0.0.1";
const IPV6_LOOPBACK = "::1";
const REDIRECT_HOST = "localhost";
// Keep the native listener's lifetime aligned with the sidecar's one-shot
// OAuth attempt TTL. A shorter host timeout would leave an unreachable
// credential-owner attempt pending after browser login or MFA took longer.
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1_000;
const MAX_PORTS = 4;
const MAX_REQUEST_TARGET_BYTES = 8 * 1_024;
const MAX_QUERY_PARAMETERS = 12;
const MAX_QUERY_NAME_BYTES = 128;
const MAX_QUERY_VALUE_BYTES = 4 * 1_024;
const MAX_STATE_BYTES = 512;
const MAX_CODE_BYTES = 4 * 1_024;
const MAX_ERROR_BYTES = 256;
const MAX_ERROR_DESCRIPTION_BYTES = 1_024;
const MAX_CONNECTIONS = 8;
const HEADER_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 5_000;
const RESPONSE_TIMEOUT_MS = 2_000;

// The callback cannot depend on package or network assets after its one-shot
// listener closes. Keep this geometry aligned with OpenAILogo from
// @grida/react-icons/logos.
const OPENAI_LOGO_PATH =
  "m297.06 130.97c7.26-21.79 4.76-45.66-6.85-65.48-17.46-30.4-52.56-46.04-86.84-38.68-15.25-17.18-37.16-26.95-60.13-26.81-35.04-.08-66.13 22.48-76.91 55.82-22.51 4.61-41.94 18.7-53.31 38.67-17.59 30.32-13.58 68.54 9.92 94.54-7.26 21.79-4.76 45.66 6.85 65.48 17.46 30.4 52.56 46.04 86.84 38.68 15.24 17.18 37.16 26.95 60.13 26.8 35.06.09 66.16-22.49 76.94-55.86 22.51-4.61 41.94-18.7 53.31-38.67 17.57-30.32 13.55-68.51-9.94-94.51zm-120.28 168.11c-14.03.02-27.62-4.89-38.39-13.88.49-.26 1.34-.73 1.89-1.07l63.72-36.8c3.26-1.85 5.26-5.32 5.24-9.07v-89.83l26.93 15.55c.29.14.48.42.52.74v74.39c-.04 33.08-26.83 59.9-59.91 59.97zm-128.84-55.03c-7.03-12.14-9.56-26.37-7.15-40.18.47.28 1.3.79 1.89 1.13l63.72 36.8c3.23 1.89 7.23 1.89 10.47 0l77.79-44.92v31.1c.02.32-.13.63-.38.83l-64.41 37.19c-28.69 16.52-65.33 6.7-81.92-21.95zm-16.77-139.09c7-12.16 18.05-21.46 31.21-26.29 0 .55-.03 1.52-.03 2.2v73.61c-.02 3.74 1.98 7.21 5.23 9.06l77.79 44.91-26.93 15.55c-.27.18-.61.21-.91.08l-64.42-37.22c-28.63-16.58-38.45-53.21-21.95-81.89zm221.26 51.49-77.79-44.92 26.93-15.54c.27-.18.61-.21.91-.08l64.42 37.19c28.68 16.57 38.51 53.26 21.94 81.94-7.01 12.14-18.05 21.44-31.2 26.28v-75.81c.03-3.74-1.96-7.2-5.2-9.06zm26.8-40.34c-.47-.29-1.3-.79-1.89-1.13l-63.72-36.8c-3.23-1.89-7.23-1.89-10.47 0l-77.79 44.92v-31.1c-.02-.32.13-.63.38-.83l64.41-37.16c28.69-16.55 65.37-6.7 81.91 22 6.99 12.12 9.52 26.31 7.15 40.1zm-168.51 55.43-26.94-15.55c-.29-.14-.48-.42-.52-.74v-74.39c.02-33.12 26.89-59.96 60.01-59.94 14.01 0 27.57 4.92 38.34 13.88-.49.26-1.33.73-1.89 1.07l-63.72 36.8c-3.26 1.85-5.26 5.31-5.24 9.06l-.04 89.79zm14.63-31.54 34.65-20.01 34.65 20v40.01l-34.65 20-34.65-20z";

const CALLBACK_PAGE_STYLES = `
:root {
  color-scheme: light dark;
  --canvas: #f7f7f8;
  --card: rgb(255 255 255 / 96%);
  --foreground: #18181b;
  --muted-foreground: #71717a;
  --border: #e4e4e7;
  --shadow: 0 1px 2px rgb(0 0 0 / 4%), 0 16px 40px rgb(0 0 0 / 8%);
}

* {
  box-sizing: border-box;
}

html,
body {
  min-width: 320px;
  min-height: 100%;
  margin: 0;
}

body {
  min-height: 100vh;
  color: var(--foreground);
  background:
    radial-gradient(circle at 50% 0%, rgb(255 255 255 / 95%), transparent 48%),
    var(--canvas);
  font-family:
    ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

.page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px;
}

.card {
  width: min(100%, 400px);
  padding: 32px;
  overflow: hidden;
  text-align: center;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: var(--shadow);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: var(--foreground);
  font-size: 14px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.brand-logo {
  width: 24px;
  height: 24px;
}

.provider-mark {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  margin: 28px auto 20px;
  color: var(--foreground);
  background: var(--canvas);
  border: 1px solid var(--border);
  border-radius: 999px;
}

.provider-mark svg {
  width: 25px;
  height: 25px;
}

h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
  line-height: 1.25;
  letter-spacing: -0.025em;
}

p {
  max-width: 300px;
  margin: 8px auto 0;
  color: var(--muted-foreground);
  font-size: 15px;
  line-height: 1.55;
}

@media (max-width: 480px) {
  .page {
    padding: 16px;
  }

  .card {
    padding: 28px 22px;
    border-radius: 14px;
  }
}

@media (prefers-color-scheme: dark) {
  :root {
    --canvas: #18181b;
    --card: rgb(39 39 42 / 96%);
    --foreground: #fafafa;
    --muted-foreground: #a1a1aa;
    --border: rgb(255 255 255 / 10%);
    --shadow: 0 1px 2px rgb(0 0 0 / 18%), 0 18px 48px rgb(0 0 0 / 28%);
  }

  body {
    background:
      radial-gradient(circle at 50% 0%, rgb(63 63 70 / 55%), transparent 48%),
      var(--canvas);
  }
}
`.trim();

const CALLBACK_PAGE_STYLE_HASH = crypto
  .createHash("sha256")
  .update(CALLBACK_PAGE_STYLES, "utf8")
  .digest("base64");

type CompletionOutcome =
  | Readonly<{
      ok: true;
      result: OAuthLoopbackCallback.Result;
    }>
  | Readonly<{
      ok: false;
      error: Error;
    }>;

type CallbackParameters = Readonly<{
  state: string;
  code: string | null;
  error: string | null;
  error_description: string | null;
}>;

type ActiveAttempt = {
  readonly servers: readonly Server[];
  readonly sockets: Set<Socket>;
  readonly port: number;
  readonly redirect_uri: string;
  readonly loopback_hosts: readonly string[];
  readonly abort_controller: AbortController;
  readonly result: Promise<OAuthLoopbackCallback.Result>;
  readonly resolve: (result: OAuthLoopbackCallback.Result) => void;
  readonly reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  completion: OAuthLoopbackCallback.Activation["complete"] | null;
  expected_state_digest: Buffer | null;
  claimed: boolean;
  terminal: boolean;
  settled: boolean;
  response: ServerResponse | null;
  outcome: CompletionOutcome | null;
};

/**
 * Owns exactly one fixed-port OAuth loopback attempt at a time.
 *
 * `start()` deliberately has two phases. It binds first and returns the exact
 * redirect URI. The caller can then ask its credential owner to create PKCE
 * state for that URI and arm the listener with `activate()` before opening the
 * system browser.
 */
export class OAuthLoopbackCallback {
  private readonly ports: readonly number[];
  private readonly path: string;
  private readonly timeoutMs: number;
  private active: ActiveAttempt | null = null;
  private starting = false;
  private closed = false;

  constructor(configuration: OAuthLoopbackCallback.Configuration) {
    this.ports = validatePorts(configuration.ports);
    this.path = validatePath(configuration.path);
    this.timeoutMs = validateTimeout(configuration.timeout_ms);
  }

  async start(): Promise<OAuthLoopbackCallback.Attempt> {
    if (this.closed) {
      throw callbackError("OAuth loopback callback host is closed");
    }
    if (this.starting || this.active) {
      throw callbackError(
        "An OAuth loopback callback attempt is already active"
      );
    }

    this.starting = true;
    try {
      const binding = await this.bind();
      if (this.closed) {
        closeServers(binding.servers);
        destroySockets(binding.sockets);
        throw callbackError(
          "OAuth loopback callback host closed while starting"
        );
      }

      let resolve!: (result: OAuthLoopbackCallback.Result) => void;
      let reject!: (error: Error) => void;
      const result = new Promise<OAuthLoopbackCallback.Result>(
        (resolveResult, rejectResult) => {
          resolve = resolveResult;
          reject = rejectResult;
        }
      );
      // A caller normally awaits `result` only after opening the browser. Mark
      // an early timeout/cancel rejection handled without changing the promise
      // returned to that caller.
      void result.catch(() => undefined);

      const attempt: ActiveAttempt = {
        ...binding,
        abort_controller: new AbortController(),
        result,
        resolve,
        reject,
        timer: undefined as unknown as ReturnType<typeof setTimeout>,
        completion: null,
        expected_state_digest: null,
        claimed: false,
        terminal: false,
        settled: false,
        response: null,
        outcome: null,
      };
      attempt.timer = setTimeout(
        () =>
          this.terminate(
            attempt,
            {
              ok: false,
              error: callbackError("OAuth loopback callback timed out"),
            },
            408,
            "Sign-in timed out",
            "Return to Grida and start sign-in again."
          ),
        this.timeoutMs
      );
      attempt.timer.unref?.();
      this.active = attempt;

      return Object.freeze({
        port: attempt.port,
        redirect_uri: attempt.redirect_uri,
        loopback_hosts: attempt.loopback_hosts,
        activate: (activation: OAuthLoopbackCallback.Activation) =>
          this.activate(attempt, activation),
        cancel: () => this.cancelAttempt(attempt),
        result,
      });
    } finally {
      this.starting = false;
    }
  }

  cancel(): void {
    if (this.active) this.cancelAttempt(this.active);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (!this.active) return;
    if (this.active.terminal) {
      this.finalize(this.active);
    } else {
      this.cancelAttempt(this.active);
    }
  }

  private async bind(): Promise<
    Pick<
      ActiveAttempt,
      "servers" | "sockets" | "port" | "redirect_uri" | "loopback_hosts"
    >
  > {
    let lastError: Error | undefined;
    for (const port of this.ports) {
      const sockets = new Set<Socket>();
      const servers: Server[] = [];
      try {
        const ipv4 = await this.bindServer(port, IPV4_LOOPBACK, sockets);
        servers.push(ipv4);
        const loopbackHosts = [IPV4_LOOPBACK];
        try {
          const ipv6 = await this.bindServer(port, IPV6_LOOPBACK, sockets);
          servers.push(ipv6);
          loopbackHosts.push(IPV6_LOOPBACK);
        } catch (error) {
          if (!isIpv6Unavailable(error)) throw error;
        }
        return {
          servers,
          sockets,
          port,
          redirect_uri: `http://${REDIRECT_HOST}:${port}${this.path}`,
          loopback_hosts: Object.freeze(loopbackHosts),
        };
      } catch (error) {
        lastError = asError(error);
        await closeServersAsync(servers);
        destroySockets(sockets);
      }
    }
    throw callbackError(
      "The approved OAuth loopback callback ports are unavailable",
      lastError
    );
  }

  private bindServer(
    port: number,
    host: string,
    sockets: Set<Socket>
  ): Promise<Server> {
    const server = http.createServer(
      { maxHeaderSize: MAX_REQUEST_TARGET_BYTES },
      (request, response) => this.handleRequest(port, request, response)
    );
    server.maxConnections = MAX_CONNECTIONS;
    server.maxRequestsPerSocket = 2;
    server.headersTimeout = HEADER_TIMEOUT_MS;
    server.requestTimeout = REQUEST_TIMEOUT_MS;
    server.keepAliveTimeout = 1;
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    server.on("clientError", (_error, socket) => {
      if (!socket.destroyed) {
        socket.end(
          "HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"
        );
      }
    });

    return new Promise<Server>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        server.on("error", (error) => this.handleServerError(server, error));
        resolve(server);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      try {
        server.listen({ host, port, exclusive: true });
      } catch (error) {
        server.off("error", onError);
        server.off("listening", onListening);
        reject(asError(error));
      }
    });
  }

  private activate(
    attempt: ActiveAttempt,
    activation: OAuthLoopbackCallback.Activation
  ): void {
    if (this.active !== attempt || attempt.terminal) {
      throw callbackError(
        "OAuth loopback callback attempt is no longer active"
      );
    }
    if (attempt.completion) {
      throw callbackError(
        "OAuth loopback callback attempt is already activated"
      );
    }
    validateExpectedState(activation.state);
    if (typeof activation.complete !== "function") {
      throw callbackError("OAuth loopback callback completion is invalid");
    }
    attempt.expected_state_digest = stateDigest(activation.state);
    attempt.completion = activation.complete;
  }

  private handleRequest(
    port: number,
    request: IncomingMessage,
    response: ServerResponse
  ): void {
    const attempt = this.active;
    if (!attempt || attempt.port !== port || attempt.terminal) {
      sendPage(
        response,
        410,
        "Sign-in is no longer active",
        "Return to Grida and start sign-in again."
      );
      return;
    }
    if (!isLoopbackAddress(request.socket.remoteAddress)) {
      sendPage(
        response,
        403,
        "Sign-in response refused",
        "This callback did not arrive through the local computer."
      );
      return;
    }
    if (
      typeof request.headers.host !== "string" ||
      request.headers.host.toLowerCase() !== `${REDIRECT_HOST}:${port}`
    ) {
      sendPage(
        response,
        400,
        "Invalid sign-in response",
        "Return to Grida and try again."
      );
      return;
    }
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      sendPage(
        response,
        405,
        "Invalid sign-in response",
        "Only the expected browser callback is accepted."
      );
      return;
    }
    if (
      request.headers["transfer-encoding"] !== undefined ||
      (request.headers["content-length"] !== undefined &&
        request.headers["content-length"] !== "0")
    ) {
      sendPage(
        response,
        400,
        "Invalid sign-in response",
        "The browser callback must not contain a request body."
      );
      return;
    }

    const rawTarget = request.url;
    if (
      typeof rawTarget !== "string" ||
      !rawTarget.startsWith("/") ||
      rawTarget.startsWith("//") ||
      Buffer.byteLength(rawTarget) > MAX_REQUEST_TARGET_BYTES
    ) {
      sendPage(
        response,
        414,
        "Invalid sign-in response",
        "The browser callback URL is not accepted."
      );
      return;
    }

    let url: URL;
    try {
      url = new URL(rawTarget, attempt.redirect_uri);
    } catch {
      sendPage(
        response,
        400,
        "Invalid sign-in response",
        "The browser callback URL is not accepted."
      );
      return;
    }
    if (url.origin !== new URL(attempt.redirect_uri).origin) {
      sendPage(
        response,
        400,
        "Invalid sign-in response",
        "The browser callback origin is not accepted."
      );
      return;
    }
    if (url.pathname !== this.path) {
      sendPage(
        response,
        404,
        "Sign-in callback not found",
        "Return to Grida and start sign-in again."
      );
      return;
    }
    if (attempt.claimed) {
      sendPage(
        response,
        409,
        "Sign-in response already used",
        "Return to Grida to continue."
      );
      return;
    }
    if (!attempt.completion || !attempt.expected_state_digest) {
      sendPage(
        response,
        425,
        "Sign-in is not ready",
        "Return to Grida and start sign-in again."
      );
      return;
    }

    const parameters = parseCallbackParameters(url.searchParams);
    if (
      !parameters ||
      !stateMatches(parameters.state, attempt.expected_state_digest)
    ) {
      // A forged or stale callback must not consume the real browser's one
      // chance to complete the active attempt.
      sendPage(
        response,
        400,
        "Invalid sign-in response",
        "Return to Grida and try again."
      );
      return;
    }

    // JavaScript runs this assignment synchronously before any async
    // completion work. Exactly one state-valid callback can cross this line.
    attempt.claimed = true;
    attempt.response = response;
    stopAccepting(attempt, request.socket);

    if (parameters.error || !parameters.code || parameters.error_description) {
      this.terminate(
        attempt,
        {
          ok: false,
          error: callbackError(
            parameters.error
              ? "OAuth authorization was not granted"
              : "OAuth callback did not contain an authorization code"
          ),
        },
        400,
        "Sign-in was not completed",
        "Return to Grida and try again."
      );
      return;
    }

    const result = Object.freeze({
      code: parameters.code,
      state: parameters.state,
      redirect_uri: attempt.redirect_uri,
    });
    const callback = Object.freeze({
      ...result,
      signal: attempt.abort_controller.signal,
    });
    void this.complete(attempt, callback, result);
  }

  private async complete(
    attempt: ActiveAttempt,
    callback: OAuthLoopbackCallback.Callback,
    result: OAuthLoopbackCallback.Result
  ): Promise<void> {
    try {
      await attempt.completion!(callback);
    } catch (error) {
      if (attempt.terminal) return;
      this.terminate(
        attempt,
        {
          ok: false,
          error: callbackError(
            "OAuth callback completion failed",
            asError(error)
          ),
        },
        502,
        "Sign-in could not be completed",
        "Return to Grida and try again."
      );
      return;
    }
    if (attempt.terminal) return;
    this.terminate(
      attempt,
      { ok: true, result },
      200,
      "Signed in with ChatGPT",
      "You can close this tab and return to Grida."
    );
  }

  private cancelAttempt(attempt: ActiveAttempt): void {
    if (this.active !== attempt || attempt.terminal) return;
    this.terminate(
      attempt,
      {
        ok: false,
        error: callbackError("OAuth loopback callback was cancelled"),
      },
      409,
      "Sign-in was cancelled",
      "Return to Grida when you are ready to try again."
    );
  }

  private handleServerError(server: Server, error: Error): void {
    const attempt = this.active;
    if (!attempt || attempt.terminal || !attempt.servers.includes(server)) {
      return;
    }
    this.terminate(
      attempt,
      {
        ok: false,
        error: callbackError("OAuth loopback callback listener failed", error),
      },
      500,
      "Sign-in could not be completed",
      "Return to Grida and try again."
    );
  }

  private terminate(
    attempt: ActiveAttempt,
    outcome: CompletionOutcome,
    status: number,
    title: string,
    message: string
  ): void {
    if (this.active !== attempt || attempt.terminal) return;
    attempt.terminal = true;
    attempt.outcome = outcome;
    clearTimeout(attempt.timer);
    if (!outcome.ok) attempt.abort_controller.abort(outcome.error);
    stopAccepting(attempt, attempt.response?.socket ?? null);

    if (!attempt.response || attempt.response.destroyed) {
      this.finalize(attempt);
      return;
    }
    void sendPage(attempt.response, status, title, message).finally(() =>
      this.finalize(attempt)
    );
  }

  private finalize(attempt: ActiveAttempt): void {
    if (attempt.settled) return;
    attempt.settled = true;
    clearTimeout(attempt.timer);
    closeServers(attempt.servers);
    destroySockets(attempt.sockets);
    if (this.active === attempt) this.active = null;
    const outcome = attempt.outcome;
    if (!outcome) {
      attempt.reject(
        callbackError("OAuth loopback callback ended without an outcome")
      );
    } else if (outcome.ok) {
      attempt.resolve(outcome.result);
    } else {
      attempt.reject(outcome.error);
    }
  }
}

export namespace OAuthLoopbackCallback {
  export type Configuration = Readonly<{
    ports: readonly [number, ...number[]];
    path: string;
    timeout_ms?: number;
  }>;

  export type Callback = Readonly<{
    code: string;
    state: string;
    redirect_uri: string;
    signal: AbortSignal;
  }>;

  export type Result = Readonly<{
    code: string;
    state: string;
    redirect_uri: string;
  }>;

  export type Activation = Readonly<{
    state: string;
    complete: (callback: Callback) => Promise<void>;
  }>;

  export type Attempt = Readonly<{
    port: number;
    redirect_uri: string;
    loopback_hosts: readonly string[];
    activate: (activation: Activation) => void;
    cancel: () => void;
    result: Promise<Result>;
  }>;
}

function validatePorts(
  ports: readonly [number, ...number[]]
): readonly number[] {
  if (
    !Array.isArray(ports) ||
    ports.length === 0 ||
    ports.length > MAX_PORTS ||
    ports.some(
      (port) => !Number.isSafeInteger(port) || port < 1_024 || port > 65_535
    ) ||
    new Set(ports).size !== ports.length
  ) {
    throw callbackError("OAuth loopback callback ports are invalid");
  }
  return Object.freeze([...ports]);
}

function validatePath(path: string): string {
  if (
    typeof path !== "string" ||
    !/^\/[A-Za-z0-9/_-]{1,127}$/.test(path) ||
    path.includes("//")
  ) {
    throw callbackError("OAuth loopback callback path is invalid");
  }
  return path;
}

function validateTimeout(timeoutMs: number | undefined): number {
  const value = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(value) || value < 1 || value > DEFAULT_TIMEOUT_MS) {
    throw callbackError("OAuth loopback callback timeout is invalid");
  }
  return value;
}

function validateExpectedState(state: string): void {
  if (
    typeof state !== "string" ||
    !/^[A-Za-z0-9._~-]{16,512}$/.test(state) ||
    Buffer.byteLength(state) > MAX_STATE_BYTES
  ) {
    throw callbackError("OAuth loopback callback state is invalid");
  }
}

function parseCallbackParameters(
  searchParameters: URLSearchParams
): CallbackParameters | null {
  let count = 0;
  const values = new Map<string, string>();
  for (const [name, value] of searchParameters) {
    count += 1;
    if (
      count > MAX_QUERY_PARAMETERS ||
      Buffer.byteLength(name) > MAX_QUERY_NAME_BYTES ||
      Buffer.byteLength(value) > MAX_QUERY_VALUE_BYTES
    ) {
      return null;
    }
    if (
      (name === "state" ||
        name === "code" ||
        name === "error" ||
        name === "error_description") &&
      values.has(name)
    ) {
      return null;
    }
    values.set(name, value);
  }

  const state = values.get("state");
  if (!state || Buffer.byteLength(state) > MAX_STATE_BYTES) return null;
  const code = nonEmpty(values.get("code"));
  const error = nonEmpty(values.get("error"));
  const errorDescription = nonEmpty(values.get("error_description"));
  if (
    (code !== null && Buffer.byteLength(code) > MAX_CODE_BYTES) ||
    (error !== null && Buffer.byteLength(error) > MAX_ERROR_BYTES) ||
    (errorDescription !== null &&
      Buffer.byteLength(errorDescription) > MAX_ERROR_DESCRIPTION_BYTES) ||
    (code !== null && error !== null)
  ) {
    return null;
  }
  return {
    state,
    code,
    error,
    error_description: errorDescription,
  };
}

function nonEmpty(value: string | undefined): string | null {
  return value === undefined || value.length === 0 ? null : value;
}

function stateDigest(state: string): Buffer {
  return crypto.createHash("sha256").update(state, "utf8").digest();
}

function stateMatches(state: string, expectedDigest: Buffer): boolean {
  return crypto.timingSafeEqual(stateDigest(state), expectedDigest);
}

function isLoopbackAddress(address: string | undefined): boolean {
  return (
    address === IPV4_LOOPBACK ||
    address === IPV6_LOOPBACK ||
    address === "::ffff:127.0.0.1"
  );
}

function isIpv6Unavailable(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "EAFNOSUPPORT" || code === "EADDRNOTAVAIL";
}

function stopAccepting(
  attempt: ActiveAttempt,
  preservedSocket: Socket | null
): void {
  closeServers(attempt.servers);
  for (const socket of attempt.sockets) {
    if (socket !== preservedSocket) socket.destroy();
  }
}

function closeServers(servers: readonly Server[]): void {
  for (const server of servers) {
    try {
      server.close();
    } catch {
      // A terminal path owns the observable result. A listener already closed
      // by another terminal edge has no additional failure to surface.
    }
  }
}

async function closeServersAsync(servers: readonly Server[]): Promise<void> {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          try {
            server.close(() => resolve());
          } catch {
            resolve();
          }
        })
    )
  );
}

function destroySockets(sockets: Set<Socket>): void {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
}

function sendPage(
  response: ServerResponse,
  status: number,
  title: string,
  message: string
): Promise<void> {
  if (response.destroyed || response.writableEnded) return Promise.resolve();
  const body = renderPage(status, title, message);
  response.statusCode = status;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader(
    "Content-Security-Policy",
    `default-src 'none'; style-src 'sha256-${CALLBACK_PAGE_STYLE_HASH}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
  );
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Connection", "close");
  response.setHeader("Content-Length", Buffer.byteLength(body));
  response.setTimeout(RESPONSE_TIMEOUT_MS, () => response.destroy());

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    response.once("finish", finish);
    response.once("close", finish);
    response.once("error", finish);
    response.end(body);
  });
}

function renderPage(status: number, title: string, message: string): string {
  const success = status >= 200 && status < 300;
  const outcome = success ? "success" : "error";
  const role = success ? "status" : "alert";
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${safeTitle} — Grida</title>
<style>${CALLBACK_PAGE_STYLES}</style>
</head>
<body>
<main class="page">
<section class="card" data-outcome="${outcome}" role="${role}" aria-labelledby="page-title" aria-describedby="page-message">
<div class="brand" aria-label="Grida">
<svg class="brand-logo" viewBox="0 0 42 42" fill="currentColor" aria-hidden="true" focusable="false">
<path fill-rule="evenodd" clip-rule="evenodd" d="M27.6584 13.8687L27.5796 28.2889L41.5271 41.9212V27.7373V27.5009L41.525 27.4989C41.3978 19.9495 35.2382 13.8687 27.6584 13.8687Z"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M26.02 7.17866C19.0948 7.95373 13.7111 13.8284 13.7111 20.9606V27.5797L13.9475 42L0 28.3677V13.8687V13.7899L0.000217973 13.7901C0.042516 6.16679 6.23543 0 13.8687 0C19.1022 0 23.6587 2.89894 26.02 7.17866Z"/>
</svg>
<span>Grida</span>
</div>
<div class="provider-mark" role="img" aria-label="OpenAI">
<svg viewBox="0 0 320 320" aria-hidden="true" focusable="false">
<path d="${OPENAI_LOGO_PATH}" fill="currentColor"/>
</svg>
</div>
<h1 id="page-title">${safeTitle}</h1>
<p id="page-message">${safeMessage}</p>
</section>
</main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function callbackError(message: string, cause?: unknown): Error {
  const error = new Error(message, cause === undefined ? undefined : { cause });
  error.name = "OAuthLoopbackCallbackError";
  return error;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
