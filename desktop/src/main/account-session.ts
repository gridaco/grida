/**
 * GRIDA-SEC-005 — main-process projection of the webview cookie session.
 *
 * Main-process view of the Grida account session.
 *
 * The Chromium session owns the cookies. This client only asks the fixed
 * same-origin desktop routes for the minimum state needed to choose an app
 * surface, and never returns the account payload to its caller.
 */
export type DesktopAccountState = "signed-in" | "signed-out" | "unavailable";

const NATIVE_ACCOUNT_SESSION_HEADER =
  "sec-grida-desktop-account-session" as const;
const NATIVE_SIGN_OUT_INTENT = "sign-out" as const;

export class DesktopAccountSession {
  private readonly meUrl: string;
  private readonly signOutUrl: string;

  constructor(
    private readonly deps: {
      base_url: string;
      fetch: (url: string, init: RequestInit) => Promise<Response>;
    }
  ) {
    const origin = editorOrigin(deps.base_url);
    this.meUrl = new URL("/desktop/auth/me", origin).toString();
    this.signOutUrl = new URL("/desktop/auth/sign-out", origin).toString();
  }

  /**
   * Reads the current Grida session without leaking account fields.
   *
   * Signed-out is an ordinary result. Transport failures, redirects,
   * non-success responses, and responses outside the exact route schema are
   * deliberately collapsed into `unavailable`; callers must not mistake a
   * temporarily unreachable editor for a signed-out user.
   */
  async status(): Promise<DesktopAccountState> {
    let response: Response;
    try {
      response = await this.deps.fetch(this.meUrl, requestInit("GET"));
    } catch {
      return "unavailable";
    }

    if (response.redirected || !response.ok) {
      await discard(response);
      return "unavailable";
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return "unavailable";
    }
    return accountState(payload);
  }

  /**
   * Signs out through the fixed desktop endpoint. Its non-redirecting success
   * response is the mutation authority: a second probe cannot roll back cookie
   * deletion and therefore must not make main appear authenticated again.
   *
   * The POST carries a `Sec-`-prefixed native intent. Chromium also attaches
   * browserless Fetch Metadata to `session.fetch`; the route requires both, so
   * renderer fetch/XHR/form requests cannot invoke this mutation directly.
   *
   * The endpoint is expected to return a non-redirecting 2xx response. Native
   * navigation belongs to the entry-flow controller, not the HTTP route.
   */
  async signOut(): Promise<void> {
    let response: Response;
    try {
      response = await this.deps.fetch(this.signOutUrl, requestInit("POST"));
    } catch {
      throw signOutError();
    }

    if (response.redirected || !response.ok) {
      await discard(response);
      throw signOutError();
    }
    await discard(response);
  }
}

function editorOrigin(baseUrl: string): URL {
  const url = new URL(baseUrl);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.origin === "null"
  ) {
    throw new Error("invalid editor base URL");
  }
  return new URL(url.origin);
}

function requestInit(method: "GET" | "POST"): RequestInit {
  return {
    method,
    credentials: "include",
    cache: "no-store",
    redirect: "manual",
    // Electron's session.fetch rejects `mode: "same-origin"` with
    // net::ERR_INVALID_ARGUMENT. Same-origin is enforced structurally by the
    // constructor-owned fixed URLs instead of a renderer Fetch mode.
    referrerPolicy: "no-referrer",
    headers: {
      accept: "application/json",
      // `Sec-` is a forbidden browser request-header prefix. Electron main's
      // session.fetch may set it; a `/desktop/*` renderer cannot forge it.
      ...(method === "POST"
        ? { [NATIVE_ACCOUNT_SESSION_HEADER]: NATIVE_SIGN_OUT_INTENT }
        : {}),
    },
  };
}

function accountState(payload: unknown): DesktopAccountState {
  if (!isRecord(payload) || !Object.hasOwn(payload, "user")) {
    return "unavailable";
  }
  if (payload.user === null) return "signed-out";
  if (
    !isRecord(payload.user) ||
    typeof payload.user.id !== "string" ||
    payload.user.id.length === 0
  ) {
    return "unavailable";
  }
  return "signed-in";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

function signOutError(): Error {
  return new Error("Grida account sign-out could not be completed");
}
