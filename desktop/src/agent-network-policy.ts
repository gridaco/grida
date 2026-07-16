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
    const providerOrigins = [
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
    return [
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
        origins: providerOrigins.filter((origin) =>
          origin.startsWith("https:")
        ),
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
    return { grant, method, url, headers };
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
