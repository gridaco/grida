/** GRIDA-SEC-004 — private host/sidecar provider transport framing. */
import type { Writable } from "node:stream";
import { TextDecoder } from "node:util";

/**
 * The private, versioned stdio protocol between Electron main and the agent
 * sidecar. Stdout carries sidecar-to-host frames, stdin carries host-to-sidecar
 * frames, and stderr remains the sidecar's human-readable log stream.
 *
 * Framing is deliberately independent of Node IPC because the channels carry
 * different authority. This stdio protocol carries provider/control frames;
 * the per-spawn Node IPC descriptor carries only already-connected daemon
 * sockets. Neither channel is a fallback for the other.
 */
export namespace AgentSidecarChannel {
  export const VERSION = 1 as const;
  export const MAX_FRAME_BYTES = 256 * 1024;
  export const MAX_BINARY_CHUNK_BYTES = 64 * 1024;
  export const MAX_RESPONSE_CREDIT_BYTES = 16 * 1024 * 1024;

  export type Header = readonly [name: string, value: string];

  /**
   * Provider grants name canonical exact origins or strict DNS-suffix
   * patterns (`https://*.provider.example`). Download grants use the same
   * closed origin vocabulary; there is no arbitrary-public-URL sentinel.
   */
  export type NetworkGrant = Readonly<{
    id: string;
    lane: "provider" | "download";
    origins: readonly string[];
  }>;

  export type BootstrapFrame = Readonly<{
    v: typeof VERSION;
    type: "bootstrap";
    password: string;
    /** Main-owned loopback port whose HTTP requests cross this channel. */
    daemonPort: number;
    revision: number;
    grants: readonly NetworkGrant[];
  }>;

  export type ReadyFrame = Readonly<{
    v: typeof VERSION;
    type: "ready";
    port: number;
  }>;

  /** A complete replacement of the sidecar's current grant snapshot. */
  export type GrantUpdateFrame = Readonly<{
    v: typeof VERSION;
    type: "grant.update";
    revision: number;
    grants: readonly NetworkGrant[];
  }>;

  export type GrantAppliedFrame = Readonly<{
    v: typeof VERSION;
    type: "grant.applied";
    revision: number;
  }>;

  export type RequestStartFrame = Readonly<{
    v: typeof VERSION;
    type: "request.start";
    requestId: string;
    grantId: string;
    method: string;
    url: string;
    headers: readonly Header[];
    hasBody: boolean;
  }>;

  export type RequestChunkFrame = Readonly<{
    v: typeof VERSION;
    type: "request.chunk";
    requestId: string;
    sequence: number;
    data: string;
  }>;

  export type RequestEndFrame = Readonly<{
    v: typeof VERSION;
    type: "request.end";
    requestId: string;
    sequence: number;
  }>;

  export type RequestAbortFrame = Readonly<{
    v: typeof VERSION;
    type: "request.abort";
    requestId: string;
    reason?: string;
  }>;

  export type ResponseStartFrame = Readonly<{
    v: typeof VERSION;
    type: "response.start";
    requestId: string;
    status: number;
    statusText: string;
    headers: readonly Header[];
    hasBody: boolean;
  }>;

  export type ResponseChunkFrame = Readonly<{
    v: typeof VERSION;
    type: "response.chunk";
    requestId: string;
    sequence: number;
    data: string;
  }>;

  export type ResponseEndFrame = Readonly<{
    v: typeof VERSION;
    type: "response.end";
    requestId: string;
    sequence: number;
  }>;

  export type ResponseErrorCode =
    | "denied"
    | "invalid-request"
    | "overloaded"
    | "network"
    | "aborted"
    | "protocol"
    | "internal";

  export type ResponseErrorFrame = Readonly<{
    v: typeof VERSION;
    type: "response.error";
    requestId: string;
    code: ResponseErrorCode;
    message: string;
  }>;

  export type ResponseCreditFrame = Readonly<{
    v: typeof VERSION;
    type: "response.credit";
    requestId: string;
    bytes: number;
  }>;

  export type ShutdownFrame = Readonly<{
    v: typeof VERSION;
    type: "shutdown";
  }>;

  export type HostToSidecarFrame =
    | BootstrapFrame
    | GrantUpdateFrame
    | ResponseStartFrame
    | ResponseChunkFrame
    | ResponseEndFrame
    | ResponseErrorFrame
    | ShutdownFrame;

  export type SidecarToHostFrame =
    | ReadyFrame
    | GrantAppliedFrame
    | RequestStartFrame
    | RequestChunkFrame
    | RequestEndFrame
    | RequestAbortFrame
    | ResponseCreditFrame;

  export type Frame = HostToSidecarFrame | SidecarToHostFrame;

  /** Validate an untrusted decoded value and return the exact v1 frame union. */
  export function parse(value: unknown): Frame {
    const frame = expectRecord(value, "frame");
    if (frame.v !== VERSION) {
      throw protocolError(`unsupported protocol version: ${String(frame.v)}`);
    }
    if (typeof frame.type !== "string") {
      throw protocolError("frame.type must be a string");
    }

    switch (frame.type) {
      case "bootstrap":
        expectExactKeys(frame, [
          "v",
          "type",
          "password",
          "daemonPort",
          "revision",
          "grants",
        ]);
        expectBoundedString(frame.password, "password", 1, 1024);
        expectInteger(frame.daemonPort, "daemonPort", 1, 65_535);
        expectRevision(frame.revision);
        expectGrants(frame.grants);
        break;
      case "ready":
        expectExactKeys(frame, ["v", "type", "port"]);
        expectInteger(frame.port, "port", 1, 65_535);
        break;
      case "grant.update":
        expectExactKeys(frame, ["v", "type", "revision", "grants"]);
        expectRevision(frame.revision);
        expectGrants(frame.grants);
        break;
      case "grant.applied":
        expectExactKeys(frame, ["v", "type", "revision"]);
        expectRevision(frame.revision);
        break;
      case "request.start":
        expectExactKeys(frame, [
          "v",
          "type",
          "requestId",
          "grantId",
          "method",
          "url",
          "headers",
          "hasBody",
        ]);
        expectIdentifier(frame.requestId, "requestId");
        expectGrantIdentifier(frame.grantId, "grantId");
        expectMethod(frame.method);
        expectBoundedString(frame.url, "url", 1, 32 * 1024);
        expectHeaders(frame.headers);
        expectBoolean(frame.hasBody, "hasBody");
        break;
      case "request.chunk":
      case "response.chunk":
        expectExactKeys(frame, ["v", "type", "requestId", "sequence", "data"]);
        expectIdentifier(frame.requestId, "requestId");
        expectSequence(frame.sequence);
        expectBase64Chunk(frame.data);
        break;
      case "request.end":
      case "response.end":
        expectExactKeys(frame, ["v", "type", "requestId", "sequence"]);
        expectIdentifier(frame.requestId, "requestId");
        expectSequence(frame.sequence);
        break;
      case "request.abort":
        expectExactKeys(frame, ["v", "type", "requestId"], ["reason"]);
        expectIdentifier(frame.requestId, "requestId");
        if (frame.reason !== undefined) {
          expectBoundedString(frame.reason, "reason", 1, 1024);
        }
        break;
      case "response.start":
        expectExactKeys(frame, [
          "v",
          "type",
          "requestId",
          "status",
          "statusText",
          "headers",
          "hasBody",
        ]);
        expectIdentifier(frame.requestId, "requestId");
        expectInteger(frame.status, "status", 200, 599);
        expectBoundedString(frame.statusText, "statusText", 0, 1024);
        if (/[\r\n]/.test(frame.statusText)) {
          throw protocolError("statusText must not contain a line break");
        }
        expectHeaders(frame.headers);
        expectBoolean(frame.hasBody, "hasBody");
        break;
      case "response.error":
        expectExactKeys(frame, ["v", "type", "requestId", "code", "message"]);
        expectIdentifier(frame.requestId, "requestId");
        if (!RESPONSE_ERROR_CODES.has(frame.code)) {
          throw protocolError("invalid response.error code");
        }
        expectBoundedString(frame.message, "message", 0, 2048);
        break;
      case "response.credit":
        expectExactKeys(frame, ["v", "type", "requestId", "bytes"]);
        expectIdentifier(frame.requestId, "requestId");
        expectInteger(frame.bytes, "bytes", 1, MAX_RESPONSE_CREDIT_BYTES);
        break;
      case "shutdown":
        expectExactKeys(frame, ["v", "type"]);
        break;
      default:
        throw protocolError(`unknown frame type: ${frame.type}`);
    }

    return frame as Frame;
  }

  /** Encode one already-typed frame after revalidating its runtime contents. */
  export function encode(frame: Frame): Buffer {
    const checked = parse(frame);
    const payload = Buffer.from(JSON.stringify(checked), "utf8");
    if (payload.length === 0 || payload.length > MAX_FRAME_BYTES) {
      throw protocolError(
        `encoded frame length ${payload.length} is outside 1..${MAX_FRAME_BYTES}`
      );
    }
    const packet = Buffer.allocUnsafe(4 + payload.length);
    packet.writeUInt32BE(payload.length, 0);
    payload.copy(packet, 4);
    return packet;
  }

  /** Stateful decoder for arbitrarily fragmented or coalesced pipe chunks. */
  export class Decoder {
    private chunks: Buffer[] = [];
    private chunkIndex = 0;
    private chunkOffset = 0;
    private bufferedBytes = 0;
    private payloadBytes: number | null = null;
    private failed = false;

    push(chunk: Uint8Array): Frame[] {
      if (this.failed) {
        throw protocolError("decoder is unusable after a protocol error");
      }
      if (chunk.byteLength === 0) return [];

      try {
        this.append(chunk);
        const frames: Frame[] = [];

        while (true) {
          if (this.payloadBytes === null) {
            if (this.bufferedBytes < 4) break;
            const length = this.read(4).readUInt32BE(0);
            if (length === 0) {
              throw protocolError("zero-length frame");
            }
            if (length > MAX_FRAME_BYTES) {
              throw protocolError(
                `frame length ${length} exceeds ${MAX_FRAME_BYTES}`
              );
            }
            this.payloadBytes = length;
          }
          if (this.bufferedBytes < this.payloadBytes) break;

          const payload = this.read(this.payloadBytes);
          this.payloadBytes = null;
          let json: unknown;
          try {
            json = JSON.parse(UTF8_DECODER.decode(payload));
          } catch {
            throw protocolError("frame payload is not valid UTF-8 JSON");
          }
          frames.push(parse(json));
        }

        return frames;
      } catch (error) {
        this.reset();
        this.failed = true;
        throw error;
      }
    }

    private append(chunk: Uint8Array): void {
      // Take ownership once. Re-concatenating all prior bytes on every pipe
      // fragment makes one-byte delivery quadratic in the frame size.
      const owned = Buffer.from(chunk);
      this.chunks.push(owned);
      this.bufferedBytes += owned.length;
    }

    private read(length: number): Buffer {
      const value = Buffer.allocUnsafe(length);
      let valueOffset = 0;

      while (valueOffset < length) {
        const chunk = this.chunks[this.chunkIndex];
        const available = chunk.length - this.chunkOffset;
        const consumed = Math.min(available, length - valueOffset);
        chunk.copy(
          value,
          valueOffset,
          this.chunkOffset,
          this.chunkOffset + consumed
        );
        valueOffset += consumed;
        this.chunkOffset += consumed;
        if (this.chunkOffset === chunk.length) {
          this.chunkIndex += 1;
          this.chunkOffset = 0;
        }
      }

      this.bufferedBytes -= length;
      this.compact();
      return value;
    }

    private compact(): void {
      if (this.chunkIndex === this.chunks.length) {
        this.chunks = [];
        this.chunkIndex = 0;
        return;
      }
      if (
        this.chunkIndex >= 1024 &&
        this.chunkIndex * 2 >= this.chunks.length
      ) {
        this.chunks = this.chunks.slice(this.chunkIndex);
        this.chunkIndex = 0;
      }
    }

    private reset(): void {
      this.chunks = [];
      this.chunkIndex = 0;
      this.chunkOffset = 0;
      this.bufferedBytes = 0;
      this.payloadBytes = null;
    }
  }

  /**
   * Serialized frame writer. A write resolves only after both its callback and
   * any required `drain`, so callers cannot outrun pipe backpressure.
   */
  export class Writer {
    private tail: Promise<void> = Promise.resolve();
    private streamError: Error | null = null;

    constructor(private readonly stream: Writable) {
      // Node emits `error` after invoking a failed write callback. Keep a
      // channel-lifetime observer so that later emission is never unhandled,
      // and so future writes fail without touching the closed pipe.
      stream.on("error", (error: Error) => {
        this.streamError = error;
      });
      stream.on("close", () => {
        this.streamError ??= protocolError("output stream closed");
      });
    }

    write(frame: Frame): Promise<void> {
      if (this.streamError) return Promise.reject(this.streamError);
      let packet: Buffer;
      try {
        packet = encode(frame);
      } catch (error) {
        return Promise.reject(error);
      }

      const operation = this.tail.then(() => {
        if (this.streamError) throw this.streamError;
        return this.writePacket(packet);
      });
      // Keep the queue usable so every caller receives its own stream error;
      // the consumer decides whether an error is terminal for the channel.
      this.tail = operation.catch(() => undefined);
      return operation;
    }

    private async writePacket(packet: Buffer): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        let callbackDone = false;
        let drainDone = true;
        let writeReturned = false;
        let settled = false;

        const cleanup = () => {
          this.stream.off("drain", onDrain);
          this.stream.off("error", onError);
          this.stream.off("close", onClose);
        };
        const finish = (error?: Error) => {
          if (settled) return;
          if (error) {
            settled = true;
            cleanup();
            reject(error);
            return;
          }
          if (writeReturned && callbackDone && drainDone) {
            settled = true;
            cleanup();
            resolve();
          }
        };
        const onDrain = () => {
          drainDone = true;
          finish();
        };
        const onError = (error: Error) => finish(error);
        const onClose = () => finish(protocolError("output stream closed"));

        this.stream.once("error", onError);
        this.stream.once("close", onClose);
        try {
          const accepted = this.stream.write(packet, (error?: Error | null) => {
            if (error) {
              this.streamError = error;
              finish(error);
              return;
            }
            callbackDone = true;
            finish();
          });
          drainDone = accepted;
          if (!accepted) this.stream.once("drain", onDrain);
          writeReturned = true;
          finish();
        } catch (error) {
          finish(asError(error));
        }
      });
    }
  }
}

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;
const GRANT_IDENTIFIER = /^[A-Za-z0-9_:-]{1,128}$/;
const HTTP_METHOD = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,32}$/;
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,256}$/;
const BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const RESPONSE_ERROR_CODES = new Set<unknown>([
  "denied",
  "invalid-request",
  "overloaded",
  "network",
  "aborted",
  "protocol",
  "internal",
] satisfies AgentSidecarChannel.ResponseErrorCode[]);

function protocolError(message: string): Error {
  return new Error(`agent sidecar channel protocol error: ${message}`);
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function expectRecord(value: unknown, field: string): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw protocolError(`${field} must be a plain object`);
  }
  return value as Record<string, unknown>;
}

function expectExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = []
): void {
  const present = new Set(Object.keys(value));
  for (const key of required) {
    if (!present.delete(key)) {
      throw protocolError(`missing frame field: ${key}`);
    }
  }
  for (const key of optional) present.delete(key);
  if (present.size > 0) {
    throw protocolError(`unknown frame field: ${[...present].sort()[0]}`);
  }
}

function expectBoolean(
  value: unknown,
  field: string
): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw protocolError(`${field} must be a boolean`);
  }
}

function expectInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw protocolError(
      `${field} must be an integer in ${minimum}..${maximum}`
    );
  }
}

function expectBoundedString(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum
  ) {
    throw protocolError(
      `${field} must be a string with length ${minimum}..${maximum}`
    );
  }
}

function expectIdentifier(
  value: unknown,
  field: string
): asserts value is string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw protocolError(`${field} must be a channel identifier`);
  }
}

function expectGrantIdentifier(
  value: unknown,
  field = "grant.id"
): asserts value is string {
  if (typeof value !== "string" || !GRANT_IDENTIFIER.test(value)) {
    throw protocolError(`${field} must be a channel grant identifier`);
  }
}

function expectRevision(value: unknown): asserts value is number {
  expectInteger(value, "revision", 0, Number.MAX_SAFE_INTEGER);
}

function expectSequence(value: unknown): asserts value is number {
  expectInteger(value, "sequence", 0, Number.MAX_SAFE_INTEGER);
}

function expectMethod(value: unknown): asserts value is string {
  if (typeof value !== "string" || !HTTP_METHOD.test(value)) {
    throw protocolError("method must be an HTTP token");
  }
}

function expectHeaders(
  value: unknown
): asserts value is AgentSidecarChannel.Header[] {
  if (!Array.isArray(value) || value.length > 512) {
    throw protocolError("headers must be an array with at most 512 entries");
  }
  for (const header of value) {
    if (
      !Array.isArray(header) ||
      header.length !== 2 ||
      typeof header[0] !== "string" ||
      !HEADER_NAME.test(header[0]) ||
      typeof header[1] !== "string" ||
      header[1].length > 16 * 1024 ||
      hasForbiddenHeaderValueCharacter(header[1])
    ) {
      throw protocolError("invalid header pair");
    }
  }
}

function hasForbiddenHeaderValueCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    // Horizontal tab (0x09) is permitted by the original wire contract.
    if (code <= 0x08 || (code >= 0x0a && code <= 0x1f) || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function expectBase64Chunk(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !BASE64.test(value) ||
    Buffer.byteLength(value, "base64") >
      AgentSidecarChannel.MAX_BINARY_CHUNK_BYTES
  ) {
    throw protocolError("data must be a non-empty bounded base64 chunk");
  }
}

function expectGrants(
  value: unknown
): asserts value is AgentSidecarChannel.NetworkGrant[] {
  if (!Array.isArray(value) || value.length > 128) {
    throw protocolError("grants must be an array with at most 128 entries");
  }
  const ids = new Set<string>();
  for (const item of value) {
    const grant = expectRecord(item, "grant");
    expectExactKeys(grant, ["id", "lane", "origins"]);
    expectGrantIdentifier(grant.id);
    if (ids.has(grant.id)) throw protocolError("duplicate grant.id");
    ids.add(grant.id);
    if (!Array.isArray(grant.origins) || grant.origins.length === 0) {
      throw protocolError("grant.origins must be a non-empty array");
    }

    if (grant.lane !== "provider" && grant.lane !== "download") {
      throw protocolError("invalid grant.lane");
    }
    if (grant.origins.length > 64) {
      throw protocolError("network grant has too many origins");
    }
    const origins = new Set<string>();
    for (const origin of grant.origins) {
      if (
        typeof origin !== "string" ||
        (!isCanonicalHttpOrigin(origin) && !isProviderOriginPattern(origin)) ||
        (grant.lane === "download" && !isHttpsDefaultOrigin(origin))
      ) {
        throw protocolError(
          "network grant origin must be canonical HTTP(S) or a strict DNS-suffix pattern"
        );
      }
      if (origins.has(origin)) {
        throw protocolError("duplicate provider grant origin");
      }
      origins.add(origin);
    }
  }
}

function isHttpsDefaultOrigin(value: string): boolean {
  if (value.startsWith("https://*.")) {
    const match = /^https:\/\/\*\.[^/:]+(?::(\d+))?$/.exec(value);
    return match !== null && (match[1] === undefined || match[1] === "443");
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.port === "" || url.port === "443");
  } catch {
    return false;
  }
}

function isCanonicalHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.hostname.includes("*") &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      url.origin === value
    );
  } catch {
    return false;
  }
}

function isProviderOriginPattern(value: string): boolean {
  const match = /^(https?):\/\/\*\.([^/:]+)(?::(\d+))?$/.exec(value);
  if (!match) return false;
  const [, , suffix, rawPort] = match;
  if (!DNS_SUFFIX.test(suffix) || suffix.length > 253) return false;
  if (rawPort === undefined) return true;
  const port = Number(rawPort);
  return (
    Number.isSafeInteger(port) &&
    port >= 1 &&
    port <= 65_535 &&
    String(port) === rawPort
  );
}

const DNS_LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const DNS_SUFFIX = new RegExp(`^(?:${DNS_LABEL}\\.)+${DNS_LABEL}$`);
