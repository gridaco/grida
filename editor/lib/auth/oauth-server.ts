import "server-only";

/** GRIDA-SEC-010 — server-owned issuer configuration and credential-scoped I/O. */
export namespace oauthServer {
  export type Config = Readonly<{
    issuer: string;
    publishableKey: string;
    clientIds: readonly string[];
  }>;

  export type ConsentConfig = Config &
    Readonly<{
      origin: string;
      redirectUris: readonly string[];
      secret: Uint8Array;
    }>;

  export type Code =
    | "unauthorized"
    | "invalid_request"
    | "invalid_authorization"
    | "forbidden"
    | "not_configured"
    | "auth_unavailable";

  const ERRORS: Record<Code, { status: number; message: string }> = {
    unauthorized: {
      status: 401,
      message: "A valid account session is required.",
    },
    invalid_request: {
      status: 400,
      message: "The authorization request is invalid.",
    },
    invalid_authorization: {
      status: 400,
      message:
        "This authorization is invalid or has expired. Start sign-in again.",
    },
    forbidden: { status: 403, message: "This authorization is not permitted." },
    not_configured: { status: 503, message: "OAuth access is not configured." },
    auth_unavailable: {
      status: 503,
      message: "The account service is unavailable. Try again.",
    },
  };

  export class Failure extends Error {
    readonly status: number;
    constructor(readonly code: Code) {
      super(ERRORS[code].message);
      this.name = "OAuthFailure";
      this.status = ERRORS[code].status;
    }
  }

  export function failure(error: unknown): Failure {
    return error instanceof Failure ? error : new Failure("auth_unavailable");
  }

  export const responseHeaders = {
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  } as const;

  export function errorResponse(error: unknown): Response {
    const e = failure(error);
    return Response.json(
      { error: { code: e.code, message: e.message } },
      {
        status: e.status,
        headers: {
          ...responseHeaders,
          ...(e.status === 401 ? { "www-authenticate": "Bearer" } : {}),
        },
      }
    );
  }

  /** Config is server-owned. No request header, cookie, or JWT selects an issuer. */
  export function config(): Config {
    const base = origin(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const clientIds = list(process.env.GRIDA_OAUTH_CLIENT_IDS);
    if (
      !publishableKey ||
      clientIds.length === 0 ||
      clientIds.some((id) => !uuid(id))
    ) {
      throw new Failure("not_configured");
    }
    return { issuer: `${base}/auth/v1`, publishableKey, clientIds };
  }

  export function consentConfig(): ConsentConfig {
    const base = config();
    const webOrigin = origin(process.env.GRIDA_OAUTH_ORIGIN);
    const redirectUris = list(process.env.GRIDA_OAUTH_REDIRECT_URIS);
    const secret = new TextEncoder().encode(
      process.env.GRIDA_OAUTH_CONSENT_SECRET ?? ""
    );
    if (secret.byteLength < 32 || redirectUris.length === 0) {
      throw new Failure("not_configured");
    }
    for (const uri of redirectUris) {
      const url = parseUrl(uri);
      if (
        !url ||
        url.protocol !== "http:" ||
        url.hostname !== "127.0.0.1" ||
        !url.port ||
        Number(url.port) < 1024 ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.href !== uri
      ) {
        throw new Failure("not_configured");
      }
    }
    return { ...base, origin: webOrigin, redirectUris, secret };
  }

  function list(value: string | undefined): string[] {
    return [
      ...new Set(
        (value ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      ),
    ];
  }

  function origin(value: string | undefined): string {
    const url = parseUrl(value);
    if (
      !url ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      (url.protocol !== "https:" &&
        !(url.protocol === "http:" && url.hostname === "127.0.0.1"))
    ) {
      throw new Failure("not_configured");
    }
    return url.origin;
  }

  export function uuid(value: unknown): value is string {
    return (
      typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value
      )
    );
  }

  export function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  export function parseUrl(value: unknown): URL | null {
    if (
      typeof value !== "string" ||
      value.length > 8192 ||
      // oxlint-disable-next-line no-control-regex -- URLs must not contain ASCII controls or literal spaces.
      /[\u0000-\u0020\u007f]/.test(value)
    )
      return null;
    try {
      return new URL(value);
    } catch {
      return null;
    }
  }

  export async function readText(
    response: Response | Request,
    maxBytes: number
  ): Promise<string> {
    if (!response.body) return "";
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new Failure("invalid_request");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  /** The issuer verifies this exact token; redirects must never carry it elsewhere. */
  export async function request(
    configuration: Config,
    fetcher: typeof fetch,
    path: string,
    token: string,
    body?: Readonly<{ action: "approve" | "deny" }>,
    webOrigin?: string
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetcher(`${configuration.issuer}${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          apikey: configuration.publishableKey,
          authorization: `Bearer ${token}`,
          ...(body ? { "content-type": "application/json" } : {}),
          ...(webOrigin ? { origin: webOrigin } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new Failure("auth_unavailable");
    }
    if (!response.ok || response.redirected) {
      await response.body?.cancel().catch(() => {});
      if (response.status === 401 || response.status === 403)
        throw new Failure("unauthorized");
      if ([400, 404, 410].includes(response.status))
        throw new Failure("invalid_authorization");
      throw new Failure("auth_unavailable");
    }
    try {
      return JSON.parse(await readText(response, 64 * 1024));
    } catch {
      throw new Failure("auth_unavailable");
    }
  }
}
