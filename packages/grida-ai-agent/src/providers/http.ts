// GRIDA-SEC-004 — scoped host transport for the agent tenant's provider egress.
/**
 * Host-fed HTTP operations for the in-process provider layer.
 *
 * This is deliberately narrower than a networking abstraction: provider
 * adapters may use {@link ProviderHttp.request} for their named upstream
 * operations, and may use {@link ProviderHttp.download} only for
 * credential-free provider result/asset downloads. Tools, shell processes, and
 * external-agent processes never receive this object.
 */

import {
  DownloadError,
  type Experimental_DownloadFunction as DownloadFunction,
} from "ai";

const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const DATA_URL_PREFIX = "data:";

type ProviderHttpLimits = Readonly<{
  /** Internal test seam; production retains the AI SDK's 2 GiB limit. */
  max_download_bytes?: number;
}>;

/**
 * The server-construction contract a host may supply.
 *
 * Both operations are required when the transport is present so a host cannot
 * accidentally leave credential-free downloads on ambient fetch while routing
 * provider requests elsewhere. This is an authority boundary, not a pre-authorized
 * request queue: before I/O the host MUST inspect and authorize the concrete
 * URL, method, headers, redirect behavior, and resolved address/route. It must
 * apply that decision to every redirect hop as well. The package owns
 * provider-specific request shaping, credential injection, basic URL syntax
 * checks, response parsing, and download byte bounds; it cannot enforce the
 * host's destination or routing policy from behind a fetch-shaped callback.
 */
export type ProviderHttpTransport = Readonly<{
  /**
   * Provider-owned requests. This operation may receive Authorization headers
   * and is also used for credential-free configured-endpoint discovery and
   * inference, because both belong to the trusted provider path.
   *
   * Treat `input` and `init` as untrusted authority requests. In particular,
   * configured endpoints are user-selected and may intentionally be local;
   * the host decides whether that destination is valid for its environment.
   */
  request: typeof globalThis.fetch;
  /**
   * Credential-free provider result/asset downloads. The package never
   * supplies provider credentials to this operation. Inline `data:` URLs are
   * decoded locally and never cross either host operation. The host authorizes
   * every concrete origin; this contract does not grant general web access.
   *
   * The package rejects obvious non-public URL literals, but the host remains
   * responsible for DNS/address validation and redirect-hop authorization,
   * which cannot be established before the callback performs resolution.
   */
  download: typeof globalThis.fetch;
}>;

/**
 * Resolved provider HTTP operations used inside the package.
 *
 * The ambient fallback dereferences `globalThis.fetch` per call rather than at
 * construction/import time. CLI hosts and tests that omit the transport retain
 * the existing process-global behavior, including late test stubs.
 */
export class ProviderHttp {
  readonly request: typeof globalThis.fetch;
  readonly download: typeof globalThis.fetch;
  /** Whether these operations cross an explicit host authority boundary. */
  readonly isHostRouted: boolean;
  /** AI SDK URL-part lowering, bound only to the download operation. */
  readonly downloadParts: DownloadFunction;
  private readonly maxDownloadBytes: number;

  constructor(
    transport?: ProviderHttpTransport,
    limits: ProviderHttpLimits = {}
  ) {
    this.isHostRouted = transport !== undefined;
    this.maxDownloadBytes = limits.max_download_bytes ?? MAX_DOWNLOAD_BYTES;
    if (
      !Number.isSafeInteger(this.maxDownloadBytes) ||
      this.maxDownloadBytes < 0
    ) {
      throw new RangeError("max_download_bytes must be a non-negative integer");
    }
    this.request = transport
      ? (input, init) => transport.request(input, init)
      : (input, init) => globalThis.fetch(input, init);
    this.download = transport
      ? (input, init) => transport.download(input, init)
      : (input, init) => globalThis.fetch(input, init);
    this.downloadParts = (parts) =>
      Promise.all(
        parts.map((part) =>
          part.isUrlSupportedByModel ? null : this.downloadPart(part.url)
        )
      );
  }

  private async downloadPart(url: URL): Promise<{
    data: Uint8Array;
    mediaType: string | undefined;
  }> {
    // A fragment is not part of a data URL's body. Preserve the query (the URL
    // serializer does) but exclude the fragment, matching the URL Standard's
    // data-URL processor rather than accidentally decoding `#fragment` bytes.
    const text =
      url.protocol === "data:"
        ? (() => {
            const inline = new URL(url);
            inline.hash = "";
            return inline.toString();
          })()
        : url.toString();
    if (url.protocol === "data:") {
      return decodeDataUrl(text, this.maxDownloadBytes);
    }
    assertPublicDownloadUrl(url);
    try {
      const response = await this.download(text);
      if (response.redirected) {
        try {
          assertPublicDownloadUrl(new URL(response.url));
        } catch (error) {
          await cancelResponseBody(response);
          throw error;
        }
      }
      if (!response.ok) {
        await cancelResponseBody(response);
        throw new DownloadError({
          url: text,
          statusCode: response.status,
          statusText: response.statusText,
        });
      }
      return {
        data: await readBodyBounded(response, text, this.maxDownloadBytes),
        mediaType: response.headers.get("content-type") ?? undefined,
      };
    } catch (error) {
      if (DownloadError.isInstance(error)) throw error;
      throw new DownloadError({ url: text, cause: error });
    }
  }
}

/** Match the AI SDK's public-network-download SSRF posture before host I/O. */
function assertPublicDownloadUrl(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DownloadError({
      url: url.toString(),
      message: "download URL must be http(s) or data",
    });
  }
  if (url.username || url.password) {
    throw new DownloadError({
      url: url.toString(),
      message: "download URL must not contain credentials",
    });
  }
  const host = url.hostname.toLowerCase();
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    isPrivateIpLiteral(host)
  ) {
    throw new DownloadError({
      url: url.toString(),
      message: "download URL must be public",
    });
  }
}

/** Decode RFC 2397 inline content without invoking either host operation. */
function decodeDataUrl(
  url: string,
  maxBytes: number
): { data: Uint8Array; mediaType: string } {
  const comma = url.indexOf(",");
  if (!url.startsWith(DATA_URL_PREFIX) || comma < DATA_URL_PREFIX.length) {
    throw dataUrlError(url, "invalid data URL");
  }

  const metadata = url.slice(DATA_URL_PREFIX.length, comma);
  const fields = metadata.split(";");
  const declaredMediaType = fields.shift() ?? "";
  const base64 = fields.at(-1)?.toLowerCase() === "base64";
  if (base64) fields.pop();
  if (fields.some((field) => field.toLowerCase() === "base64")) {
    throw dataUrlError(url, "invalid data URL metadata");
  }

  const mediaType = declaredMediaType
    ? [declaredMediaType, ...fields].join(";")
    : fields.length > 0
      ? `text/plain;${fields.join(";")}`
      : "text/plain;charset=US-ASCII";
  if (!mediaType || /[\r\n]/.test(mediaType)) {
    throw dataUrlError(url, "invalid data URL media type");
  }

  const payload = url.slice(comma + 1);
  return {
    data: base64
      ? decodeBase64DataUrl(payload, url, maxBytes)
      : decodePercentDataUrl(payload, url, maxBytes),
    mediaType,
  };
}

function decodeBase64DataUrl(
  payload: string,
  url: string,
  maxBytes: number
): Uint8Array {
  const compact = payload.replace(/[\t\n\f\r ]/g, "");
  const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
  const valid =
    /^[A-Za-z0-9+/]*={0,2}$/.test(compact) &&
    compact.length % 4 !== 1 &&
    (padding === 0 || compact.length % 4 === 0);
  if (!valid) throw dataUrlError(url, "invalid base64 data URL");

  const estimatedBytes = Math.floor((compact.length * 3) / 4) - padding;
  assertDataUrlSize(url, estimatedBytes, maxBytes);
  const buffer = Buffer.from(compact, "base64");
  assertDataUrlSize(url, buffer.byteLength, maxBytes);
  // Keep the transport result runtime-neutral. `Buffer` subclasses
  // Uint8Array but leaks a Node-specific constructor through equality,
  // serialization, and callers that inspect `data.constructor`.
  return Uint8Array.from(buffer);
}

function decodePercentDataUrl(
  payload: string,
  url: string,
  maxBytes: number
): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let textStart = 0;
  let index = 0;

  const append = (chunk: Uint8Array) => {
    total += chunk.byteLength;
    assertDataUrlSize(url, total, maxBytes);
    chunks.push(chunk);
  };

  while (index < payload.length) {
    if (!isPercentByte(payload, index)) {
      index++;
      continue;
    }
    if (textStart < index)
      append(encoder.encode(payload.slice(textStart, index)));

    // Cap each temporary number array; a long `%XX` run stays streaming and
    // trips the byte bound before a large secondary allocation is attempted.
    const bytes: number[] = [];
    while (isPercentByte(payload, index) && bytes.length < 8192) {
      bytes.push(Number.parseInt(payload.slice(index + 1, index + 3), 16));
      index += 3;
    }
    append(Uint8Array.from(bytes));
    textStart = index;
  }
  if (textStart < payload.length) {
    append(encoder.encode(payload.slice(textStart)));
  }

  const data = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data;
}

function isPercentByte(value: string, offset: number): boolean {
  return (
    value[offset] === "%" &&
    offset + 2 < value.length &&
    /^[0-9A-Fa-f]{2}$/.test(value.slice(offset + 1, offset + 3))
  );
}

function assertDataUrlSize(url: string, size: number, maxBytes: number): void {
  if (size > maxBytes) {
    throw dataUrlError(
      url,
      `data URL exceeds maximum size of ${maxBytes} bytes`
    );
  }
}

function dataUrlError(url: string, message: string): DownloadError {
  return new DownloadError({ url, message });
}

function isPrivateIpLiteral(host: string): boolean {
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const bytes = ipv4.slice(1).map(Number);
    if (bytes.some((byte) => byte < 0 || byte > 255)) return false;
    const [a, b] = bytes;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const ipv6 =
    host.startsWith("[") && host.endsWith("]")
      ? host.slice(1, -1)
      : host.includes(":")
        ? host
        : null;
  if (!ipv6) return false;
  const normalized = ipv6.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:0:") ||
    normalized.startsWith("::ffff:7f") ||
    normalized.startsWith("::ffff:a00:") ||
    normalized.startsWith("::ffff:a9fe:") ||
    normalized.startsWith("::ffff:ac1") ||
    normalized.startsWith("::ffff:c0a8:")
  );
}

async function readBodyBounded(
  response: Response,
  url: string,
  maxBytes: number
): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await cancelResponseBody(response);
    throw new DownloadError({ url, message: "download is too large" });
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new DownloadError({ url, message: "download is too large" });
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const data = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data;
}

/** Release a rejected response without letting cancellation mask its error. */
async function cancelResponseBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}
