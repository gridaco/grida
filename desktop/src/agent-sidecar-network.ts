/** GRIDA-SEC-004 — sandbox-side provider transport over the private channel. */
import crypto from "node:crypto";
import type { Readable, Writable } from "node:stream";
import type { ProviderHttpTransport } from "@grida/agent/server";
import type {
  ShellExecutionScope,
  ShellExecutor,
  ShellRunRequest,
  ShellRunResult,
} from "@grida/daemon/server";
import { AgentNetworkPolicy } from "./agent-network-policy";
import { AgentSidecarChannel } from "./agent-sidecar-channel";

const BOOTSTRAP_TIMEOUT_MS = 5_000;
const MAX_REQUEST_BODY_BYTES = 32 * 1024 * 1024;
const REQUEST_CHUNK_BYTES = 48 * 1024;
const RESPONSE_CREDIT_BYTES = 128 * 1024;
const MAX_CANCELLED_TOMBSTONES = 128;

type Bootstrap = Readonly<{
  password: string;
  daemonPort: number;
  revision: number;
}>;

type PendingResponse = {
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
  controller: ReadableStreamDefaultController<Uint8Array> | null;
  sequence: number;
  credit: number;
  started: boolean;
  settled: boolean;
  abortCleanup: () => void;
};

type PendingCommand = {
  request: ShellRunRequest;
  resolve: (result: ShellRunResult) => void;
  reject: (error: Error) => void;
  sequence: number;
  outputBytes: number;
  stdout: string[];
  stderr: string[];
  abortCleanup: () => void;
  abortError: Error | null;
};

/**
 * Sidecar half of the private provider-HTTP and host-command channel. These
 * are the only capabilities handed to `@grida/agent`; model tools and spawned
 * children receive neither the objects nor a channel address/token in argv or
 * environment.
 */
export class AgentSidecarNetwork {
  readonly providerHttp: ProviderHttpTransport;
  readonly shellExecutor: ShellExecutor;

  private readonly decoder = new AgentSidecarChannel.Decoder();
  private readonly writer: AgentSidecarChannel.Writer;
  private readonly pending = new Map<string, PendingResponse>();
  private readonly pendingCommands = new Map<string, PendingCommand>();
  private readonly cancelled = new Set<string>();
  private grants: AgentSidecarChannel.NetworkGrant[] = [];
  private revision = -1;
  private bootstrapped = false;
  private bootstrapValue: Bootstrap | null = null;
  private closed = false;
  private bootstrapResolve: ((value: Bootstrap) => void) | null = null;
  private bootstrapReject: ((error: Error) => void) | null = null;
  private shutdownHandler: (() => void) | null = null;
  private shutdownRequested = false;
  private shutdownDelivered = false;
  private fatalHandler: ((error: Error) => void) | null = null;
  private fatalValue: Error | null = null;

  constructor(input: Readable, output: Writable) {
    this.writer = new AgentSidecarChannel.Writer(output);
    this.providerHttp = Object.freeze({
      request: (input, init) => this.fetch("provider", input, init),
      download: (input, init) => this.fetch("download", input, init),
    });
    this.shellExecutor = (request, scope, signal) =>
      this.executeCommand(request, scope, signal);

    input.on("data", (chunk: Buffer | string) => {
      try {
        const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        for (const frame of this.decoder.push(bytes)) this.onFrame(frame);
      } catch (error) {
        this.fail(asError(error));
      }
    });
    input.once("end", () => this.fail(new Error("agent network host closed")));
    input.once("error", (error) => this.fail(error));
    input.resume();
  }

  waitForBootstrap(): Promise<Bootstrap> {
    if (this.bootstrapValue) {
      const value = this.bootstrapValue;
      this.bootstrapValue = null;
      return Promise.resolve(value);
    }
    if (this.bootstrapped)
      return Promise.reject(new Error("bootstrap already consumed"));
    return new Promise<Bootstrap>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.bootstrapResolve = null;
        this.bootstrapReject = null;
        reject(new Error("agent sidecar bootstrap timed out"));
      }, BOOTSTRAP_TIMEOUT_MS);
      this.bootstrapResolve = (value) => {
        clearTimeout(timeout);
        resolve(value);
      };
      this.bootstrapReject = (error) => {
        clearTimeout(timeout);
        reject(error);
      };
    });
  }

  onShutdown(handler: () => void): void {
    this.shutdownHandler = handler;
    this.deliverShutdown();
  }

  onFatal(handler: (error: Error) => void): void {
    this.fatalHandler = handler;
    if (this.fatalValue) {
      const error = this.fatalValue;
      this.fatalValue = null;
      handler(error);
    }
  }

  async ready(port: number): Promise<void> {
    await this.send({ v: 1, type: "ready", port });
  }

  close(reason = "agent network channel closed"): void {
    this.fail(new Error(reason));
  }

  private async executeCommand(
    request: ShellRunRequest,
    scope: ShellExecutionScope,
    signal?: AbortSignal
  ): Promise<ShellRunResult> {
    if (!this.bootstrapped || this.closed) {
      throw new Error("agent host command execution is not available");
    }
    if (signal?.aborted) throw abortError(signal.reason);

    const requestSnapshot: ShellRunRequest = {
      cmd: request.cmd,
      args: [...request.args],
      cwd: request.cwd,
      ...(request.timeout_ms === undefined
        ? {}
        : { timeout_ms: request.timeout_ms }),
    };
    const requestId = crypto.randomUUID();
    const result = new Promise<ShellRunResult>((resolve, reject) => {
      const abort = () => {
        const pending = this.pendingCommands.get(requestId);
        if (!pending || pending.abortError) return;
        // Keep the tool promise pending until main confirms that the confined
        // worker returned and AgentCommandHost's finally cleanup completed.
        pending.abortError = abortError(signal?.reason);
        void this.send({
          v: 1,
          type: "command.abort",
          requestId,
          reason: "caller aborted",
        }).catch((error) => this.fail(asError(error)));
      };
      signal?.addEventListener("abort", abort, { once: true });
      this.pendingCommands.set(requestId, {
        request: requestSnapshot,
        resolve,
        reject,
        sequence: 0,
        outputBytes: 0,
        stdout: [],
        stderr: [],
        abortCleanup: () => signal?.removeEventListener("abort", abort),
        abortError: null,
      });
    });
    // A host can reject as soon as it decodes command.request, before the
    // Writer's callback/backpressure promise resolves. Observe that result
    // synchronously and return the original rejection below.
    void result.catch(() => undefined);

    try {
      await this.send({
        v: 1,
        type: "command.request",
        requestId,
        command: requestSnapshot.cmd,
        args: requestSnapshot.args,
        workdir: requestSnapshot.cwd,
        ...(requestSnapshot.timeout_ms === undefined
          ? {}
          : { timeoutMs: requestSnapshot.timeout_ms }),
        workspaceRoot: scope.workspace_root,
        ...(scope.scratch_root === undefined
          ? {}
          : { scratchDir: scope.scratch_root }),
      });
    } catch (error) {
      // A failed write is ambiguous: main may already have decoded the frame
      // and launched a confined worker before the pipe reported failure.
      // Only generation-fatal supervision can own that worker's cleanup; an
      // ordinary tool rejection would let this runtime admit replacement work
      // without the terminal cleanup acknowledgement.
      this.fail(
        new Error(
          `host command request delivery failed: ${asError(error).message}`
        )
      );
    }
    return await result;
  }

  private async fetch(
    lane: AgentNetworkPolicy.Lane,
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> {
    if (!this.bootstrapped || this.closed) {
      throw new Error("agent provider network is not available");
    }
    const request = new Request(input, init);
    const grant = this.grants.find(
      (candidate) =>
        candidate.lane === lane &&
        AgentNetworkPolicy.grantAllowsUrl(candidate, new URL(request.url))
    );
    if (!grant) {
      throw new Error("provider destination has no host-issued grant");
    }
    if (request.signal.aborted) throw abortError(request.signal.reason);

    let body = Buffer.alloc(0);
    if (request.body) {
      const declared = Number(request.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > MAX_REQUEST_BODY_BYTES) {
        throw new Error("provider request body exceeds the Desktop limit");
      }
      body = Buffer.from(await request.arrayBuffer());
      if (body.length > MAX_REQUEST_BODY_BYTES) {
        throw new Error("provider request body exceeds the Desktop limit");
      }
    }
    // An AbortSignal does not replay an event to a listener installed after it
    // fired. Recheck after the awaited body read before any request frame can
    // create an incomplete host-side upload.
    if (request.signal.aborted) throw abortError(request.signal.reason);

    const requestId = crypto.randomUUID();
    const response = new Promise<Response>((resolve, reject) => {
      const abort = () => {
        const current = this.pending.get(requestId);
        if (!current) return;
        this.rememberCancelled(requestId);
        void this.send({
          v: 1,
          type: "request.abort",
          requestId,
          reason: "caller aborted",
        }).catch(() => undefined);
        this.rejectPending(requestId, abortError(request.signal.reason));
      };
      request.signal.addEventListener("abort", abort, { once: true });
      this.pending.set(requestId, {
        resolve,
        reject,
        controller: null,
        sequence: 0,
        credit: 0,
        started: false,
        settled: false,
        abortCleanup: () => request.signal.removeEventListener("abort", abort),
      });
    });
    // The host may deny/overload immediately after request.start while a large
    // upload is still being framed. Observe that rejection synchronously; the
    // final await below still propagates the original error to the caller.
    void response.catch(() => undefined);

    try {
      await this.send({
        v: 1,
        type: "request.start",
        requestId,
        grantId: grant.id,
        method: request.method,
        url: request.url,
        headers: [...request.headers.entries()],
        hasBody: body.length > 0,
      });
      if (!this.pending.has(requestId)) return await response;

      let sequence = 0;
      for (
        let offset = 0;
        offset < body.length;
        offset += REQUEST_CHUNK_BYTES
      ) {
        if (request.signal.aborted) throw abortError(request.signal.reason);
        await this.send({
          v: 1,
          type: "request.chunk",
          requestId,
          sequence,
          data: body
            .subarray(offset, offset + REQUEST_CHUNK_BYTES)
            .toString("base64"),
        });
        sequence += 1;
        if (!this.pending.has(requestId)) return await response;
      }
      if (request.signal.aborted) throw abortError(request.signal.reason);
      await this.send({
        v: 1,
        type: "request.end",
        requestId,
        sequence,
      });
    } catch (error) {
      this.rejectPending(requestId, asError(error));
    }
    return await response;
  }

  private onFrame(frame: AgentSidecarChannel.Frame): void {
    switch (frame.type) {
      case "bootstrap": {
        if (this.bootstrapped || this.revision !== -1) {
          throw new Error("duplicate agent sidecar bootstrap");
        }
        this.bootstrapped = true;
        this.revision = frame.revision;
        this.grants = frame.grants.map((grant) => ({
          ...grant,
          origins: [...grant.origins],
        }));
        const resolve = this.bootstrapResolve;
        this.bootstrapResolve = null;
        this.bootstrapReject = null;
        const value = {
          password: frame.password,
          daemonPort: frame.daemonPort,
          revision: frame.revision,
        };
        if (resolve) resolve(value);
        else this.bootstrapValue = value;
        return;
      }
      case "grant.update":
        this.requireBootstrap();
        if (frame.revision <= this.revision) {
          throw new Error("stale provider-network grant revision");
        }
        this.revision = frame.revision;
        this.grants = frame.grants.map((grant) => ({
          ...grant,
          origins: [...grant.origins],
        }));
        void this.send({
          v: 1,
          type: "grant.applied",
          revision: frame.revision,
        }).catch((error) => this.fail(asError(error)));
        return;
      case "response.start":
        if (this.ignoreCancelledResponse(frame)) return;
        this.onResponseStart(frame);
        return;
      case "response.chunk":
        if (this.ignoreCancelledResponse(frame)) return;
        this.onResponseChunk(frame);
        return;
      case "response.end":
        if (this.ignoreCancelledResponse(frame)) return;
        this.onResponseEnd(frame);
        return;
      case "response.error":
        if (this.ignoreCancelledResponse(frame)) return;
        this.onResponseError(frame);
        return;
      case "command.output":
        this.onCommandOutput(frame);
        return;
      case "command.end":
        this.onCommandEnd(frame);
        return;
      case "command.aborted":
        this.onCommandAborted(frame);
        return;
      case "command.error":
        this.onCommandError(frame);
        return;
      case "shutdown":
        this.shutdownRequested = true;
        this.deliverShutdown();
        return;
      default:
        throw new Error(`unexpected host frame: ${frame.type}`);
    }
  }

  private onResponseStart(frame: AgentSidecarChannel.ResponseStartFrame): void {
    const pending = this.requirePending(frame.requestId);
    if (pending.started) throw new Error("duplicate response.start");
    pending.started = true;
    const headers = new Headers();
    for (const [name, value] of frame.headers) headers.append(name, value);

    let body: ReadableStream<Uint8Array> | null = null;
    if (frame.hasBody) {
      body = new ReadableStream<Uint8Array>({
        start: (controller) => {
          pending.controller = controller;
        },
        pull: () => {
          if (pending.credit > 0 || !this.pending.has(frame.requestId)) return;
          pending.credit = RESPONSE_CREDIT_BYTES;
          void this.send({
            v: 1,
            type: "response.credit",
            requestId: frame.requestId,
            bytes: RESPONSE_CREDIT_BYTES,
          }).catch((error) =>
            this.rejectPending(frame.requestId, asError(error))
          );
        },
        cancel: () => {
          if (!this.pending.has(frame.requestId)) return;
          this.rememberCancelled(frame.requestId);
          void this.send({
            v: 1,
            type: "request.abort",
            requestId: frame.requestId,
            reason: "response body cancelled",
          }).catch(() => undefined);
          this.finishPending(frame.requestId);
        },
      });
    }
    pending.settled = true;
    pending.resolve(
      new Response(body, {
        status: frame.status,
        statusText: frame.statusText,
        headers,
      })
    );
  }

  private onResponseChunk(frame: AgentSidecarChannel.ResponseChunkFrame): void {
    const pending = this.requirePending(frame.requestId);
    if (!pending.started || !pending.controller) {
      throw new Error("response.chunk arrived before a body response");
    }
    if (frame.sequence !== pending.sequence) {
      throw new Error("response chunk sequence mismatch");
    }
    const chunk = Buffer.from(frame.data, "base64");
    if (chunk.length > pending.credit) {
      throw new Error("response exceeded sidecar credit");
    }
    pending.sequence += 1;
    pending.credit -= chunk.length;
    pending.controller.enqueue(chunk);
  }

  private onResponseEnd(frame: AgentSidecarChannel.ResponseEndFrame): void {
    const pending = this.requirePending(frame.requestId);
    if (!pending.started || frame.sequence !== pending.sequence) {
      throw new Error("response end sequence mismatch");
    }
    pending.controller?.close();
    this.finishPending(frame.requestId);
  }

  private onResponseError(frame: AgentSidecarChannel.ResponseErrorFrame): void {
    const error = new Error(
      frame.message || `provider request failed: ${frame.code}`
    );
    if (frame.code === "aborted") error.name = "AbortError";
    if (frame.code === "overloaded") error.name = "AgentNetworkOverloadedError";
    this.rejectPending(frame.requestId, error);
  }

  private onCommandOutput(frame: AgentSidecarChannel.CommandOutputFrame): void {
    const pending = this.requirePendingCommand(frame.requestId);
    if (pending.abortError) return;
    if (frame.sequence !== pending.sequence) {
      throw new Error("command output sequence mismatch");
    }
    const bytes = Buffer.byteLength(frame.data, "utf8");
    if (
      pending.outputBytes + bytes >
      AgentSidecarChannel.MAX_COMMAND_OUTPUT_BYTES
    ) {
      throw new Error("command output exceeded the sidecar limit");
    }
    pending.sequence += 1;
    pending.outputBytes += bytes;
    pending[frame.stream].push(frame.data);
  }

  private onCommandEnd(frame: AgentSidecarChannel.CommandEndFrame): void {
    const pending = this.requirePendingCommand(frame.requestId);
    if (pending.abortError) return;
    if (frame.sequence !== pending.sequence) {
      throw new Error("command end sequence mismatch");
    }
    this.pendingCommands.delete(frame.requestId);
    pending.abortCleanup();
    pending.resolve({
      cmd: pending.request.cmd,
      args: [...pending.request.args],
      cwd: pending.request.cwd,
      exit_code: frame.exitCode,
      signal: frame.signal,
      stdout: pending.stdout.join(""),
      stderr: pending.stderr.join(""),
      duration_ms: frame.durationMs,
      timed_out: frame.timedOut,
      truncated: frame.truncated,
    });
  }

  private onCommandAborted(
    frame: AgentSidecarChannel.CommandAbortedFrame
  ): void {
    const pending = this.requirePendingCommand(frame.requestId);
    if (!pending.abortError) {
      throw new Error("command.aborted arrived without a caller abort");
    }
    this.pendingCommands.delete(frame.requestId);
    pending.abortCleanup();
    pending.reject(pending.abortError);
  }

  private onCommandError(frame: AgentSidecarChannel.CommandErrorFrame): void {
    const pending = this.requirePendingCommand(frame.requestId);
    if (pending.abortError) return;
    this.rejectPendingCommand(frame.requestId, new Error(frame.message));
  }

  private requirePendingCommand(requestId: string): PendingCommand {
    const pending = this.pendingCommands.get(requestId);
    if (!pending) throw new Error("command response names an unknown request");
    return pending;
  }

  private rejectPendingCommand(requestId: string, error: Error): void {
    const pending = this.pendingCommands.get(requestId);
    if (!pending) return;
    this.pendingCommands.delete(requestId);
    pending.abortCleanup();
    pending.reject(error);
  }

  private requirePending(requestId: string): PendingResponse {
    const pending = this.pending.get(requestId);
    if (!pending) throw new Error("response names an unknown request");
    return pending;
  }

  private rejectPending(requestId: string, error: Error): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    if (pending.started) pending.controller?.error(error);
    if (!pending.settled) pending.reject(error);
    this.finishPending(requestId);
  }

  private finishPending(requestId: string): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    pending.abortCleanup();
    this.pending.delete(requestId);
  }

  private rememberCancelled(requestId: string): void {
    this.cancelled.add(requestId);
    while (this.cancelled.size > MAX_CANCELLED_TOMBSTONES) {
      const oldest = this.cancelled.values().next().value as string | undefined;
      if (oldest === undefined) break;
      this.cancelled.delete(oldest);
    }
  }

  private ignoreCancelledResponse(
    frame:
      | AgentSidecarChannel.ResponseStartFrame
      | AgentSidecarChannel.ResponseChunkFrame
      | AgentSidecarChannel.ResponseEndFrame
      | AgentSidecarChannel.ResponseErrorFrame
  ): boolean {
    if (!this.cancelled.has(frame.requestId)) return false;
    if (frame.type === "response.end" || frame.type === "response.error") {
      this.cancelled.delete(frame.requestId);
    }
    return true;
  }

  private requireBootstrap(): void {
    if (!this.bootstrapped) throw new Error("frame arrived before bootstrap");
  }

  private deliverShutdown(): void {
    if (
      !this.shutdownRequested ||
      this.shutdownDelivered ||
      !this.shutdownHandler
    ) {
      return;
    }
    this.shutdownDelivered = true;
    this.shutdownHandler();
  }

  private async send(
    frame: AgentSidecarChannel.SidecarToHostFrame
  ): Promise<void> {
    if (this.closed) throw new Error("agent network channel is closed");
    await this.writer.write(frame);
  }

  private fail(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.bootstrapReject?.(error);
    this.bootstrapResolve = null;
    this.bootstrapReject = null;
    for (const requestId of this.pending.keys()) {
      this.rejectPending(requestId, error);
    }
    for (const requestId of this.pendingCommands.keys()) {
      this.rejectPendingCommand(requestId, error);
    }
    this.cancelled.clear();
    if (this.fatalHandler) this.fatalHandler(error);
    else this.fatalValue = error;
  }
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
