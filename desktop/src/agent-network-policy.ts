/**
 * GRIDA-SEC-004 — authorization policy for the private provider-HTTP channel.
 *
 * This module is shared by the Electron main-process broker and its tests. It
 * deliberately knows nothing about Electron, streams, or the agent package:
 * its one job is to turn an explicit grant plus request metadata into either a
 * small, canonical request or a refusal.
 */
export namespace AgentNetworkPolicy {
  export type Lane = "provider" | "download";

  export type Grant = Readonly<{
    id: string;
    lane: Lane;
    /** Exact origins or strict `scheme://*.suffix` entries. */
    origins: readonly string[];
  }>;

  export type RequestMetadata = Readonly<{
    grant_id: string;
    method: string;
    url: string;
    headers: readonly (readonly [string, string])[];
  }>;

  export type AuthorizedRequest = Readonly<{
    grant: Grant;
    method: string;
    url: URL;
    headers: Headers;
  }>;

  export const BUILTIN_PROVIDER_GRANT_ID = "provider:built-in";
  export const TRIPO_UPLOAD_GRANT_ID = "provider:tripo-upload";
  export const PROVIDER_ASSET_GRANT_ID = "download:provider-assets";

  const MAX_HEADER_COUNT = 128;
  const MAX_HEADER_BYTES = 64 * 1024;
  const MAX_HEADER_VALUE_BYTES = 16 * 1024;
  const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
  const PROVIDER_METHODS = new Set([
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ]);
  const DOWNLOAD_METHODS = new Set(["GET", "HEAD"]);
  const FORBIDDEN_HEADERS = new Set([
    "connection",
    "content-length",
    "cookie",
    "cookie2",
    "host",
    "keep-alive",
    "proxy-authorization",
    "proxy-authenticate",
    "proxy-connection",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ]);
  const DOWNLOAD_HEADERS = new Set([
    "accept",
    "accept-encoding",
    "if-modified-since",
    "if-none-match",
    "range",
    "user-agent",
  ]);

  /**
   * Destinations owned by built-in provider adapters. Callback hosts are
   * included only where the producer already validates the same suffix before
   * attaching a credential (fal/OpenRouter media polling).
   */
  export function builtInGrants(ggOrigin: string): Grant[] {
    const canonicalGgOrigin = canonicalOrigin(ggOrigin);
    const providerAssetOrigins = [
      canonicalGgOrigin,
      "https://openrouter.ai",
      "https://*.openrouter.ai",
      "https://ai-gateway.vercel.sh",
      "https://queue.fal.run",
      "https://fal.run",
      "https://*.fal.run",
      "https://fal.media",
      "https://*.fal.media",
    ];
    const providerOrigins = [
      ...providerAssetOrigins,
      // GRIDA-SEC-008 — exact OAuth and inference authorities for the native
      // ChatGPT-subscription provider. Neither origin joins the download lane.
      "https://auth.openai.com",
      "https://chatgpt.com",
      // ElevenLabs returns generated audio bytes on the credential-bearing
      // request itself. It is an exact provider origin and must never join the
      // credential-free provider-asset download lane.
      "https://api.elevenlabs.io",
      // Tripo's credential belongs only to its exact first-party API origin.
      "https://openapi.tripo3d.ai",
    ];
    return [
      {
        id: TRIPO_UPLOAD_GRANT_ID,
        lane: "provider",
        origins: ["https://tripo-data.s3.us-west-2.amazonaws.com"],
      },
      {
        id: BUILTIN_PROVIDER_GRANT_ID,
        lane: "provider",
        origins: providerOrigins,
      },
      {
        id: PROVIDER_ASSET_GRANT_ID,
        lane: "download",
        // Credential-free result downloads are not a generic public fetch
        // lane. Keep them inside namespaces already owned by the providers.
        // An output URL on another CDN is refused until that origin has its
        // own explicit host grant ceremony.
        origins: [
          ...providerAssetOrigins,
          // Tripo documents the CDN and returns the regional data origin in
          // live results. Neither joins providerOrigins: no API keys go here.
          "https://cdn.tripo3d.ai",
          "https://tripo-data.rg1.data.tripo3d.com",
        ].filter((origin) => origin.startsWith("https:")),
      },
    ];
  }

  /** Canonical origin for a human-approved custom provider endpoint. */
  export function canonicalOrigin(input: string): string {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      throw new Error("provider endpoint must be a valid URL");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("provider endpoint must use HTTP or HTTPS");
    }
    if (url.username || url.password) {
      throw new Error("provider endpoint must not contain URL credentials");
    }
    return url.origin;
  }

  export function authorize(
    grants: readonly Grant[],
    metadata: RequestMetadata
  ): AuthorizedRequest {
    const grant = grants.find(
      (candidate) => candidate.id === metadata.grant_id
    );
    if (!grant) throw new Error("unknown provider-network grant");

    const method = metadata.method.toUpperCase();
    const methods =
      grant.lane === "provider" ? PROVIDER_METHODS : DOWNLOAD_METHODS;
    if (!methods.has(method)) {
      throw new Error(`${grant.lane} HTTP method is not allowed`);
    }

    let url: URL;
    try {
      url = new URL(metadata.url);
    } catch {
      throw new Error("provider-network request URL is invalid");
    }
    if (url.username || url.password || url.hash) {
      throw new Error("provider-network URL contains forbidden components");
    }
    if (!grantAllowsUrl(grant, url)) {
      throw new Error("provider-network destination is not granted");
    }
    if (
      grant.lane === "download" &&
      (url.protocol !== "https:" || (url.port !== "" && url.port !== "443"))
    ) {
      throw new Error(
        "provider-asset downloads require HTTPS on the default port"
      );
    }

    const headers = authorizeHeaders(grant.lane, metadata.headers);
    // GRIDA-SEC-006 / GRIDA-GG: provider — the signed object URL is the sole
    // upload authority. Never forward an API key or replay through redirects.
    if (
      grant.id === TRIPO_UPLOAD_GRANT_ID &&
      (method !== "PUT" ||
        url.pathname === "/" ||
        headers.get("content-type") !== "application/octet-stream" ||
        [...headers.keys()].some(
          (name) =>
            ![
              "content-type",
              "accept",
              "accept-encoding",
              "user-agent",
            ].includes(name)
        ))
    )
      throw new Error("Tripo upload request is not allowed");
    return { grant, method, url, headers };
  }

  /** Larger uploads are confined to the reviewed first-party GLB/file endpoint. */
  export function maxRequestBodyBytes(
    request: AuthorizedRequest | null
  ): number {
    if (
      request?.grant.id === TRIPO_UPLOAD_GRANT_ID &&
      request.method === "PUT" &&
      request.url.origin === "https://tripo-data.s3.us-west-2.amazonaws.com" &&
      request.headers.get("content-type") === "application/octet-stream"
    )
      return 60_000_000;
    if (
      request?.grant.id === BUILTIN_PROVIDER_GRANT_ID &&
      request.grant.lane === "provider" &&
      request.method === "POST" &&
      request.url.origin === "https://openapi.tripo3d.ai" &&
      request.url.pathname === "/v3/files" &&
      !request.url.search &&
      /^multipart\/form-data; boundary=[A-Za-z0-9_-]{1,70}$/.test(
        request.headers.get("content-type") ?? ""
      )
    )
      return 64 * 1024 * 1024;
    return 32 * 1024 * 1024;
  }

  export function grantAllowsUrl(grant: Grant, url: URL): boolean {
    return grant.origins.some((pattern) => {
      if (!pattern.includes("*")) return url.origin === pattern;
      const wildcard = /^(https?):\/\/\*\.([^/:]+)(?::(\d+))?$/.exec(pattern);
      if (!wildcard) return false;
      const [, scheme, suffix, port] = wildcard;
      const expectedPort = port ?? (scheme === "https" ? "443" : "80");
      const actualPort = url.port || (url.protocol === "https:" ? "443" : "80");
      return (
        url.protocol === `${scheme}:` &&
        actualPort === expectedPort &&
        url.hostname.endsWith(`.${suffix}`)
      );
    });
  }

  function authorizeHeaders(
    lane: Lane,
    pairs: readonly (readonly [string, string])[]
  ): Headers {
    if (pairs.length > MAX_HEADER_COUNT) {
      throw new Error("provider-network request has too many headers");
    }
    const headers = new Headers();
    let bytes = 0;
    for (const pair of pairs) {
      if (!Array.isArray(pair) || pair.length !== 2) {
        throw new Error("provider-network header is malformed");
      }
      const [rawName, value] = pair;
      if (
        typeof rawName !== "string" ||
        typeof value !== "string" ||
        !HEADER_NAME.test(rawName) ||
        value.includes("\0") ||
        value.includes("\r") ||
        value.includes("\n")
      ) {
        throw new Error("provider-network header is invalid");
      }
      const name = rawName.toLowerCase();
      if (FORBIDDEN_HEADERS.has(name)) {
        throw new Error(`provider-network header ${name} is forbidden`);
      }
      if (lane === "download" && !DOWNLOAD_HEADERS.has(name)) {
        throw new Error(`provider-asset header ${name} is not allowed`);
      }
      const valueBytes = Buffer.byteLength(value);
      if (valueBytes > MAX_HEADER_VALUE_BYTES) {
        throw new Error("provider-network header value is too large");
      }
      bytes += Buffer.byteLength(name) + valueBytes;
      if (bytes > MAX_HEADER_BYTES) {
        throw new Error("provider-network headers are too large");
      }
      headers.append(name, value);
    }
    return headers;
  }
}
