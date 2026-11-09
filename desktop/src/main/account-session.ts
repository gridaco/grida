/**
 * GRIDA-SEC-005 — main-process projection of the webview cookie session.
 *
 * Main-process view of the Grida account session.
 *
 * The Chromium session owns the cookies. This client only asks the fixed
 * same-origin desktop routes for account state and scoped AI access.
 */
export type DesktopAccountState = "signed-in" | "signed-out" | "unavailable";

const NATIVE_ACCOUNT_SESSION_HEADER =
  "sec-grida-desktop-account-session" as const;
const NATIVE_SIGN_OUT_INTENT = "sign-out" as const;
const NATIVE_MINT_AI_INTENT = "mint-ai" as const;
const GATEWAY_MINT_TIMEOUT_MS = 10_000;
const GATEWAY_GRANT_MAX_BYTES = 24 * 1024;
const GATEWAY_GRANT_MAX_LIFETIME_MS = 16 * 60_000;

export type DesktopGatewayGrant = Readonly<{
  token: string;
  expiresAt: number;
  subject: string;
  organizationId: number;
  isCurrent: () => boolean;
}>;

export class DesktopAccountSession {
  private readonly meUrl: string;
  private readonly signOutUrl: string;
  private readonly gatewayMintUrl: string;
  private gatewayGeneration = 0;
  private gatewaySubject: string | undefined;
  private signingOut = false;

  constructor(
    private readonly deps: {
      base_url: string;
      fetch: (url: string, init: RequestInit) => Promise<Response>;
    }
  ) {
    const origin = editorOrigin(deps.base_url);
    this.meUrl = new URL("/desktop/auth/me", origin).toString();
    this.signOutUrl = new URL("/desktop/auth/sign-out", origin).toString();
    this.gatewayMintUrl = new URL("/desktop/auth/token", origin).toString();
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
    const state = accountState(payload);
    if (
      state === "signed-out" ||
      (state === "signed-in" &&
        this.gatewaySubject !== undefined &&
        this.gatewaySubject !== accountSubject(payload))
    ) {
      this.gatewayGeneration += 1;
      this.gatewaySubject = undefined;
    }
    return state;
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
    if (this.signingOut) throw signOutError();
    this.signingOut = true;
    this.gatewayGeneration += 1;
    this.gatewaySubject = undefined;
    try {
      const response = await this.deps.fetch(
        this.signOutUrl,
        requestInit("POST", NATIVE_SIGN_OUT_INTENT)
      );
      await discard(response);
      if (response.redirected || !response.ok) throw signOutError();
    } catch {
      throw signOutError();
    } finally {
      this.signingOut = false;
    }
  }

  /** Deliver a scoped bearer to a trusted main-process memory owner. */
  async withGatewayGrant(
    organizationId: number | undefined,
    accept: (grant: DesktopGatewayGrant) => void,
    cancellation?: AbortSignal
  ): Promise<void> {
    if (organizationId !== undefined && !validOrganization(organizationId))
      throw new Error("gateway_organization_invalid");
    const url = new URL(this.gatewayMintUrl);
    if (
      this.signingOut ||
      (url.protocol !== "https:" &&
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
      throw new Error("gateway_grant_unavailable");
    const generation = this.gatewayGeneration;
    const timeout = AbortSignal.timeout(GATEWAY_MINT_TIMEOUT_MS);
    const signal = cancellation
      ? AbortSignal.any([timeout, cancellation])
      : timeout;
    let grant: Omit<DesktopGatewayGrant, "isCurrent"> | undefined;
    try {
      signal.throwIfAborted();
      const request = requestInit("POST", NATIVE_MINT_AI_INTENT);
      if (organizationId !== undefined) {
        const headers = new Headers(request.headers);
        headers.set("content-type", "application/json");
        request.headers = headers;
        request.body = JSON.stringify({ org_id: organizationId });
      }
      const response = await this.deps.fetch(this.gatewayMintUrl, {
        ...request,
        signal,
      });
      if (response.redirected || !response.ok) await discard(response);
      else grant = gatewayGrant(await readGrant(response), organizationId);
    } catch {
      // HTTP and decode errors can carry credential material.
    }
    if (
      !grant ||
      signal.aborted ||
      this.signingOut ||
      generation !== this.gatewayGeneration
    )
      throw new Error("gateway_grant_unavailable");
    if (
      this.gatewaySubject !== undefined &&
      this.gatewaySubject !== grant.subject
    ) {
      this.gatewayGeneration += 1;
      this.gatewaySubject = undefined;
      throw new Error("gateway_grant_unavailable");
    }
    this.gatewaySubject = grant.subject;
    const accepted = this.gatewayGeneration;
    try {
      accept(
        Object.freeze({
          ...grant,
          isCurrent: () =>
            !this.signingOut && accepted === this.gatewayGeneration,
        })
      );
    } catch {
      throw new Error("gateway_grant_acceptance_failed");
    }
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

function requestInit(
  method: "GET" | "POST",
  intent?: typeof NATIVE_SIGN_OUT_INTENT | typeof NATIVE_MINT_AI_INTENT
): RequestInit {
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
      ...(intent ? { [NATIVE_ACCOUNT_SESSION_HEADER]: intent } : {}),
    },
  };
}

function accountState(payload: unknown): DesktopAccountState {
  if (!isRecord(payload) || !Object.hasOwn(payload, "user")) {
    return "unavailable";
  }
  if (payload.user === null) return "signed-out";
  return accountSubject(payload) ? "signed-in" : "unavailable";
}

function accountSubject(payload: unknown): string | undefined {
  if (!isRecord(payload) || !isRecord(payload.user)) return;
  return typeof payload.user.id === "string" && payload.user.id.length > 0
    ? payload.user.id
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readGrant(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let json = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return JSON.parse(json + decoder.decode());
      bytes += chunk.value.byteLength;
      if (bytes > GATEWAY_GRANT_MAX_BYTES) return;
      json += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
}

function gatewayGrant(
  value: unknown,
  requestedOrganization: number | undefined
): Omit<DesktopGatewayGrant, "isCurrent"> | undefined {
  if (!isRecord(value) || !isRecord(value.organization)) return;
  const { token, expires_at, account_subject } = value;
  const organizationId = value.organization.id;
  if (
    typeof token !== "string" ||
    token.length > 16_384 ||
    !/^[a-z\d_-]+\.[a-z\d_-]+\.[a-z\d_-]+$/i.test(token) ||
    typeof expires_at !== "string" ||
    typeof account_subject !== "string" ||
    !/^[a-z\d_-]{1,128}$/i.test(account_subject) ||
    !validOrganization(organizationId) ||
    (requestedOrganization !== undefined &&
      organizationId !== requestedOrganization)
  )
    return;
  const expiresAt = Date.parse(expires_at);
  const now = Date.now();
  if (
    !Number.isFinite(expiresAt) ||
    expiresAt <= now ||
    expiresAt > now + GATEWAY_GRANT_MAX_LIFETIME_MS
  )
    return;
  return {
    token,
    expiresAt,
    subject: account_subject,
    organizationId,
  };
}

function validOrganization(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

function signOutError(): Error {
  return new Error("Grida account sign-out could not be completed");
}
