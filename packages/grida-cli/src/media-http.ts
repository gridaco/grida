// GRIDA-SEC-013 — credential destinations, public DNS pinning and bounded media egress.
import type { ProviderHttpTransport } from "@grida/ai";
import { lookup } from "node:dns/promises";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";

/** CLI-owned media egress. No environment, proxy, cookie or credential discovery. */
export class MediaHttp {
  readonly transport: ProviderHttpTransport;

  constructor(options: { ggOrigin?: string } = {}) {
    const ggOrigin = options.ggOrigin;
    if (ggOrigin !== undefined && ggOrigin !== "http://127.0.0.1:3041") fail();
    this.transport = Object.freeze({
      request: (input, init) => execute("provider", input, init, ggOrigin),
      download: (input, init) => execute("download", input, init),
    });
  }
}

type Lane = "provider" | "download";
type Route = "openrouter" | "vercel" | "fal" | "elevenlabs" | "gg" | "download";
type Address = { address: string; family: 4 | 6 };
type Request = {
  url: URL;
  method: "GET" | "HEAD" | "POST";
  headers: Headers;
  body?: Buffer;
  signal?: AbortSignal;
};
const MAX_BODY = 128 * 1024 * 1024;
const MAX_RESPONSE = 256 * 1024 * 1024;
const MAX_URL = 16 * 1024;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const)
  blocked.addSubnet(address, prefix, "ipv6");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");

function fail(): never {
  throw new Error("media_transport_failed");
}
function abort(): never {
  throw new DOMException("Media request aborted", "AbortError");
}
function check(signal?: AbortSignal): void {
  if (signal?.aborted) abort();
}
function publicAddress(value: string): Address {
  const family = isIP(value);
  if (family !== 4 && family !== 6) fail();
  if (
    family === 4
      ? blocked.check(value, "ipv4")
      : !globalV6.check(value, "ipv6") || blocked.check(value, "ipv6")
  )
    fail();
  return { address: value, family };
}
function url(value: string | URL): URL {
  const text = typeof value === "string" ? value : value.href;
  // Intentional rejection of all URL controls and raw whitespace.
  // eslint-disable-next-line no-control-regex
  if (text.length > MAX_URL || /[\x00-\x20\x7f]/.test(text)) fail();
  const target = new URL(text);
  if (
    target.username ||
    target.password ||
    target.hash ||
    target.hostname.endsWith(".")
  )
    fail();
  return target;
}
function route(
  lane: Lane,
  target: URL,
  method: string,
  ggOrigin?: string
): Route {
  const path = target.pathname;
  if (lane === "download") {
    if (
      target.protocol !== "https:" ||
      target.port ||
      !["GET", "HEAD"].includes(method)
    )
      fail();
    return "download";
  }
  if (target.origin === ggOrigin) {
    if (
      method !== "POST" ||
      !/^\/api\/v1\/ai\/(?:images|videos|music)\/generations$/.test(path)
    )
      fail();
    return "gg";
  }
  if (target.protocol !== "https:" || target.port) fail();
  if (target.hostname === "openrouter.ai") {
    if (
      (method === "POST" &&
        ["/api/v1/images", "/api/v1/videos"].includes(path)) ||
      (method === "GET" &&
        /^\/api\/v1\/videos\/[^/]+(?:\/content)?$/.test(path))
    )
      return "openrouter";
  }
  // The current producer accepts provider-owned polling URLs on this family.
  if (target.hostname.endsWith(".openrouter.ai") && method === "GET")
    return "openrouter";
  if (
    target.hostname === "ai-gateway.vercel.sh" &&
    method === "POST" &&
    /^\/v3\/ai\/(?:image|video)-model$/.test(path)
  )
    return "vercel";
  if (
    target.hostname === "queue.fal.run" &&
    ["GET", "POST"].includes(method) &&
    path !== "/"
  )
    return "fal";
  if (
    target.hostname === "api.elevenlabs.io" &&
    ((method === "GET" && path === "/v2/voices") ||
      (method === "POST" &&
        (path === "/v1/sound-generation" ||
          /^\/v1\/text-to-speech\/[^/]+$/.test(path))))
  )
    return "elevenlabs";
  return fail();
}
function snapshot(
  lane: Lane,
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
  ggOrigin?: string
): Request {
  // This host accepts the current SDK's URL/JSON/byte requests, not arbitrary
  // Request streams, caller-selected agents or a general fetch capability.
  if (typeof input !== "string" && !(input instanceof URL)) fail();
  if (init?.credentials && init.credentials !== "omit") fail();
  if (init?.redirect && !["manual", "error"].includes(init.redirect)) fail();
  if (init?.referrer && init.referrer !== "no-referrer") fail();
  const target = url(input);
  const method = init?.method ?? "GET";
  const destination = route(lane, target, method, ggOrigin);
  const headers = new Headers(init?.headers);
  let size = 0;
  for (const [name, value] of headers) {
    size += Buffer.byteLength(name) + Buffer.byteLength(value);
    if (
      size > 32 * 1024 ||
      value.length > 8192 ||
      // eslint-disable-next-line no-control-regex -- no header controls.
      /[\x00-\x1f\x7f]/.test(value)
    )
      fail();
    const common = ["accept", "content-type", "user-agent"].includes(name);
    const credential =
      destination === "elevenlabs"
        ? name === "xi-api-key"
        : destination !== "download" && name === "authorization";
    const gateway =
      destination === "vercel" &&
      (name === "ai-gateway-protocol-version" ||
        name === "ai-gateway-auth-method" ||
        name === "ai-model-id" ||
        /^ai-(?:image|video)-model-specification-version$/.test(name));
    if (!common && !credential && !gateway) fail();
  }
  if (destination === "download") {
    if (
      [...headers.keys()].some(
        (name) => !["accept", "user-agent"].includes(name)
      )
    )
      fail();
  } else if (destination === "elevenlabs") {
    if (!headers.get("xi-api-key")) fail();
  } else {
    const authorization = headers.get("authorization");
    if (
      !authorization ||
      !(destination === "fal"
        ? /^Key \S+$/.test(authorization)
        : /^Bearer \S+$/.test(authorization))
    )
      fail();
  }
  // Avoid transparent compression and its separate decompression-memory bound.
  // A response ignoring this negotiation is refused below.
  headers.set("accept-encoding", "identity");
  const raw = init?.body;
  let body: Buffer | undefined;
  if (raw !== undefined && raw !== null) {
    if (
      method !== "POST" ||
      !headers.get("content-type")?.startsWith("application/json")
    )
      fail();
    if (typeof raw === "string") {
      if (Buffer.byteLength(raw) > MAX_BODY) fail();
      body = Buffer.from(raw);
    } else if (raw instanceof Uint8Array || raw instanceof ArrayBuffer) {
      if (raw.byteLength > MAX_BODY) fail();
      body = Buffer.from(
        raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw
      );
    } else fail();
  }
  const signal = init?.signal ?? undefined;
  check(signal);
  return {
    url: target,
    method: method as Request["method"],
    headers,
    body,
    signal,
  };
}

async function resolve(
  target: URL,
  signal: AbortSignal,
  ggOrigin?: string
): Promise<Address> {
  check(signal);
  if (target.origin === ggOrigin) return { address: "127.0.0.1", family: 4 };
  const hostname = target.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) return publicAddress(hostname);
  const deadline = performance.now() + 5_000;
  const pending = lookup(hostname, { all: true, verbatim: true });
  // Observe a DNS result even when it arrives after cancellation/deadline.
  const addresses = await new Promise<Awaited<typeof pending>>(
    (accept, reject) => {
      const aborted = () =>
        finish(() =>
          reject(new DOMException("Media request aborted", "AbortError"))
        );
      const timer = setTimeout(
        () => finish(() => reject(new Error("media_transport_failed"))),
        5_000
      );
      const finish = (operation: () => void) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", aborted);
        operation();
      };
      signal.addEventListener("abort", aborted, { once: true });
      pending.then(
        (value) => finish(() => accept(value)),
        () => finish(() => reject(new Error("media_transport_failed")))
      );
      if (signal.aborted) aborted();
    }
  );
  check(signal);
  if (performance.now() >= deadline) fail();
  if (!addresses.length || addresses.length > 32) fail();
  const validated = addresses.map((item) => {
    const value = publicAddress(item.address);
    if (value.family !== item.family) fail();
    return value;
  });
  return validated[0]!;
}

async function execute(
  lane: Lane,
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
  ggOrigin?: string
): Promise<Response> {
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let remove = () => {};
  try {
    const request = snapshot(lane, input, init, ggOrigin);
    controller = new AbortController();
    const aborted = () => controller!.abort();
    request.signal?.addEventListener("abort", aborted, { once: true });
    remove = () => request.signal?.removeEventListener("abort", aborted);
    if (request.signal?.aborted) aborted();
    timer = setTimeout(aborted, 600_000);
    const cleanup = () => {
      clearTimeout(timer);
      remove();
    };
    for (let hop = 0; ; hop++) {
      check(controller.signal);
      route(lane, request.url, request.method, ggOrigin);
      const address = await resolve(request.url, controller.signal, ggOrigin);
      check(controller.signal);
      const response = await open(
        request,
        address,
        controller.signal,
        lane,
        cleanup
      );
      if (lane !== "download" || !REDIRECTS.has(response.status))
        return response;
      await response.body?.cancel();
      if (hop >= 3 || init?.redirect === "error") fail();
      const location = response.headers.get("location");
      if (!location) fail();
      request.url = url(new URL(location, request.url));
    }
  } catch (error) {
    controller?.abort();
    clearTimeout(timer);
    remove();
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    return fail();
  }
}

function open(
  request: Request,
  address: Address,
  signal: AbortSignal,
  lane: Lane,
  cleanup: () => void
): Promise<Response> {
  return new Promise((accept, reject) => {
    check(signal);
    const secure = request.url.protocol === "https:";
    let incoming: IncomingMessage | undefined;
    let client: http.ClientRequest | undefined;
    let connecting: ReturnType<typeof setTimeout> | undefined;
    let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
    let returned = false,
      closed = false;
    const failed = () => {
      if (closed) return;
      closed = true;
      clearTimeout(connecting);
      client?.destroy();
      incoming?.destroy();
      cleanup();
      const error = signal.aborted
        ? new DOMException("Media request aborted", "AbortError")
        : new Error("media_transport_failed");
      stream?.error(error);
      if (!returned) reject(error);
    };
    const options: https.RequestOptions & { autoSelectFamily: false } = {
      protocol: request.url.protocol,
      hostname: request.url.hostname.replace(/^\[|\]$/g, ""),
      port: request.url.port || (secure ? 443 : 80),
      path: request.url.pathname + request.url.search,
      method: request.method,
      headers: Object.fromEntries(request.headers),
      agent: false,
      family: address.family,
      autoSelectFamily: false,
      maxHeaderSize: 32 * 1024,
      ...(secure
        ? {
            servername: isIP(request.url.hostname.replace(/^\[|\]$/g, ""))
              ? ""
              : request.url.hostname,
            rejectUnauthorized: true,
          }
        : {}),
      lookup: (_hostname, options, callback) => {
        if (signal.aborted) {
          callback(new Error("media_transport_failed"), "", address.family);
          return;
        }
        if (options.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      },
      signal,
    };
    client = (secure ? https : http).request(options, (response) => {
      if (closed) {
        response.destroy();
        return;
      }
      incoming = response;
      clearTimeout(connecting);
      try {
        check(signal);
        const status = response.statusCode ?? 0;
        if (
          status < 200 ||
          status > 599 ||
          (lane === "provider" && status >= 300 && status < 400)
        )
          fail();
        const headers = new Headers();
        for (let index = 0; index < response.rawHeaders.length; index += 2) {
          const name = response.rawHeaders[index]!,
            value = response.rawHeaders[index + 1]!;
          if (name.toLowerCase() !== "set-cookie") headers.append(name, value);
        }
        const encoding = headers.get("content-encoding");
        const length = headers.get("content-length");
        if (
          length &&
          (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))
        )
          fail();
        const unsafeBody =
          Boolean(encoding && encoding !== "identity") ||
          Number(length) > MAX_RESPONSE;
        if (unsafeBody && status < 400) fail();
        if (
          // Preserve access-denied status without reading an oversized or
          // compressed error body. The SDK owns provider error classification.
          unsafeBody ||
          REDIRECTS.has(status) ||
          request.method === "HEAD" ||
          [204, 205, 304].includes(status)
        ) {
          const result = new Response(null, { status, headers });
          closed = true;
          response.destroy();
          if (!REDIRECTS.has(status)) cleanup();
          returned = true;
          accept(result);
          return;
        }
        let bytes = 0;
        response.pause();
        const body = new ReadableStream<Uint8Array>(
          {
            start(value) {
              stream = value;
              response.on("data", (chunk: Buffer) => {
                try {
                  check(signal);
                  bytes += chunk.byteLength;
                  if (bytes > MAX_RESPONSE) fail();
                  value.enqueue(chunk);
                  if ((value.desiredSize ?? 0) <= 0) response.pause();
                } catch {
                  failed();
                }
              });
              response.once("end", () => {
                if (!closed) {
                  closed = true;
                  value.close();
                  cleanup();
                }
              });
              response.on("error", failed);
              response.once("aborted", failed);
              response.once("close", () => {
                if (!response.complete) failed();
              });
            },
            pull() {
              response.resume();
            },
            cancel() {
              if (!closed) {
                closed = true;
                response.destroy();
                client?.destroy();
                cleanup();
              }
            },
          },
          { highWaterMark: 64 * 1024, size: (chunk) => chunk.byteLength }
        );
        const result = new Response(body, { status, headers });
        returned = true;
        accept(result);
      } catch {
        failed();
      }
    });
    connecting = setTimeout(failed, 15_000);
    client.once("socket", (socket) => {
      socket.once(secure ? "secureConnect" : "connect", () =>
        clearTimeout(connecting)
      );
    });
    client.on("error", failed);
    client.once("upgrade", (_response, socket) => {
      socket.destroy();
      failed();
    });
    // Synchronous media jobs may legitimately hold the response for minutes.
    // Connect/TLS has its own short bound; the invocation retains the total cap.
    client.setTimeout(600_000, failed);
    client.end(request.body);
  });
}
