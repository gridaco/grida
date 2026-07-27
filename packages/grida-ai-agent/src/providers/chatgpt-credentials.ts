/**
 * GRIDA-SEC-008 — OAuth attempt, token custody, refresh, and sign-out state.
 *
 * Native ChatGPT subscription OAuth custody.
 *
 * Grida remains the agent runtime: this module owns only the provider
 * credential ceremony and refresh lifecycle. It never starts an ACP process,
 * Codex app-server, or any other external agent loop.
 */

import crypto from "node:crypto";
import type { AuthStore, OAuthEntry } from "@grida/daemon/server";
import type { ChatGptSubscriptionStatus } from "../protocol/chatgpt";
import { CHATGPT_PROVIDER_ID } from "../protocol/chatgpt";
import { ProviderHttp } from "./http";

const DEFAULT_REFRESH_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_ATTEMPT_TTL_MS = 10 * 60 * 1000;
const MAX_TOKEN_RESPONSE_BYTES = 1024 * 1024;
const MAX_SAFE_EPOCH_SECONDS = Math.floor(Number.MAX_SAFE_INTEGER / 1000);
const RESERVED_AUTHORIZATION_PARAMETERS = new Set([
  "client_id",
  "redirect_uri",
  "response_type",
  "scope",
  "state",
  "code_challenge",
  "code_challenge_method",
]);

export type ChatGptOAuthConfig = Readonly<{
  authorize_url: string;
  token_url: string;
  client_id: string;
  redirect_uris: readonly string[];
  scopes: readonly string[];
  /**
   * Provider-approved, non-protocol authorization parameters. Reserved OAuth
   * and PKCE fields are rejected so config cannot override generated state,
   * verifier binding, client identity, or callback selection.
   */
  authorization_parameters?: Readonly<Record<string, string>>;
  refresh_skew_ms?: number;
  attempt_ttl_ms?: number;
}>;

export type ChatGptAuthStart = {
  attempt_id: string;
  state: string;
  authorization_url: string;
};

export type ChatGptAccessCredentials = {
  access_token: string;
  account_id: string;
};

export type ChatGptCredentialErrorCode =
  | "chatgpt_not_signed_in"
  | "chatgpt_account_missing"
  | "chatgpt_oauth_attempt_invalid"
  | "chatgpt_oauth_exchange_failed"
  | "chatgpt_token_refresh_failed"
  | "chatgpt_reauthentication_required";

/**
 * Safe, code-led credential failures. Messages never contain token-endpoint
 * bodies, authorization codes, PKCE verifiers, or tokens.
 */
export class ChatGptCredentialError extends Error {
  constructor(public readonly code: ChatGptCredentialErrorCode) {
    super(`${code}: ${credentialErrorDescription(code)}`);
    this.name = "ChatGptCredentialError";
  }
}

type PendingAttempt = {
  attempt_id: string;
  state: string;
  verifier: string;
  redirect_uri: string;
  expires_at: number;
  generation: number;
};

type CompletingAttempt = {
  cancelled: boolean;
  abort: AbortController;
  persisted_entry?: OAuthEntry;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
  account_id?: string;
  email?: string;
};

type JwtClaims = {
  account_id?: string;
  email?: string;
  plan?: string;
};

type CredentialManagerOptions = {
  now?: () => number;
  random_bytes?: (size: number) => Buffer;
};

/**
 * One launch-scoped manager for the persisted `chatgpt` OAuth record.
 *
 * Reads are deliberately fresh from AuthStore. Refresh is singleflight, and a
 * rotating refresh token is persisted before its access token is returned to
 * inference. Sign-out increments a generation so an in-flight exchange or
 * refresh cannot resurrect credentials after removal.
 */
export class ChatGptCredentialManager {
  private readonly now: () => number;
  private readonly randomBytes: (size: number) => Buffer;
  private readonly refreshSkewMs: number;
  private readonly attemptTtlMs: number;
  private pending: PendingAttempt | null = null;
  private readonly completing = new Map<string, CompletingAttempt>();
  private refreshInFlight: Promise<ChatGptAccessCredentials> | null = null;
  private generation = 0;

  constructor(
    private readonly auth: AuthStore,
    private readonly providerHttp: ProviderHttp,
    private readonly config: ChatGptOAuthConfig,
    options: CredentialManagerOptions = {}
  ) {
    validateConfig(config);
    this.now = options.now ?? Date.now;
    this.randomBytes = options.random_bytes ?? crypto.randomBytes;
    this.refreshSkewMs = config.refresh_skew_ms ?? DEFAULT_REFRESH_SKEW_MS;
    this.attemptTtlMs = config.attempt_ttl_ms ?? DEFAULT_ATTEMPT_TTL_MS;
  }

  async start(redirectUri: string): Promise<ChatGptAuthStart> {
    // One authorization-code exchange may own the provider slot at a time.
    // Callers may retry immediately after exact cancellation, which removes
    // the old completion before its aborted request settles.
    if (this.completing.size > 0) {
      throw new ChatGptCredentialError("chatgpt_oauth_attempt_invalid");
    }
    if (!this.config.redirect_uris.includes(redirectUri)) {
      throw new ChatGptCredentialError("chatgpt_oauth_attempt_invalid");
    }

    const attemptId = this.randomBytes(24).toString("base64url");
    const state = this.randomBytes(24).toString("base64url");
    const verifier = this.randomBytes(32).toString("base64url");
    const challenge = crypto
      .createHash("sha256")
      .update(verifier)
      .digest("base64url");
    const authorize = new URL(this.config.authorize_url);
    for (const [key, value] of Object.entries(
      this.config.authorization_parameters ?? {}
    )) {
      authorize.searchParams.set(key, value);
    }
    authorize.searchParams.set("client_id", this.config.client_id);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("scope", this.config.scopes.join(" "));
    authorize.searchParams.set("state", state);
    authorize.searchParams.set("code_challenge", challenge);
    authorize.searchParams.set("code_challenge_method", "S256");

    this.pending = {
      attempt_id: attemptId,
      state,
      verifier,
      redirect_uri: redirectUri,
      expires_at: this.now() + this.attemptTtlMs,
      generation: this.generation,
    };
    return {
      attempt_id: attemptId,
      state,
      authorization_url: authorize.toString(),
    };
  }

  async complete(input: {
    attempt_id: string;
    code: string;
    state: string;
  }): Promise<ChatGptSubscriptionStatus> {
    const attempt = this.takeAttempt(input.attempt_id, input.state);
    const completion: CompletingAttempt = {
      cancelled: false,
      abort: new AbortController(),
    };
    this.completing.set(attempt.attempt_id, completion);
    try {
      const form = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: this.config.client_id,
        code: input.code,
        redirect_uri: attempt.redirect_uri,
        code_verifier: attempt.verifier,
      });
      let response: Response;
      try {
        response = await this.requestToken(form, completion.abort.signal);
      } catch {
        throw new ChatGptCredentialError(
          completion.cancelled
            ? "chatgpt_oauth_attempt_invalid"
            : "chatgpt_oauth_exchange_failed"
        );
      }
      if (!response.ok) {
        await discardBody(response);
        throw new ChatGptCredentialError("chatgpt_oauth_exchange_failed");
      }
      const tokens = await parseTokenResponse(
        response,
        "chatgpt_oauth_exchange_failed"
      );
      if (!tokens.refresh_token) {
        throw new ChatGptCredentialError("chatgpt_oauth_exchange_failed");
      }
      if (completion.cancelled || attempt.generation !== this.generation) {
        throw new ChatGptCredentialError("chatgpt_oauth_attempt_invalid");
      }
      const entry = oauthEntryFrom(
        tokens,
        this.now(),
        undefined,
        attempt.attempt_id,
        "chatgpt_oauth_exchange_failed"
      );
      completion.persisted_entry = entry;
      await this.auth.set(CHATGPT_PROVIDER_ID, entry);
      if (completion.cancelled) {
        await this.auth.removeIfUnchanged(CHATGPT_PROVIDER_ID, entry);
        throw new ChatGptCredentialError("chatgpt_oauth_attempt_invalid");
      }
      return statusFrom(entry, false);
    } finally {
      if (this.completing.get(attempt.attempt_id) === completion) {
        this.completing.delete(attempt.attempt_id);
      }
    }
  }

  async cancel(attemptId: string): Promise<boolean> {
    this.clearExpiredAttempt();
    if (
      this.pending &&
      timingSafeTextEqual(this.pending.attempt_id, attemptId)
    ) {
      this.pending = null;
      return true;
    }
    const completion = this.completing.get(attemptId);
    if (!completion) return false;
    completion.cancelled = true;
    this.completing.delete(attemptId);
    completion.abort.abort();
    if (completion.persisted_entry) {
      await this.auth.removeIfUnchanged(
        CHATGPT_PROVIDER_ID,
        completion.persisted_entry
      );
    }
    return true;
  }

  async signOut(): Promise<void> {
    this.generation += 1;
    this.pending = null;
    for (const completion of this.completing.values()) {
      completion.cancelled = true;
      completion.abort.abort();
    }
    this.completing.clear();
    await this.auth.remove(CHATGPT_PROVIDER_ID);
  }

  async status(): Promise<ChatGptSubscriptionStatus> {
    this.clearExpiredAttempt();
    const entry = await this.readEntry();
    if (!entry) {
      return {
        configured: true,
        signed_in: false,
        ready: false,
        signing_in: this.isSigningIn(),
      };
    }
    return statusFrom(entry, this.isSigningIn());
  }

  async getAccessCredentials(): Promise<ChatGptAccessCredentials> {
    const entry = await this.requireEntry();
    if (isFresh(entry, this.now(), this.refreshSkewMs)) {
      return accessCredentials(entry);
    }
    return this.refresh(false);
  }

  /**
   * Reactive recovery after one inference 401. If another request already
   * rotated the access token, use that fresh record; otherwise force exactly
   * one singleflight refresh.
   */
  async refreshAfterUnauthorized(
    rejectedAccessToken: string
  ): Promise<ChatGptAccessCredentials> {
    return this.refresh(true, rejectedAccessToken);
  }

  /**
   * Remove only the credential that an inference retry just proved invalid.
   * A concurrent refresh or OAuth completion wins by changing the persisted
   * entry, so a late 401 for account A cannot sign out account B.
   */
  async invalidateAfterUnauthorized(
    rejectedAccessToken: string
  ): Promise<boolean> {
    const entry = await this.readEntry();
    if (!entry || !timingSafeTextEqual(entry.access, rejectedAccessToken)) {
      return false;
    }
    return this.auth.removeIfUnchanged(CHATGPT_PROVIDER_ID, entry);
  }

  supportsAccount(): Promise<boolean> {
    return this.readEntry().then((entry) => Boolean(entry?.account_id));
  }

  private takeAttempt(attemptId: string, state: string): PendingAttempt {
    this.clearExpiredAttempt();
    const attempt = this.pending;
    if (
      !attempt ||
      !timingSafeTextEqual(attempt.attempt_id, attemptId) ||
      !timingSafeTextEqual(attempt.state, state)
    ) {
      throw new ChatGptCredentialError("chatgpt_oauth_attempt_invalid");
    }
    // Authorization codes are one-use. Consume before network I/O so a retry
    // cannot replay the same code or verifier after an ambiguous response.
    this.pending = null;
    return attempt;
  }

  private clearExpiredAttempt(): void {
    if (this.pending && this.pending.expires_at <= this.now()) {
      this.pending = null;
    }
  }

  private isSigningIn(): boolean {
    return this.pending !== null || this.completing.size > 0;
  }

  private async refresh(
    force: boolean,
    rejectedAccessToken?: string
  ): Promise<ChatGptAccessCredentials> {
    if (this.refreshInFlight) return this.refreshInFlight;
    const task = this.refreshOnce(force, rejectedAccessToken);
    this.refreshInFlight = task;
    try {
      return await task;
    } finally {
      if (this.refreshInFlight === task) this.refreshInFlight = null;
    }
  }

  private async refreshOnce(
    force: boolean,
    rejectedAccessToken?: string
  ): Promise<ChatGptAccessCredentials> {
    // Re-read after entering the singleflight. A concurrent request may have
    // persisted a rotated token before this caller acquired the slot.
    const entry = await this.requireEntry();
    if (
      rejectedAccessToken !== undefined &&
      entry.access !== rejectedAccessToken
    ) {
      return accessCredentials(entry);
    }
    if (!force && isFresh(entry, this.now(), this.refreshSkewMs)) {
      return accessCredentials(entry);
    }

    const generation = this.generation;
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.config.client_id,
      refresh_token: entry.refresh,
    });
    const response = await this.requestToken(form);
    if (!response.ok) {
      const code =
        response.status === 400 ||
        response.status === 401 ||
        response.status === 403
          ? "chatgpt_reauthentication_required"
          : "chatgpt_token_refresh_failed";
      await discardBody(response);
      if (code === "chatgpt_reauthentication_required") {
        await this.auth.removeIfUnchanged(CHATGPT_PROVIDER_ID, entry);
      }
      throw new ChatGptCredentialError(code);
    }
    const tokens = await parseTokenResponse(
      response,
      "chatgpt_token_refresh_failed"
    );
    if (generation !== this.generation) {
      throw new ChatGptCredentialError("chatgpt_not_signed_in");
    }
    const next = oauthEntryFrom(
      tokens,
      this.now(),
      entry,
      undefined,
      "chatgpt_token_refresh_failed"
    );
    // Load-bearing ordering for rotating refresh tokens: durable mutation
    // completes before callers can spend the corresponding access token. The
    // compare-and-replace also prevents a slow refresh for account A from
    // overwriting a newer OAuth completion for account B.
    const replaced = await this.auth.replaceIfUnchanged(
      CHATGPT_PROVIDER_ID,
      entry,
      next
    );
    if (!replaced) {
      return accessCredentials(await this.requireEntry());
    }
    if (generation !== this.generation) {
      await this.auth.removeIfUnchanged(CHATGPT_PROVIDER_ID, next);
      throw new ChatGptCredentialError("chatgpt_not_signed_in");
    }
    return accessCredentials(next);
  }

  private requestToken(
    body: URLSearchParams,
    signal?: AbortSignal
  ): Promise<Response> {
    return this.providerHttp.request(this.config.token_url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal,
    });
  }

  private async requireEntry(): Promise<OAuthEntry> {
    const entry = await this.readEntry();
    if (!entry) {
      throw new ChatGptCredentialError("chatgpt_not_signed_in");
    }
    return entry;
  }

  private async readEntry(): Promise<OAuthEntry | null> {
    const entry = await this.auth.get(CHATGPT_PROVIDER_ID);
    if (
      !entry ||
      entry.type !== "oauth" ||
      typeof entry.access !== "string" ||
      entry.access.length === 0 ||
      typeof entry.refresh !== "string" ||
      entry.refresh.length === 0 ||
      !isSafeExpiryEpochSeconds(entry.expires)
    ) {
      return null;
    }
    return entry;
  }
}

function validateConfig(config: ChatGptOAuthConfig): void {
  assertHttpsUrl(config.authorize_url, "authorize_url");
  assertHttpsUrl(config.token_url, "token_url");
  if (config.client_id.trim().length === 0) {
    throw new TypeError("chatgpt client_id must not be empty");
  }
  if (config.redirect_uris.length === 0) {
    throw new TypeError("chatgpt redirect_uris must not be empty");
  }
  for (const redirectUri of config.redirect_uris) {
    assertLoopbackRedirect(redirectUri);
  }
  if (
    config.scopes.length === 0 ||
    config.scopes.some((scope) => scope.trim().length === 0)
  ) {
    throw new TypeError("chatgpt scopes must contain non-empty values");
  }
  for (const key of Object.keys(config.authorization_parameters ?? {})) {
    if (RESERVED_AUTHORIZATION_PARAMETERS.has(key)) {
      throw new TypeError(
        `chatgpt authorization_parameters cannot override ${key}`
      );
    }
  }
  for (const [name, value] of [
    ["refresh_skew_ms", config.refresh_skew_ms],
    ["attempt_ttl_ms", config.attempt_ttl_ms],
  ] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      throw new TypeError(`chatgpt ${name} must be a non-negative integer`);
    }
  }
}

function assertHttpsUrl(value: string, name: string): void {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== ""
  ) {
    throw new TypeError(`chatgpt ${name} must be a credential-free HTTPS URL`);
  }
}

function assertLoopbackRedirect(value: string): void {
  const url = new URL(value);
  const isLoopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (
    url.protocol !== "http:" ||
    !isLoopback ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new TypeError(
      "chatgpt redirect URIs must be credential-free HTTP loopback URLs"
    );
  }
}

async function parseTokenResponse(
  response: Response,
  code: "chatgpt_oauth_exchange_failed" | "chatgpt_token_refresh_failed"
): Promise<TokenResponse> {
  const text = await readBoundedTokenResponse(response, code);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ChatGptCredentialError(code);
  }
  const value = raw as Partial<TokenResponse>;
  if (
    typeof value.access_token !== "string" ||
    value.access_token.length === 0 ||
    typeof value.expires_in !== "number" ||
    !Number.isSafeInteger(value.expires_in) ||
    value.expires_in <= 0 ||
    value.expires_in > MAX_SAFE_EPOCH_SECONDS ||
    (value.refresh_token !== undefined &&
      (typeof value.refresh_token !== "string" ||
        value.refresh_token.length === 0)) ||
    (value.id_token !== undefined && typeof value.id_token !== "string") ||
    (value.account_id !== undefined && typeof value.account_id !== "string") ||
    (value.email !== undefined && typeof value.email !== "string")
  ) {
    throw new ChatGptCredentialError(code);
  }
  return value as TokenResponse;
}

async function readBoundedTokenResponse(
  response: Response,
  code: "chatgpt_oauth_exchange_failed" | "chatgpt_token_refresh_failed"
): Promise<string> {
  const contentLengthText = response.headers.get("content-length")?.trim();
  if (contentLengthText && /^\d+$/.test(contentLengthText)) {
    const contentLength = Number(contentLengthText);
    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength > MAX_TOKEN_RESPONSE_BYTES
    ) {
      await discardBody(response);
      throw new ChatGptCredentialError(code);
    }
  }

  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_TOKEN_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        throw new ChatGptCredentialError(code);
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof ChatGptCredentialError) throw error;
    throw new ChatGptCredentialError(code);
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

function oauthEntryFrom(
  tokens: TokenResponse,
  now: number,
  previous?: OAuthEntry,
  credentialId?: string,
  errorCode:
    | "chatgpt_oauth_exchange_failed"
    | "chatgpt_token_refresh_failed" = "chatgpt_oauth_exchange_failed"
): OAuthEntry {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new ChatGptCredentialError(errorCode);
  }
  const nowEpochSeconds = Math.floor(now / 1000);
  const expires = nowEpochSeconds + tokens.expires_in;
  if (!isSafeExpiryEpochSeconds(expires) || expires <= nowEpochSeconds) {
    throw new ChatGptCredentialError(errorCode);
  }
  const claims = extractJwtClaims(
    tokens.id_token ?? tokens.access_token,
    nowEpochSeconds
  );
  return {
    type: "oauth",
    access: tokens.access_token,
    refresh: tokens.refresh_token ?? previous?.refresh ?? "",
    expires,
    ...optional(
      "account_id",
      stringClaim(tokens.account_id) ??
        claims.account_id ??
        previous?.account_id
    ),
    ...optional(
      "email",
      stringClaim(tokens.email) ?? claims.email ?? previous?.email
    ),
    ...optional("plan", claims.plan ?? previous?.plan),
    ...(previous?.metadata
      ? { metadata: previous.metadata }
      : credentialId
        ? { metadata: { credential_id: credentialId } }
        : {}),
  };
}

function isSafeExpiryEpochSeconds(value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_SAFE_EPOCH_SECONDS &&
    Number.isSafeInteger(value * 1000)
  );
}

function extractJwtClaims(jwt: string, nowEpochSeconds: number): JwtClaims {
  const parts = jwt.split(".");
  if (
    parts.length !== 3 ||
    parts.some((part) => part.length === 0) ||
    !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))
  ) {
    return {};
  }
  const payload = parts[1]!;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const claims = value as Record<string, unknown>;
  if (
    typeof claims.exp !== "number" ||
    !Number.isFinite(claims.exp) ||
    claims.exp <= nowEpochSeconds
  ) {
    return {};
  }
  const auth = objectClaim(claims["https://api.openai.com/auth"]);
  const profile = objectClaim(claims["https://api.openai.com/profile"]);
  const organizations = Array.isArray(claims.organizations)
    ? claims.organizations
    : [];
  const firstOrganization = objectClaim(organizations[0]);
  return {
    account_id:
      stringClaim(claims.chatgpt_account_id) ??
      stringClaim(auth.chatgpt_account_id) ??
      stringClaim(firstOrganization.id),
    email: stringClaim(claims.email) ?? stringClaim(profile.email),
    plan:
      stringClaim(auth.chatgpt_plan_type) ??
      stringClaim(claims.chatgpt_plan_type),
  };
}

function objectClaim(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringClaim(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  // Keep this byte-identical to Electron main's secret-free status DTO
  // parser. A multibyte claim must not persist successfully and then make
  // every renderer status read fail after the credential mutation.
  return trimmed.length > 0 && Buffer.byteLength(trimmed) <= 1024
    ? trimmed
    : undefined;
}

function optional<K extends "account_id" | "email" | "plan">(
  key: K,
  value: string | undefined
): Partial<Pick<OAuthEntry, K>> {
  return value ? ({ [key]: value } as Pick<OAuthEntry, K>) : {};
}

function isFresh(entry: OAuthEntry, now: number, skewMs: number): boolean {
  return entry.expires * 1000 > now + skewMs;
}

function accessCredentials(entry: OAuthEntry): ChatGptAccessCredentials {
  if (!entry.account_id) {
    throw new ChatGptCredentialError("chatgpt_account_missing");
  }
  return { access_token: entry.access, account_id: entry.account_id };
}

function statusFrom(
  entry: OAuthEntry,
  signingIn: boolean
): ChatGptSubscriptionStatus {
  const account =
    entry.account_id || entry.email || entry.plan
      ? {
          ...optionalStatus("id", entry.account_id),
          ...optionalStatus("email", entry.email),
          ...optionalStatus("plan", entry.plan),
        }
      : undefined;
  return {
    configured: true,
    signed_in: true,
    ready: Boolean(entry.account_id),
    signing_in: signingIn,
    expires_at: entry.expires * 1000,
    ...(account ? { account } : {}),
  };
}

function optionalStatus<K extends "id" | "email" | "plan">(
  key: K,
  value: string | undefined
): Partial<Record<K, string>> {
  return value ? ({ [key]: value } as Record<K, string>) : {};
}

function timingSafeTextEqual(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected, "utf8");
  const actualBytes = Buffer.from(actual, "utf8");
  return (
    expectedBytes.length === actualBytes.length &&
    crypto.timingSafeEqual(expectedBytes, actualBytes)
  );
}

async function discardBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => {});
}

function credentialErrorDescription(code: ChatGptCredentialErrorCode): string {
  switch (code) {
    case "chatgpt_not_signed_in":
      return "no ChatGPT subscription credential is available";
    case "chatgpt_account_missing":
      return "the credential has no ChatGPT account identity";
    case "chatgpt_oauth_attempt_invalid":
      return "the sign-in attempt is missing, expired, cancelled, or mismatched";
    case "chatgpt_oauth_exchange_failed":
      return "the authorization code exchange failed";
    case "chatgpt_token_refresh_failed":
      return "the access token could not be refreshed";
    case "chatgpt_reauthentication_required":
      return "the ChatGPT account must sign in again";
  }
}
