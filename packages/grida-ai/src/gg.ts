// GRIDA-SEC-004 / GRIDA-SEC-006 — scoped credentials stay on the host-authorized request lane.
// GRIDA-GG: token — shared live-token and HTTP status contract.
import type { GgTokenSource } from "./gg-session";
import { ProviderHttp } from "./http";
/**
 * The hosted session is missing or expired. The literal code LEADS the
 * message: mid-run errors cross Electron's `contextBridge`, which strips
 * custom props — the renderer detects by message substring (the
 * `isWriteConflict` idiom).
 */
export class GridaGatewayAuthError extends Error {
  readonly code = "gg_token_expired" as const;
  constructor() {
    super("gg_token_expired: the Grida session token is missing or expired");
    this.name = "GridaGatewayAuthError";
  }
}

/** The org's AI credit balance can't cover the call (server 402). */
export class GridaGatewayCreditsError extends Error {
  readonly code = "insufficient_credits" as const;
  constructor() {
    super(
      "insufficient_credits: the organization's AI credit balance is too low"
    );
    this.name = "GridaGatewayCreditsError";
  }
}

/** `<base>/api/v1/ai` — `@ai-sdk/openai-compatible` appends the paths. */
export function gridaGatewayApiBase(baseUrl: string): string {
  return new URL("/api/v1/ai", baseUrl).toString();
}

/** The live scoped token, or throw the typed auth error (never a bare null). */
export function readGgToken(session: GgTokenSource): string {
  const token = session.getAccessToken();
  if (!token) throw new GridaGatewayAuthError();
  return token;
}

/**
 * Map the two actionable hosted-response failures to typed, model-safe
 * errors — the single source for this contract, shared by the text factory
 * and the media adapters. Every other status is left to the caller. Never
 * embed upstream body text (GRIDA-SEC-004 posture). Drains the unconsumed
 * body before throwing so undici can return the socket to the pool
 * (unconsumed bodies pin the connection).
 */
export async function throwOnGgHttpError(res: Response): Promise<void> {
  if (res.status === 401 || res.status === 402) {
    await res.body?.cancel().catch(() => {});
    if (res.status === 401) throw new GridaGatewayAuthError();
    throw new GridaGatewayCreditsError();
  }
}

export function joinApi(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).toString();
}

export async function postHosted<T>(args: {
  session: GgTokenSource;
  url: string;
  body: unknown;
  scope: string;
  abortSignal?: AbortSignal;
  provider_http: ProviderHttp;
  max_response_bytes?: number;
}): Promise<T> {
  const res = await args.provider_http.request(args.url, {
    method: "POST",
    signal: args.abortSignal,
    headers: {
      authorization: `Bearer ${readGgToken(args.session)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args.body),
  });
  await throwOnGgHttpError(res);
  if (!res.ok) {
    // Model-safe by construction: status only, never the body. Drain the
    // body first so undici releases the socket.
    await res.body?.cancel().catch(() => {});
    throw new Error(`[${args.scope}] hosted request failed (${res.status})`);
  }
  if (args.max_response_bytes === undefined) {
    // Preserve the established generic image/video response behavior.
    return (await res.json()) as T;
  }
  return readHostedJsonBounded<T>(res, args.max_response_bytes, args.scope);
}

async function readHostedJsonBounded<T>(
  response: Response,
  maxBytes: number,
  scope: string
): Promise<T> {
  const contentLength = response.headers.get("content-length");
  if (
    contentLength !== null &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > maxBytes
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`[${scope}] hosted response was too large`);
  }
  if (!response.body) {
    throw new Error(`[${scope}] hosted response was malformed`);
  }

  const reader = response.body.getReader();
  let data = new Uint8Array();
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const nextTotal = total + value.byteLength;
      if (!Number.isSafeInteger(nextTotal) || nextTotal > maxBytes) {
        throw new Error(`[${scope}] hosted response was too large`);
      }
      if (nextTotal > data.byteLength) {
        const capacity = Math.min(
          maxBytes,
          Math.max(
            nextTotal,
            data.byteLength === 0 ? 64 * 1024 : data.byteLength * 2
          )
        );
        const grown = new Uint8Array(capacity);
        grown.set(data.subarray(0, total));
        data = grown;
      }
      data.set(value, total);
      total = nextTotal;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }

  try {
    return JSON.parse(new TextDecoder().decode(data.subarray(0, total))) as T;
  } catch {
    throw new Error(`[${scope}] hosted response was malformed`);
  }
}
