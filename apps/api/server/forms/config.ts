/** API-local configuration; no browser, editor, or cookie-session fallback. */
export namespace config {
  export function required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing server configuration: ${name}`);
    return value;
  }
  function origin(name: string): string {
    const url = new URL(required(name));
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      !(url.protocol === "https:" || (url.protocol === "http:" && loopback)) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error(`Invalid origin configuration: ${name}`);
    }
    return url.origin;
  }
  export function apiOrigin(): string {
    return origin("GRIDA_OPEN_API_ORIGIN");
  }
  export function webOrigin(): string {
    return origin("GRIDA_WEB_ORIGIN");
  }
  export function supabaseUrl(): string {
    return origin("SUPABASE_URL");
  }
}

/** Abort the underlying fetch on deadline; never replay a write. */
export const fetchWithDeadline: typeof fetch = (input, init) => {
  const existing =
    init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const timeout = AbortSignal.timeout(15_000);
  return fetch(input, {
    ...init,
    signal: existing ? AbortSignal.any([existing, timeout]) : timeout,
  });
};
