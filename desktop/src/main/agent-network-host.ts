import { isIP } from "node:net";
import { Readable, type Writable } from "node:stream";
import { net, session, type IncomingMessage, type Session } from "electron";
import { AgentNetworkPolicy } from "../agent-network-policy";
import { AgentSidecarChannel } from "../agent-sidecar-channel";
import { AgentNetworkAuthority } from "./agent-network-authority";

const READY_TIMEOUT_MS = 15_000;
const GRANT_ACK_TIMEOUT_MS = 5_000;
const MAX_CONCURRENT_REQUESTS = 32;
const MAX_DISCARDED_UPLOADS = 32;
const REQUEST_UPLOAD_TIMEOUT_MS = 30_000;
const MAX_REQUEST_BODY_BYTES = 32 * 1024 * 1024;
const MAX_BUFFERED_REQUEST_BODY_BYTES = 64 * 1024 * 1024;
const MAX_RESPONSE_BODY_BYTES = 512 * 1024 * 1024;
const RESPONSE_CHUNK_BYTES = 48 * 1024;
const MAX_REDIRECTS = 5;
const MAX_TERMINAL_RESPONSE_TOMBSTONES = 128;

type NetworkAdapter = Readonly<{
  fetch: (url: string, init: RequestInit) => Promise<Response>;
}>;

type IncomingRequest = {
  frame: AgentSidecarChannel.RequestStartFrame;
  authorized: AgentNetworkPolicy.AuthorizedRequest | null;
  chunks: Buffer[];
  bytes: number;
  bufferedBytes: number;
  sequence: number;
  discarded: boolean;
  timeout: NodeJS.Timeout;
};

type ActiveResponse = {
  requestId: string;
  controller: AbortController;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  credit: number;
  sequence: number;
  total: number;
  remainder: Buffer;
  pumping: boolean;
};

/**
 * GRIDA-SEC-004 — Electron-main implementation of trusted provider HTTP.
 *
 * It owns the system-network stack and grant validation while the sidecar
 * remains inside its whole-process SRT sandbox. There is no listener, renderer
 * IPC method, environment token, or general-purpose proxy: only the inherited
 * stdio pair can speak the strict provider protocol.
 */
export class AgentNetworkHost {
  private readonly decoder = new AgentSidecarChannel.Decoder();
  private readonly writer: AgentSidecarChannel.Writer;
  private readonly incoming = new Map<string, IncomingRequest>();
  private readonly active = new Map<string, ActiveResponse>();
  private readonly requestControllers = new Map<string, AbortController>();
  private readonly terminalResponses = new Set<string>();
  private bufferedRequestBodyBytes = 0;
  private readonly grantAcks = new Map<
    number,
    {
      resolve: () => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  private closed = false;
  private readyResolve: ((port: number) => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;

  constructor(
    input: Readable,
    output: Writable,
    private readonly authority: AgentNetworkAuthority,
    private readonly adapter: NetworkAdapter,
    private readonly onFatal: (error: Error) => void,
    private readonly maxBufferedRequestBodyBytes = MAX_BUFFERED_REQUEST_BODY_BYTES
  ) {
    this.writer = new AgentSidecarChannel.Writer(output);
    input.on("data", (chunk: Buffer | string) => {
      try {
        const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        for (const frame of this.decoder.push(bytes)) this.onFrame(frame);
      } catch (error) {
        this.fail(asError(error));
      }
    });
    input.once("end", () =>
      this.fail(new Error("agent sidecar channel closed"))
    );
    input.once("error", (error) => this.fail(error));
  }

  static async create(args: {
    input: Readable;
    output: Writable;
    authority: AgentNetworkAuthority;
    onFatal: (error: Error) => void;
  }): Promise<AgentNetworkHost> {
    const networkSession = session.fromPartition(
      // No `persist:` prefix: one app-lifetime in-memory BrowserContext reused
      // across supervised sidecar generations. Random partitions accumulate
      // in Electron's ContextMap until app shutdown during a crash loop.
      "grida-agent-provider",
      { cache: false }
    );
    await networkSession.setProxy({ mode: "system" });
    return new AgentNetworkHost(
      args.input,
      args.output,
      args.authority,
      AgentNetworkHost.electronAdapter(networkSession),
      args.onFatal
    );
  }

  async bootstrap(password: string, daemonPort: number): Promise<void> {
    await this.send({
      v: 1,
      type: "bootstrap",
      password,
      daemonPort,
      revision: this.authority.revision,
      grants: this.authority.grants(),
    });
  }

  waitForReady(): Promise<number> {
    const ready = new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.readyResolve = null;
        this.readyReject = null;
        reject(new Error("agent sidecar ready frame timed out"));
      }, READY_TIMEOUT_MS);
      this.readyResolve = (port) => {
        clearTimeout(timeout);
        resolve(port);
      };
      this.readyReject = (error) => {
        clearTimeout(timeout);
        reject(error);
      };
    });
    // Bootstrap writes can fail before the supervisor reaches `await ready`.
    // Observe rejection immediately while returning the original promise so a
    // later await still receives the exact failure instead of crashing main via
    // Node's unhandled-rejection policy.
    void ready.catch(() => undefined);
    return ready;
  }

  async updateGrants(): Promise<void> {
    const revision = this.authority.revision;
    if (this.grantAcks.has(revision)) {
      throw new Error("provider grant revision is already pending");
    }
    const acknowledged = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.grantAcks.delete(revision);
        reject(new Error("agent sidecar grant acknowledgement timed out"));
      }, GRANT_ACK_TIMEOUT_MS);
      this.grantAcks.set(revision, { resolve, reject, timeout });
    });
    // A channel failure or timeout can reject the ACK while the framed write
    // is still backpressured. Observe it now; the later await still receives
    // the original rejection.
    void acknowledged.catch(() => undefined);
    try {
      await Promise.all([
        this.send({
          v: 1,
          type: "grant.update",
          revision,
          grants: this.authority.grants(),
        }),
        acknowledged,
      ]);
    } catch (error) {
      const pending = this.grantAcks.get(revision);
      if (pending) {
        clearTimeout(pending.timeout);
        this.grantAcks.delete(revision);
      }
      throw error;
    }
  }

  async describeCustomEndpoint(baseUrl: string): Promise<{
    origin: string;
    route: string;
  }> {
    const origin = AgentNetworkPolicy.canonicalOrigin(baseUrl);
    const url = new URL(origin);
    if (isExplicitEndpointHost(url.hostname)) {
      return {
        origin,
        route: "explicit localhost or IP-literal destination",
      };
    }
    // `Session.resolveProxy()` is advisory; `net.request()` resolves its route
    // again, so a PAC/config change creates an unbindable check/use gap. Do
    // not mint remote custom-host grants until Electron exposes an atomic
    // request-to-route contract. Built-in provider origins remain host-owned
    // and intentionally follow the current system route.
    throw new Error(
      "remote custom provider hostnames are unavailable in Desktop; use an explicit localhost or IP-literal endpoint"
    );
  }

  close(): void {
    if (this.closed) return;
    void this.writer.write({ v: 1, type: "shutdown" }).catch(() => undefined);
    this.fail(new Error("agent provider network stopped"), false);
  }

  private static electronAdapter(networkSession: Session): NetworkAdapter {
    return {
      // `Session.fetch({ redirect: "manual" })` rejects when Chromium sees a
      // redirect instead of returning the 3xx response. `net.request` exposes
      // that redirect synchronously, which lets the host re-authorize it
      // before any follow-up request carries provider credentials.
      fetch: async (url, init) =>
        await requestThroughSession(networkSession, url, init),
    };
  }

  private onFrame(frame: AgentSidecarChannel.Frame): void {
    switch (frame.type) {
      case "ready": {
        if (!this.readyResolve)
          throw new Error("unexpected duplicate ready frame");
        const resolve = this.readyResolve;
        this.readyResolve = null;
        this.readyReject = null;
        resolve(frame.port);
        return;
      }
      case "grant.applied": {
        const pending = this.grantAcks.get(frame.revision);
        if (!pending)
          throw new Error("unexpected provider grant acknowledgement");
        clearTimeout(pending.timeout);
        this.grantAcks.delete(frame.revision);
        pending.resolve();
        return;
      }
      case "request.start":
        this.onRequestStart(frame);
        return;
      case "request.chunk":
        this.onRequestChunk(frame);
        return;
      case "request.end":
        this.onRequestEnd(frame);
        return;
      case "request.abort":
        this.onRequestAbort(frame.requestId);
        return;
      case "response.credit":
        this.onResponseCredit(frame);
        return;
      default:
        throw new Error(`unexpected sidecar frame: ${frame.type}`);
    }
  }

  private onRequestStart(frame: AgentSidecarChannel.RequestStartFrame): void {
    if (
      this.incoming.has(frame.requestId) ||
      this.requestControllers.has(frame.requestId) ||
      this.terminalResponses.has(frame.requestId)
    ) {
      throw new Error("duplicate provider request");
    }

    let authorized: AgentNetworkPolicy.AuthorizedRequest | null = null;
    const acceptedIncoming = [...this.incoming.values()].filter(
      (request) => !request.discarded
    ).length;
    const discardedIncoming = this.incoming.size - acceptedIncoming;
    let discarded =
      acceptedIncoming + this.requestControllers.size >=
      MAX_CONCURRENT_REQUESTS;
    if (discarded && discardedIncoming >= MAX_DISCARDED_UPLOADS) {
      throw new Error("excessive discarded provider uploads");
    }
    if (discarded) {
      void this.responseError(
        frame.requestId,
        "overloaded",
        "provider network request capacity is temporarily exhausted"
      ).catch((error) => this.fail(asError(error)));
    } else {
      try {
        authorized = AgentNetworkPolicy.authorize(this.authority.grants(), {
          grant_id: frame.grantId,
          method: frame.method,
          url: frame.url,
          headers: frame.headers,
        });
      } catch {
        discarded = true;
        void this.responseError(
          frame.requestId,
          "denied",
          "provider network request denied"
        ).catch((error) => this.fail(asError(error)));
      }
    }
    const timeout = setTimeout(() => {
      const request = this.incoming.get(frame.requestId);
      if (!request || !this.incoming.delete(frame.requestId)) return;
      this.releaseRequestBody(request);
      void this.responseError(
        frame.requestId,
        "invalid-request",
        "provider request upload timed out"
      ).catch((error) => this.fail(asError(error)));
    }, REQUEST_UPLOAD_TIMEOUT_MS);
    this.incoming.set(frame.requestId, {
      frame,
      authorized,
      chunks: [],
      bytes: 0,
      bufferedBytes: 0,
      sequence: 0,
      discarded,
      timeout,
    });
  }

  private onRequestChunk(frame: AgentSidecarChannel.RequestChunkFrame): void {
    const request = this.requireIncoming(frame.requestId);
    if (!request.frame.hasBody || frame.sequence !== request.sequence) {
      throw new Error("invalid provider request body sequence");
    }
    const chunk = Buffer.from(frame.data, "base64");
    request.bytes += chunk.length;
    request.sequence += 1;
    if (request.bytes > MAX_REQUEST_BODY_BYTES) {
      throw new Error("provider request body exceeds host limit");
    }
    if (!request.discarded) {
      if (
        this.bufferedRequestBodyBytes + chunk.length >
        this.maxBufferedRequestBodyBytes
      ) {
        this.releaseRequestBody(request);
        request.discarded = true;
        void this.responseError(
          frame.requestId,
          "overloaded",
          "provider request upload memory budget is temporarily exhausted"
        ).catch((error) => this.fail(asError(error)));
        return;
      }
      request.chunks.push(chunk);
      request.bufferedBytes += chunk.length;
      this.bufferedRequestBodyBytes += chunk.length;
    }
  }

  private onRequestEnd(frame: AgentSidecarChannel.RequestEndFrame): void {
    const request = this.requireIncoming(frame.requestId);
    if (frame.sequence !== request.sequence) {
      throw new Error("provider request end sequence mismatch");
    }
    clearTimeout(request.timeout);
    this.incoming.delete(frame.requestId);
    if (request.discarded || !request.authorized) {
      this.releaseRequestBody(request);
      return;
    }
    try {
      // Authorization at request.start limits what we buffer. Re-authorizing
      // against the current authority here makes revocation effective even if
      // a compromised sidecar holds an upload open across grant.update.
      request.authorized = AgentNetworkPolicy.authorize(
        this.authority.grants(),
        {
          grant_id: request.frame.grantId,
          method: request.frame.method,
          url: request.frame.url,
          headers: request.frame.headers,
        }
      );
    } catch {
      void this.responseError(
        frame.requestId,
        "denied",
        "provider network request denied"
      ).catch((error) => this.fail(asError(error)));
      this.releaseRequestBody(request);
      return;
    }
    const controller = new AbortController();
    this.requestControllers.set(frame.requestId, controller);
    const body = Buffer.concat(request.chunks, request.bufferedBytes);
    // Drop fragmented chunk references, but retain the global byte reservation
    // while the contiguous body is in-flight through Chromium.
    request.chunks = [];
    void this.execute(request, body, controller).catch((error) =>
      this.fail(asError(error))
    );
  }

  private onRequestAbort(requestId: string): void {
    const incoming = this.incoming.get(requestId);
    if (incoming) {
      clearTimeout(incoming.timeout);
      this.releaseRequestBody(incoming);
    }
    this.incoming.delete(requestId);
    this.requestControllers.get(requestId)?.abort();
    const response = this.active.get(requestId);
    if (response) {
      this.active.delete(requestId);
      this.rememberTerminalResponse(requestId);
      void response.reader.cancel().catch(() => undefined);
    }
    this.requestControllers.delete(requestId);
  }

  private onResponseCredit(
    frame: AgentSidecarChannel.ResponseCreditFrame
  ): void {
    const response = this.active.get(frame.requestId);
    if (!response) {
      if (this.terminalResponses.has(frame.requestId)) return;
      throw new Error("response credit names an unknown request");
    }
    response.credit = Math.min(
      AgentSidecarChannel.MAX_RESPONSE_CREDIT_BYTES,
      response.credit + frame.bytes
    );
    void this.pumpResponse(response).catch((error) =>
      this.failResponse(response.requestId, asError(error))
    );
  }

  private async execute(
    request: IncomingRequest,
    body: Buffer,
    controller: AbortController
  ): Promise<void> {
    const requestId = request.frame.requestId;
    let reservationReleased = false;
    try {
      const response = await this.fetchWithRedirects(
        request.authorized!,
        body,
        controller.signal
      );
      this.releaseRequestBody(request);
      body = Buffer.alloc(0);
      reservationReleased = true;
      if (
        controller.signal.aborted ||
        !this.requestControllers.has(requestId)
      ) {
        await response.body?.cancel().catch(() => undefined);
        return;
      }
      const headers = responseHeaders(response.headers);
      const hasBody =
        response.body !== null &&
        request.authorized!.method !== "HEAD" &&
        response.status !== 204 &&
        response.status !== 304;
      if (!hasBody || !response.body) {
        await this.send({
          v: 1,
          type: "response.start",
          requestId,
          status: response.status,
          statusText: response.statusText.slice(0, 1024),
          headers,
          hasBody: false,
        });
        await response.body?.cancel().catch(() => undefined);
        await this.send({
          v: 1,
          type: "response.end",
          requestId,
          sequence: 0,
        });
        this.requestControllers.delete(requestId);
        this.rememberTerminalResponse(requestId);
        return;
      }
      const active: ActiveResponse = {
        requestId,
        controller,
        reader: response.body.getReader(),
        credit: 0,
        sequence: 0,
        total: 0,
        remainder: Buffer.alloc(0),
        pumping: false,
      };
      // Install before publishing response.start. The sidecar's stream may
      // synchronously return credit as soon as it parses that frame.
      this.active.set(requestId, active);
      await this.send({
        v: 1,
        type: "response.start",
        requestId,
        status: response.status,
        statusText: response.statusText.slice(0, 1024),
        headers,
        hasBody: true,
      });
      if (
        controller.signal.aborted ||
        !this.requestControllers.has(requestId)
      ) {
        this.active.delete(requestId);
        await active.reader.cancel().catch(() => undefined);
      }
    } catch (error) {
      if (!this.requestControllers.has(requestId)) return;
      const active = this.active.get(requestId);
      if (active) {
        this.active.delete(requestId);
        await active.reader.cancel().catch(() => undefined);
      }
      this.requestControllers.delete(requestId);
      if (controller.signal.aborted) {
        await this.responseError(
          requestId,
          "aborted",
          "provider request aborted"
        );
      } else if (isDeniedError(error)) {
        await this.responseError(
          requestId,
          "denied",
          "provider network request denied"
        );
      } else if (isProxyAuthenticationError(error)) {
        await this.responseError(
          requestId,
          "network",
          "system proxy requires interactive credentials; configure proxy credentials in the operating system"
        );
      } else {
        await this.responseError(
          requestId,
          "network",
          "provider network request failed"
        );
      }
      this.rememberTerminalResponse(requestId);
    } finally {
      if (!reservationReleased) this.releaseRequestBody(request);
    }
  }

  private async fetchWithRedirects(
    initial: AgentNetworkPolicy.AuthorizedRequest,
    body: Buffer,
    signal: AbortSignal
  ): Promise<Response> {
    let current = initial;
    let currentBody = body;
    for (let redirects = 0; ; redirects += 1) {
      if (this.authority.isCustomGrant(current.grant.id)) {
        await this.assertCustomEndpointRoute(current.url);
      }
      const response = await this.adapter.fetch(current.url.toString(), {
        method: current.method,
        headers: current.headers,
        body:
          currentBody.length > 0 &&
          current.method !== "GET" &&
          current.method !== "HEAD"
            ? Uint8Array.from(currentBody).buffer
            : undefined,
        signal,
        redirect: "manual",
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
      const location = response.headers.get("location");
      if (!isRedirect(response.status) || !location) return response;
      await response.body?.cancel().catch(() => undefined);
      if (redirects >= MAX_REDIRECTS) throw deniedError();

      const target = new URL(location, current.url);
      const sameOrigin = target.origin === current.url.origin;
      const headers = [...current.headers.entries()].filter(
        ([name]) => sameOrigin || !isCredentialHeader(name)
      );
      // Provider requests can carry credentials in arbitrary headers, query
      // parameters, or a replayed 307/308 body. Header-name heuristics cannot
      // prove a cross-origin hop is clean, so only the credential-free asset
      // lane may redirect across origins (after full grant reauthorization).
      if (current.grant.lane === "provider" && !sameOrigin) {
        throw deniedError();
      }
      let method = current.method;
      if (
        response.status === 303 ||
        ((response.status === 301 || response.status === 302) &&
          method === "POST")
      ) {
        method = "GET";
        currentBody = Buffer.alloc(0);
      }
      current = AgentNetworkPolicy.authorize(this.authority.grants(), {
        grant_id: current.grant.id,
        method,
        url: target.toString(),
        headers,
      });
    }
  }

  private async assertCustomEndpointRoute(url: URL): Promise<void> {
    if (isExplicitEndpointHost(url.hostname)) return;
    throw deniedError();
  }

  private async pumpResponse(response: ActiveResponse): Promise<void> {
    if (response.pumping || !this.active.has(response.requestId)) return;
    response.pumping = true;
    try {
      while (
        this.active.has(response.requestId) &&
        (response.credit > 0 || response.remainder.length === 0)
      ) {
        if (response.remainder.length === 0) {
          const next = await response.reader.read();
          if (
            !this.active.has(response.requestId) ||
            response.controller.signal.aborted
          ) {
            await response.reader.cancel().catch(() => undefined);
            return;
          }
          if (next.done) {
            await this.send({
              v: 1,
              type: "response.end",
              requestId: response.requestId,
              sequence: response.sequence,
            });
            if (!this.active.has(response.requestId)) return;
            this.active.delete(response.requestId);
            this.requestControllers.delete(response.requestId);
            this.rememberTerminalResponse(response.requestId);
            return;
          }
          response.remainder = Buffer.from(next.value);
          response.total += response.remainder.length;
          if (response.total > MAX_RESPONSE_BODY_BYTES) {
            throw new Error("provider response body exceeds host limit");
          }
        }
        // One bounded read-ahead is allowed after credit reaches zero. It lets
        // us observe EOF and send response.end without demanding meaningless
        // extra credit; a real next chunk remains buffered until more credit.
        if (response.credit === 0) continue;
        const bytes = Math.min(
          response.remainder.length,
          response.credit,
          RESPONSE_CHUNK_BYTES
        );
        const chunk = response.remainder.subarray(0, bytes);
        response.remainder = response.remainder.subarray(bytes);
        response.credit -= bytes;
        await this.send({
          v: 1,
          type: "response.chunk",
          requestId: response.requestId,
          sequence: response.sequence,
          data: chunk.toString("base64"),
        });
        if (!this.active.has(response.requestId)) return;
        response.sequence += 1;
      }
    } finally {
      response.pumping = false;
    }
  }

  private failResponse(requestId: string, _error: Error): void {
    const response = this.active.get(requestId);
    if (!response) return;
    this.active.delete(requestId);
    this.requestControllers.delete(requestId);
    this.rememberTerminalResponse(requestId);
    response.controller.abort();
    void response.reader.cancel().catch(() => undefined);
    void this.responseError(
      requestId,
      "network",
      "provider response stream failed"
    ).catch((error) => this.fail(asError(error)));
  }

  private requireIncoming(requestId: string): IncomingRequest {
    const request = this.incoming.get(requestId);
    if (!request) throw new Error("request body names an unknown request");
    return request;
  }

  private releaseRequestBody(request: IncomingRequest): void {
    this.bufferedRequestBodyBytes = Math.max(
      0,
      this.bufferedRequestBodyBytes - request.bufferedBytes
    );
    request.bufferedBytes = 0;
    request.chunks = [];
  }

  private rememberTerminalResponse(requestId: string): void {
    this.terminalResponses.add(requestId);
    while (this.terminalResponses.size > MAX_TERMINAL_RESPONSE_TOMBSTONES) {
      const oldest = this.terminalResponses.values().next().value as
        | string
        | undefined;
      if (oldest === undefined) break;
      this.terminalResponses.delete(oldest);
    }
  }

  private async responseError(
    requestId: string,
    code: AgentSidecarChannel.ResponseErrorCode,
    message: string
  ): Promise<void> {
    await this.send({ v: 1, type: "response.error", requestId, code, message });
  }

  private async send(
    frame: AgentSidecarChannel.HostToSidecarFrame
  ): Promise<void> {
    if (this.closed) throw new Error("agent network host is closed");
    await this.writer.write(frame);
  }

  private fail(error: Error, fatal = true): void {
    if (this.closed) return;
    this.closed = true;
    this.readyReject?.(error);
    this.readyResolve = null;
    this.readyReject = null;
    for (const controller of this.requestControllers.values())
      controller.abort();
    for (const response of this.active.values()) {
      void response.reader.cancel().catch(() => undefined);
    }
    for (const request of this.incoming.values()) clearTimeout(request.timeout);
    this.bufferedRequestBodyBytes = 0;
    this.incoming.clear();
    this.active.clear();
    this.requestControllers.clear();
    this.terminalResponses.clear();
    for (const pending of this.grantAcks.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.grantAcks.clear();
    if (fatal) this.onFatal(error);
  }
}

export function requestThroughSession(
  networkSession: Session,
  url: string,
  init: RequestInit
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const signal = init.signal ?? undefined;
    if (signal?.aborted) {
      reject(abortError(signal.reason));
      return;
    }

    const request = net.request({
      url,
      method: init.method,
      session: networkSession,
      redirect: "manual",
      // Keep origin/server credentials and cookies out of the dedicated
      // provider Session. Chromium still permits proxy-level authentication
      // (including integrated/cached proxy auth) in this mode; an unsatisfied
      // interactive challenge reaches the `login` handler and fails closed.
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      bypassCustomProtocolHandlers: true,
    });
    let settled = false;
    const settle = (result: { response: Response } | { error: Error }) => {
      if (settled) return;
      settled = true;
      if ("response" in result) resolve(result.response);
      else reject(result.error);
    };
    const abort = () => {
      request.abort();
      settle({ error: abortError(signal?.reason) });
    };
    signal?.addEventListener("abort", abort, { once: true });
    request.once("close", () => signal?.removeEventListener("abort", abort));
    request.once("error", (error) => settle({ error }));
    request.once("login", (_authInfo, callback) => {
      // Stored/integrated proxy credentials are handled by Chromium before
      // this event. Desktop has no credential-prompt contract yet, so an
      // interactive challenge fails closed instead of borrowing renderer UI
      // or persisting a proxy password in the provider session.
      request.abort();
      settle({ error: proxyAuthenticationError() });
      callback();
    });
    request.once(
      "redirect",
      (status, _method, redirectUrl, responseHeaderRecord) => {
        try {
          const headers = headersFromRecord(responseHeaderRecord);
          if (!headers.has("location")) headers.set("location", redirectUrl);
          settle({
            response: new Response(null, {
              status,
              headers,
            }),
          });
        } catch (error) {
          request.abort();
          settle({ error: asError(error) });
        }
        // In manual mode, intentionally not calling followRedirect() cancels
        // this transaction after the event. The caller authorizes and starts a
        // fresh request for the next hop.
      }
    );
    request.once("response", (incoming) => {
      if (settled) {
        // A transport may deliver a queued response event after an abort.
        // Never construct an unread streaming Response after the promise has
        // already failed (notably the interactive-proxy-auth path above).
        (incoming as unknown as Readable).destroy();
        return;
      }
      try {
        settle({ response: responseFromIncoming(incoming, init.method) });
      } catch (error) {
        request.abort();
        settle({ error: asError(error) });
      }
    });

    try {
      for (const [name, value] of new Headers(init.headers).entries()) {
        request.setHeader(name, value);
      }
      const body = requestBodyBuffer(init.body);
      request.end(body.length > 0 ? body : undefined);
    } catch (error) {
      request.abort();
      settle({ error: asError(error) });
    }
  });
}

export function responseFromIncoming(
  incoming: IncomingMessage,
  method: string | undefined
): Response {
  const headers = headersFromRaw(incoming.rawHeaders);
  const readable = incoming as unknown as Readable;
  const hasBody =
    method?.toUpperCase() !== "HEAD" &&
    incoming.statusCode !== 204 &&
    incoming.statusCode !== 205 &&
    incoming.statusCode !== 304;
  if (hasBody) {
    // Electron's net stack transparently decodes compressed response bytes but
    // leaves the wire representation headers on IncomingMessage. The exposed
    // body is decoded, so forwarding gzip and compressed length would describe
    // different bytes. HEAD/no-body responses retain representation metadata.
    headers.delete("content-encoding");
    headers.delete("content-length");
  }
  if (!hasBody) readable.resume();
  // Electron's IncomingMessage implements Node's readable-stream contract at
  // runtime, even though its generated type exposes the event subset only.
  // `toWeb` preserves pull/cancel backpressure into Chromium.
  const body = hasBody
    ? (Readable.toWeb(readable) as ReadableStream<Uint8Array>)
    : null;
  return new Response(body, {
    status: incoming.statusCode,
    statusText: incoming.statusMessage.slice(0, 1024),
    headers,
  });
}

function headersFromRaw(rawHeaders: readonly string[]): Headers {
  const headers = new Headers();
  for (let index = 0; index + 1 < rawHeaders.length; index += 2) {
    headers.append(rawHeaders[index], rawHeaders[index + 1]);
  }
  return headers;
}

function headersFromRecord(
  record: Readonly<Record<string, readonly string[]>>
): Headers {
  const headers = new Headers();
  for (const [name, values] of Object.entries(record)) {
    for (const value of values) headers.append(name, value);
  }
  return headers;
}

function requestBodyBuffer(body: BodyInit | null | undefined): Buffer {
  if (body === undefined || body === null) return Buffer.alloc(0);
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  throw new Error("agent provider request body type is unsupported");
}

function responseHeaders(headers: Headers): AgentSidecarChannel.Header[] {
  const result: AgentSidecarChannel.Header[] = [];
  let bytes = 0;
  for (const [name, value] of headers.entries()) {
    const lower = name.toLowerCase();
    if (
      lower === "set-cookie" ||
      lower === "set-cookie2" ||
      lower === "connection" ||
      lower === "keep-alive" ||
      lower === "proxy-authenticate" ||
      lower === "proxy-connection" ||
      lower === "te" ||
      lower === "trailer" ||
      lower === "transfer-encoding" ||
      lower === "upgrade"
    ) {
      continue;
    }
    if (value.length > 16 * 1024) continue;
    bytes += Buffer.byteLength(name) + Buffer.byteLength(value);
    if (bytes > 64 * 1024 || result.length >= 128) break;
    result.push([name, value]);
  }
  return result;
}

function isRedirect(status: number): boolean {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}

function isCredentialHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower === "authorization" ||
    lower === "proxy-authorization" ||
    lower === "cookie" ||
    lower === "x-api-key" ||
    lower === "api-key"
  );
}

function isExplicitEndpointHost(hostname: string): boolean {
  const unwrapped =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
  const lower = unwrapped.toLowerCase();
  return (
    isIP(unwrapped) !== 0 ||
    lower === "localhost" ||
    lower.endsWith(".localhost")
  );
}

function deniedError(): Error {
  const error = new Error("provider network request denied");
  error.name = "AgentNetworkDeniedError";
  return error;
}

function proxyAuthenticationError(): Error {
  const error = new Error("interactive system proxy credentials required");
  error.name = "AgentProxyAuthenticationError";
  return error;
}

function isProxyAuthenticationError(error: unknown): boolean {
  return (
    error instanceof Error && error.name === "AgentProxyAuthenticationError"
  );
}

function isDeniedError(error: unknown): boolean {
  return error instanceof Error && error.name === "AgentNetworkDeniedError";
}

function abortError(reason: unknown): Error {
  const error = new Error(
    typeof reason === "string" ? reason : "The operation was aborted."
  );
  error.name = "AbortError";
  return error;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
