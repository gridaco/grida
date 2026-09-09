import { apiOperations } from "./operations";

/** GRIDA-SEC-012 — machine requests never acquire browser/tenant authority. */
export namespace apiPolicy {
  type Environment = Readonly<Record<string, string | undefined>>;

  // Next resolves percent-encoded filesystem paths. Its pre-proxy web redirects
  // must exclude those aliases too, including encoded uppercase ASCII letters.
  const encodedPrefix = [..."api/v1"]
    .map((character) => {
      const forms = new Set([
        character,
        `%${character.charCodeAt(0).toString(16)}`,
        `%${character.toUpperCase().charCodeAt(0).toString(16)}`,
      ]);
      return `(?:${[...forms].join("|")})`;
    })
    .join("");
  export const webPathGuard = `(?!${encodedPrefix}(?:/|%2f|$))`;
  const namespace = new RegExp(`^/${encodedPrefix}(?:/|%2f|$)`, "i");

  export function matches(pathname: string): boolean {
    // Classify only the namespace, even if an unknown suffix has bad escapes.
    // Exact raw operation lookup subsequently rejects every encoded/cased alias.
    return namespace.test(pathname);
  }

  /** A null result admits a registered route, not an authenticated caller. */
  export function respond(
    request: Request,
    env: Environment = process.env
  ): Response | null {
    const pathname = new URL(request.url).pathname;
    if (!matches(pathname)) throw new Error("Not a machine API request");

    let allowed: readonly string[];
    try {
      allowed = authorities(env);
      if (
        env.GRIDA_API_MAINTENANCE !== undefined &&
        !["", "0", "1"].includes(env.GRIDA_API_MAINTENANCE)
      )
        throw new Error("Invalid maintenance configuration");
    } catch {
      return error(
        request,
        503,
        "not_configured",
        "API access is not configured."
      );
    }

    // Host is checked against server configuration. Forwarded headers and
    // tenant resolution never expand this set or choose an upstream service.
    const host = request.headers.get("host");
    if (!host || !allowed.includes(host.toLowerCase())) {
      return error(request, 404, "not_found", "API endpoint not found.");
    }
    if (!apiOperations.find(pathname)) {
      return error(request, 404, "not_found", "API endpoint not found.");
    }
    if (env.GRIDA_API_MAINTENANCE === "1") {
      return error(
        request,
        503,
        "temporarily_unavailable",
        "The API is temporarily unavailable. Try again."
      );
    }
    return null;
  }

  function authorities(env: Environment): readonly string[] {
    if (env.GRIDA_API_ORIGIN !== undefined) {
      return [authority(env.GRIDA_API_ORIGIN)];
    }
    // Preserve the application's configured public and deployment addresses.
    // A self-hosted origin overrides these with GRIDA_API_ORIGIN, including
    // explicitly local production-mode fixtures.
    const hosts = [
      authority(
        env.NEXT_PUBLIC_URL
          ? `https://${env.NEXT_PUBLIC_URL}`
          : "https://grida.co"
      ),
    ];
    if (env.VERCEL === "1" && env.VERCEL_URL) {
      hosts.push(authority(`https://${env.VERCEL_URL}`));
    }
    if (env.VERCEL === "1" && env.VERCEL_BRANCH_URL) {
      hosts.push(authority(`https://${env.VERCEL_BRANCH_URL}`));
    }
    if (env.NODE_ENV === "development" && env.VERCEL !== "1") {
      const port = env.PORT || "3000";
      if (!/^[1-9]\d{0,4}$/.test(port) || Number(port) > 65535)
        throw new Error("Invalid local port");
      hosts.push(authority(`http://127.0.0.1:${port}`));
      hosts.push(authority(`http://localhost:${port}`));
    }
    return hosts;
  }

  function authority(value: string): string {
    const url = new URL(value);
    if (
      url.origin !== value ||
      url.username ||
      url.password ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["127.0.0.1", "localhost"].includes(url.hostname)
        ))
    )
      throw new Error("Invalid API origin");
    return url.host;
  }

  function error(
    request: Request,
    status: number,
    code: string,
    message: string
  ): Response {
    const response = Response.json(
      { error: { code, message } },
      {
        status,
        headers: {
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
          "x-content-type-options": "nosniff",
        },
      }
    );
    return request.method === "HEAD"
      ? new Response(null, { status, headers: response.headers })
      : response;
  }
}
