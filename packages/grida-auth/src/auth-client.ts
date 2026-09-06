/** GRIDA-SEC-010 — native OAuth lifecycle and host-owned credential custody. */
export class AuthClient {
  readonly config: Readonly<AuthClient.Config>;
  private generation = 0;
  private attempt: {
    generation: number;
    listener?: AuthClient.Listener;
  } | null = null;
  private refreshInFlight: Promise<AuthClient.Status> | null = null;
  private protectedReads = 0;
  private mutations: Promise<unknown> = Promise.resolve();
  private requests = new Set<AuthClient.RequestOperation>();

  constructor(
    config: AuthClient.Config,
    private readonly host: AuthClient.Host
  ) {
    validateConfig(config);
    this.config = Object.freeze({
      ...config,
      redirectUris: Object.freeze([...config.redirectUris]),
    });
  }

  /** Local metadata only. Use verify() when live account authority is needed. */
  async status(): Promise<AuthClient.Status> {
    return this.view(await this.read());
  }

  async login(): Promise<AuthClient.Status> {
    if (this.attempt) throw new AuthClient.Failure("login_in_progress");
    if (this.refreshInFlight || this.protectedReads)
      throw new AuthClient.Failure("session_busy");
    const attempt = {
      generation: ++this.generation,
      listener: undefined as AuthClient.Listener | undefined,
    };
    this.attempt = attempt;
    try {
      // Capture before consent, including when signed out. A later empty logout
      // must invalidate this attempt just as a credential replacement would.
      const revision = this.coordinatedCustody()
        ? await this.exclusive(
            async (transaction) => (await this.snapshot(transaction)).revision
          )
        : undefined;
      this.check(attempt.generation);
      const { state, verifier, challenge } = await this.host.pkce();
      if (
        !/^[A-Za-z0-9_-]{43,128}$/.test(state) ||
        !/^[A-Za-z0-9_-]{43,128}$/.test(verifier) ||
        !/^[A-Za-z0-9_-]{43}$/.test(challenge)
      ) {
        throw new AuthClient.Failure("invalid_response");
      }
      this.check(attempt.generation);
      const listener = await this.host.listen(this.config.redirectUris, state);
      attempt.listener = listener;
      this.check(attempt.generation);
      if (!this.config.redirectUris.includes(listener.redirectUri))
        throw new AuthClient.Failure("invalid_callback");
      const authorizationUrl = `${this.config.issuer}/oauth/authorize?${form({
        client_id: this.config.clientId,
        response_type: "code",
        redirect_uri: listener.redirectUri,
        scope: "email profile",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      })}`;
      // The listener owns the deadline. A browser-launch rejection settles it too.
      void Promise.resolve()
        .then(() => this.host.openBrowser(authorizationUrl))
        .catch(() => listener.cancel("browser_failed"));
      const callback = await listener.result;
      this.check(attempt.generation);
      if (
        callback.state !== state ||
        !!callback.code === !!callback.error ||
        (callback.issuer !== undefined &&
          callback.issuer !== this.config.issuer)
      )
        throw new AuthClient.Failure("invalid_callback");
      if (callback.error)
        throw new AuthClient.Failure(
          callback.error === "access_denied"
            ? "access_denied"
            : "authorization_failed"
        );
      if (!opaque(callback.code))
        throw new AuthClient.Failure("invalid_callback");
      const tokens = await this.exchange({
        grant_type: "authorization_code",
        client_id: this.config.clientId,
        code: callback.code!,
        code_verifier: verifier,
        redirect_uri: listener.redirectUri,
      });
      this.check(attempt.generation);
      const identity = await this.identity(tokens.accessToken);
      this.check(attempt.generation);
      const session: AuthClient.Session = {
        ...tokens,
        identity,
        issuer: this.config.issuer,
        clientId: this.config.clientId,
        apiOrigin: this.config.apiOrigin,
      };
      if (revision !== undefined) {
        await this.exclusive(async (transaction) => {
          this.check(attempt.generation);
          const previous = await this.snapshot(transaction);
          if (previous.revision !== revision)
            throw new AuthClient.Failure("session_changed");
          await this.save(transaction, attempt.generation, session);
          if (attempt.generation !== this.generation) {
            // Explicit login compensation while still exclusive. The host must
            // advance its revision again; this is never a transaction rollback.
            if (previous.session) await transaction.write(previous.session);
            else await transaction.clear();
            throw new AuthClient.Failure("cancelled");
          }
        });
      } else {
        await this.commit(attempt.generation, session);
      }
      return this.view(session);
    } catch (error) {
      throw safeFailure(error);
    } finally {
      try {
        await closeListener(attempt.listener);
      } finally {
        if (this.attempt === attempt) this.attempt = null;
      }
    }
  }

  async cancelLogin(): Promise<void> {
    if (!this.attempt) return;
    this.generation++;
    this.attempt.listener?.cancel("cancelled");
    this.cancelRequests();
    await closeListener(this.attempt.listener);
  }

  /** Fixed account wire capability. Selection and account policy belong to the caller/server. */
  requestAccount(
    operation: "organizations.list",
    input?: Readonly<{ after?: number }>
  ): Promise<AuthClient.OrganizationsPage>;
  requestAccount(
    operation: "credits.read",
    input: Readonly<{ organization_id: number }>
  ): Promise<AuthClient.Credits>;
  async requestAccount(
    operation: "organizations.list" | "credits.read",
    input?: Readonly<{ after?: number }> | Readonly<{ organization_id: number }>
  ): Promise<AuthClient.OrganizationsPage | AuthClient.Credits> {
    const read = accountRead(operation, input);
    if (this.attempt) throw new AuthClient.Failure("session_busy");
    const generation = this.generation;
    ++this.protectedReads;
    try {
      let reply: AuthClient.OrganizationsPage | AuthClient.Credits;
      if (this.coordinatedCustody()) {
        reply = await this.exclusive(async (transaction) => {
          this.check(generation);
          let session = (await this.snapshot(transaction)).session;
          if (!session) throw new AuthClient.Failure("signed_out");
          this.check(generation);
          if (session.expiresAt <= this.host.now() + 30_000)
            session = await this.rotate(transaction, generation, session);
          this.check(generation);
          const result = await this.account(session.accessToken, read);
          // Acceptance occurs under authority, before another writer can clear
          // or replace this session. Already accepted data cannot be retracted.
          this.check(generation);
          return result;
        });
      } else {
        let session = await this.requireSession();
        this.check(generation);
        if (
          this.refreshInFlight ||
          session.expiresAt <= this.host.now() + 30_000
        ) {
          await (this.refreshInFlight ?? this.refresh());
          this.check(generation);
          session = await this.requireSession();
        }
        this.check(generation);
        reply = await this.account(session.accessToken, read);
        this.check(generation);
        const current = await this.read();
        if (
          current?.accessToken !== session.accessToken ||
          current.refreshToken !== session.refreshToken
        )
          throw new AuthClient.Failure("session_changed");
      }
      this.check(generation);
      return reply;
    } catch (error) {
      this.check(generation);
      throw safeFailure(error);
    } finally {
      --this.protectedReads;
    }
  }

  /** Live identity from the fixed bearer API; decoded token claims are never identity. */
  async verify(): Promise<AuthClient.Status> {
    if (this.coordinatedCustody()) {
      if (this.attempt) throw new AuthClient.Failure("session_busy");
      const generation = this.generation;
      ++this.protectedReads;
      try {
        return await this.exclusive(async (transaction) => {
          this.check(generation);
          let session = (await this.snapshot(transaction)).session;
          if (!session) throw new AuthClient.Failure("signed_out");
          this.check(generation);
          if (session.expiresAt <= this.host.now() + 30_000) {
            // Already exclusive: never call the public refresh() recursively.
            session = await this.rotate(transaction, generation, session);
          }
          const identity = await this.identity(session.accessToken);
          this.check(generation);
          if (identity.id !== session.identity.id)
            throw new AuthClient.Failure("token_rejected");
          const verified = { ...session, identity };
          await this.save(transaction, generation, verified);
          this.check(generation);
          return this.view(verified);
        });
      } finally {
        --this.protectedReads;
      }
    }
    let session = await this.requireSession();
    if (session.expiresAt <= this.host.now() + 30_000) {
      await this.refresh();
      session = await this.requireSession();
    }
    const generation = this.generation;
    const identity = await this.identity(session.accessToken);
    this.check(generation);
    if (identity.id !== session.identity.id)
      throw new AuthClient.Failure("token_rejected");
    const verified = { ...session, identity };
    await this.commit(generation, verified, session);
    return this.view(verified);
  }

  /** Single-flight here; a coordinated host also serializes across its writers. */
  refresh(): Promise<AuthClient.Status> {
    if (this.attempt)
      return Promise.reject(new AuthClient.Failure("session_busy"));
    if (this.refreshInFlight) return this.refreshInFlight;
    const task = this.refreshOnce();
    this.refreshInFlight = task;
    void task
      .finally(() => {
        if (this.refreshInFlight === task) this.refreshInFlight = null;
      })
      .catch(() => undefined);
    return task;
  }

  /** Always clears this client's custody first; never revokes the application grant. */
  async logout(): Promise<AuthClient.Logout> {
    ++this.generation;
    const listener = this.attempt?.listener;
    listener?.cancel("cancelled");
    this.cancelRequests();
    // Enqueue before yielding: a later login must commit after this local clear.
    const cleared = this.coordinatedCustody()
      ? this.exclusive(async (transaction) => {
          const current = (await this.snapshot(transaction)).session;
          // Even an empty clear advances the host's durable revision.
          await transaction.clear();
          return current;
        })
      : this.mutate(async () => {
          const current = await this.read();
          await this.memoryCustody().clear();
          return current;
        });
    const session = await cleared;
    await closeListener(listener);
    if (!session) return { state: "signed-out", revocation: "not-needed" };
    try {
      const response = await this.request({
        url: `${this.config.issuer}/logout?scope=local`,
        method: "POST",
        headers: { authorization: `Bearer ${session.accessToken}` },
      });
      return {
        state: "signed-out",
        revocation:
          response.status >= 200 && response.status < 300
            ? "confirmed"
            : "unconfirmed",
      };
    } catch {
      return { state: "signed-out", revocation: "unconfirmed" };
    }
  }

  private async refreshOnce(): Promise<AuthClient.Status> {
    const generation = this.generation;
    if (this.coordinatedCustody()) {
      return this.exclusive(async (transaction) => {
        this.check(generation);
        const previous = (await this.snapshot(transaction)).session;
        if (!previous) throw new AuthClient.Failure("signed_out");
        return this.view(await this.rotate(transaction, generation, previous));
      });
    }
    const previous = await this.requireSession();
    this.check(generation);
    const tokens = await this.exchange(
      {
        grant_type: "refresh_token",
        client_id: this.config.clientId,
        refresh_token: previous.refreshToken,
      },
      previous.refreshToken
    );
    this.check(generation);
    // The issuer may already have invalidated the old refresh token. Preserve
    // that rotation before the separate identity service can fail. The access
    // token, expiry, and identity remain the last verified values until the new
    // bearer succeeds at auth/me; accepting a rotation is not live verification.
    const rotated = { ...previous, refreshToken: tokens.refreshToken };
    await this.commit(generation, rotated, previous, true);
    const identity = await this.identity(tokens.accessToken);
    this.check(generation);
    if (identity.id !== previous.identity.id)
      throw new AuthClient.Failure("token_rejected");
    const next = { ...previous, ...tokens, identity };
    await this.commit(generation, next, rotated);
    return this.view(next);
  }

  /** The complete rotating grant stays under the caller's existing authority. */
  private async rotate(
    transaction: AuthClient.CustodyTransaction,
    generation: number,
    previous: AuthClient.Session
  ): Promise<AuthClient.Session> {
    this.check(generation);
    const tokens = await this.exchange(
      {
        grant_type: "refresh_token",
        client_id: this.config.clientId,
        refresh_token: previous.refreshToken,
      },
      previous.refreshToken
    );
    // Never compensate an accepted rotation with the spent refresh credential.
    // Logout queued behind this operation will clear the newly saved rotation.
    await transaction.write({ ...previous, refreshToken: tokens.refreshToken });
    this.check(generation);
    const identity = await this.identity(tokens.accessToken);
    this.check(generation);
    if (identity.id !== previous.identity.id)
      throw new AuthClient.Failure("token_rejected");
    const next = { ...previous, ...tokens, identity };
    await this.save(transaction, generation, next);
    this.check(generation);
    return next;
  }

  private async exchange(input: Record<string, string>, refreshToken?: string) {
    const response = await this.request({
      url: `${this.config.issuer}/oauth/token`,
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form(input),
    });
    if (response.status !== 200)
      throw new AuthClient.Failure(
        response.status >= 400 && response.status < 500
          ? "token_rejected"
          : "unavailable"
      );
    const body = record(response.body);
    const refresh = body?.refresh_token ?? refreshToken;
    if (
      !body ||
      typeof body.token_type !== "string" ||
      body.token_type.toLowerCase() !== "bearer" ||
      !opaque(body.access_token) ||
      !opaque(refresh) ||
      typeof body.expires_in !== "number" ||
      !Number.isSafeInteger(body.expires_in) ||
      body.expires_in <= 0
    ) {
      throw new AuthClient.Failure("invalid_response");
    }
    const expiresAt = this.host.now() + body.expires_in * 1000;
    if (!Number.isSafeInteger(expiresAt))
      throw new AuthClient.Failure("invalid_response");
    return { accessToken: body.access_token, refreshToken: refresh, expiresAt };
  }

  private async identity(accessToken: string): Promise<AuthClient.Identity> {
    const response = await this.request({
      url: `${this.config.apiOrigin}/api/v1/auth/me`,
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (response.status !== 200)
      throw new AuthClient.Failure(
        response.status === 401 || response.status === 403
          ? "token_rejected"
          : "unavailable"
      );
    const value = record(response.body);
    if (
      !value ||
      !opaque(value.id) ||
      !(value.email === null || typeof value.email === "string") ||
      !(value.display_name === null || typeof value.display_name === "string")
    )
      throw new AuthClient.Failure("invalid_response");
    return {
      id: value.id,
      email: value.email,
      display_name: value.display_name,
    };
  }

  private async account(
    accessToken: string,
    read: AccountRead
  ): Promise<AuthClient.OrganizationsPage | AuthClient.Credits> {
    const path =
      read.operation === "organizations.list"
        ? `/api/v1/account/organizations${read.after === undefined ? "" : `?after=${read.after}`}`
        : `/api/v1/account/credits?organization_id=${read.organizationId}`;
    const response = await this.request({
      url: `${this.config.apiOrigin}${path}`,
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (response.status !== 200)
      throw new AuthClient.Failure(
        response.status === 401
          ? "token_rejected"
          : response.status === 403
            ? "forbidden"
            : "unavailable"
      );
    return read.operation === "organizations.list"
      ? organizationsPage(response.body, read.after)
      : credits(response.body, read.organizationId);
  }

  private async request(
    request: AuthClient.Request
  ): Promise<AuthClient.Response> {
    let operation: AuthClient.RequestOperation | undefined;
    try {
      operation = this.host.request(request);
      this.requests.add(operation);
      return await operation.result;
    } catch (error) {
      throw safeFailure(error);
    } finally {
      if (operation) this.requests.delete(operation);
    }
  }

  private cancelRequests() {
    for (const request of this.requests) request.cancel();
  }
  private check(generation: number) {
    if (generation !== this.generation)
      throw new AuthClient.Failure("cancelled");
  }

  private async read(): Promise<AuthClient.Session | null> {
    if (this.coordinatedCustody())
      return this.exclusive(
        async (transaction) => (await this.snapshot(transaction)).session
      );
    let session: AuthClient.Session | null;
    try {
      session = await this.memoryCustody().read();
    } catch {
      throw new AuthClient.Failure("custody_failed");
    }
    this.checkBinding(session);
    return session;
  }

  private checkBinding(session: AuthClient.Session | null) {
    if (
      session &&
      (session.issuer !== this.config.issuer ||
        session.clientId !== this.config.clientId ||
        session.apiOrigin !== this.config.apiOrigin)
    )
      throw new AuthClient.Failure("session_binding_mismatch");
  }

  private coordinatedCustody(): AuthClient.CoordinatedCustody | null {
    return "exclusive" in this.host.custody ? this.host.custody : null;
  }

  private memoryCustody(): AuthClient.Custody {
    if ("exclusive" in this.host.custody)
      throw new AuthClient.Failure("custody_failed");
    return this.host.custody;
  }

  private exclusive<T>(
    operation: (transaction: AuthClient.CustodyTransaction) => Promise<T>
  ): Promise<T> {
    // Order this instance's acquisitions before asking the shared authority.
    // The host need not promise FIFO admission across independent clients.
    return this.mutate(async () => {
      const custody = this.coordinatedCustody();
      if (!custody) throw new AuthClient.Failure("custody_failed");
      return await custody.exclusive(operation);
    });
  }

  private async snapshot(
    transaction: AuthClient.CustodyTransaction
  ): Promise<AuthClient.CustodySnapshot> {
    const snapshot = await transaction.read();
    if (
      !snapshot ||
      typeof snapshot.revision !== "string" ||
      snapshot.revision.length === 0
    )
      throw new AuthClient.Failure("custody_failed");
    this.checkBinding(snapshot.session);
    return snapshot;
  }

  private async save(
    transaction: AuthClient.CustodyTransaction,
    generation: number,
    session: AuthClient.Session
  ) {
    this.check(generation);
    await transaction.write(session);
  }

  private async requireSession() {
    const session = await this.read();
    if (!session) throw new AuthClient.Failure("signed_out");
    return session;
  }

  private commit(
    generation: number,
    session: AuthClient.Session,
    expected?: AuthClient.Session,
    preserveRotation = false
  ) {
    return this.mutate(async () => {
      this.check(generation);
      const previous = await this.read();
      if (
        expected &&
        (previous?.accessToken !== expected.accessToken ||
          previous.refreshToken !== expected.refreshToken)
      )
        throw new AuthClient.Failure("session_changed");
      this.check(generation);
      await this.memoryCustody().write(session);
      if (generation !== this.generation) {
        if (!preserveRotation) {
          if (previous) await this.memoryCustody().write(previous);
          else await this.memoryCustody().clear();
        }
        throw new AuthClient.Failure("cancelled");
      }
    });
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutations
      .catch(() => undefined)
      .then(operation)
      .catch((error: unknown) => {
        if (error instanceof AuthClient.Failure) throw error;
        throw new AuthClient.Failure("custody_failed");
      });
    this.mutations = result;
    return result;
  }

  private view(session: AuthClient.Session | null): AuthClient.Status {
    if (!session) return { state: "signed-out" };
    return {
      state:
        session.expiresAt <= this.host.now() + 30_000
          ? "refresh-needed"
          : "signed-in",
      identity: {
        id: session.identity.id,
        email: session.identity.email,
        display_name: session.identity.display_name,
      },
      expiresAt: session.expiresAt,
    };
  }
}

export namespace AuthClient {
  export type Config = {
    clientId: string;
    issuer: string;
    apiOrigin: string;
    redirectUris: readonly string[];
  };
  export type Identity = {
    id: string;
    email: string | null;
    display_name: string | null;
  };
  export type Status =
    | { state: "signed-out" }
    | {
        state: "signed-in" | "refresh-needed";
        identity: Identity;
        expiresAt: number;
      };
  export type Logout = {
    state: "signed-out";
    revocation: "confirmed" | "unconfirmed" | "not-needed";
  };
  /** One server-ordered page; a null cursor is the only end-of-list signal. */
  export type OrganizationsPage = Readonly<{
    organizations: readonly Readonly<{
      id: number;
      name: string;
      display_name: string;
    }>[];
    next_cursor: number | null;
  }>;
  /** Cached server observation, not a live balance or a promise of AI readiness. */
  export type Credits = Readonly<
    {
      organization: OrganizationsPage["organizations"][number];
      source: "cache";
      currency: "USD";
    } & (
      | {
          account_present: boolean;
          state: "not_provisioned";
          balance_cents: null;
          cache_updated_at: null;
          billing_gate: Readonly<{
            allowed: false;
            reason: "not_provisioned";
          }>;
        }
      | ({
          account_present: true;
          billing_gate:
            | Readonly<{ allowed: true; reason: null }>
            | Readonly<{
                allowed: false;
                reason: "below_floor" | "no_balance";
              }>;
        } & (
          | {
              state: "uncached";
              balance_cents: null;
              cache_updated_at: null;
            }
          | {
              state: "cached";
              balance_cents: number;
              cache_updated_at: string;
            }
        ))
    )
  >;
  /** Secret-bearing host boundary. Never serialize this object into presentation or logs. */
  export type Session = {
    issuer: string;
    clientId: string;
    apiOrigin: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    identity: Identity;
  };
  /** Legacy memory contract: one AuthClient must be the exclusive writer. */
  export type Custody = {
    read(): Promise<Session | null>;
    write(session: Session): Promise<void>;
    clear(): Promise<void>;
  };
  /** Secret-bearing snapshot. Revision is opaque, nonempty, and never reused. */
  export type CustodySnapshot = {
    revision: string;
    session: Session | null;
  };
  /** Valid only during exclusive(). Each write/clear durably advances revision,
   * including clearing an empty session. Reads observe the latest completed write.
   * Mutations resolve after completion; rejected writes must not publish partial state.
   */
  export type CustodyTransaction = {
    read(): Promise<CustodySnapshot>;
    write(session: Session): Promise<void>;
    clear(): Promise<void>;
  };
  /** Host-owned authority shared by every writer to one credential profile.
   * Hold exclusivity until the callback settles and release on every outcome.
   * Callback failure does NOT roll back completed mutations, particularly rotation.
   * The host owns bounded acquisition, crash recovery, storage, and revision durability.
   */
  export type CoordinatedCustody = {
    exclusive<T>(
      operation: (transaction: CustodyTransaction) => Promise<T>
    ): Promise<T>;
  };
  export type Request = {
    url: string;
    method: "GET" | "POST";
    headers: Record<string, string>;
    body?: string;
  };
  export type Response = { status: number; body: unknown };
  export type RequestOperation = { result: Promise<Response>; cancel(): void };
  export type Callback = {
    state: string;
    code?: string;
    error?: string;
    issuer?: string;
  };
  export type Listener = {
    redirectUri: string;
    result: Promise<Callback>;
    /** Synchronous, idempotent, nonthrowing. Settles result and closes owned I/O. */
    cancel(reason: "cancelled" | "browser_failed"): void;
    close(): Promise<void>;
  };
  /** Platform adapter contract. Use the supplied Node factory for native applications. */
  export type Host = {
    custody: Custody | CoordinatedCustody;
    now(): number;
    pkce(): Promise<{ state: string; verifier: string; challenge: string }>;
    listen(redirectUris: readonly string[], state: string): Promise<Listener>;
    openBrowser(url: string): Promise<void>;
    request(request: Request): RequestOperation;
  };
  export type FailureCode =
    | "invalid_config"
    | "login_in_progress"
    | "cancelled"
    | "callback_timeout"
    | "callback_unavailable"
    | "browser_failed"
    | "invalid_callback"
    | "access_denied"
    | "authorization_failed"
    | "token_rejected"
    | "unavailable"
    | "forbidden"
    | "unsupported_operation"
    | "invalid_input"
    | "invalid_response"
    | "signed_out"
    | "custody_failed"
    | "session_binding_mismatch"
    | "session_changed"
    | "session_busy";
  export class Failure extends Error {
    constructor(readonly code: FailureCode) {
      super(`Grida authentication failed (${code})`);
      this.name = "AuthFailure";
    }
  }
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

type AccountRead =
  | { operation: "organizations.list"; after: number | undefined }
  | { operation: "credits.read"; organizationId: number };

function accountRead(operation: string, input: unknown): AccountRead {
  if (operation === "organizations.list")
    return { operation, after: accountCursor(input) };
  if (operation !== "credits.read")
    throw new AuthClient.Failure("unsupported_operation");
  try {
    const value = record(input);
    if (
      !value ||
      Reflect.ownKeys(value).length !== 1 ||
      !Object.hasOwn(value, "organization_id")
    )
      throw new AuthClient.Failure("invalid_input");
    const organizationId = value.organization_id;
    if (!positiveInteger(organizationId))
      throw new AuthClient.Failure("invalid_input");
    return { operation, organizationId };
  } catch {
    throw new AuthClient.Failure("invalid_input");
  }
}

function accountCursor(input: unknown): number | undefined {
  if (input === undefined) return undefined;
  try {
    const value = record(input);
    if (!value || Reflect.ownKeys(value).some((key) => key !== "after"))
      throw new AuthClient.Failure("invalid_input");
    // Snapshot once before any await: accessors and caller mutation cannot
    // substitute an unvalidated value between validation and serialization.
    const after = value.after;
    if (after !== undefined && !positiveInteger(after))
      throw new AuthClient.Failure("invalid_input");
    return after;
  } catch {
    throw new AuthClient.Failure("invalid_input");
  }
}

function organization(
  value: unknown
): AuthClient.OrganizationsPage["organizations"][number] {
  const row = record(value);
  if (
    !row ||
    !positiveInteger(row.id) ||
    typeof row.name !== "string" ||
    row.name.length < 1 ||
    row.name.length > 39 ||
    typeof row.display_name !== "string"
  )
    throw new AuthClient.Failure("invalid_response");
  return { id: row.id, name: row.name, display_name: row.display_name };
}

function organizationsPage(
  value: unknown,
  after: number | undefined
): AuthClient.OrganizationsPage {
  const body = record(value);
  if (
    !body ||
    !Array.isArray(body.organizations) ||
    body.organizations.length > 100
  )
    throw new AuthClient.Failure("invalid_response");
  let last = after ?? 0;
  const organizations = body.organizations.map((value: unknown) => {
    const row = organization(value);
    if (row.id <= last) throw new AuthClient.Failure("invalid_response");
    last = row.id;
    return row;
  });
  if (
    body.next_cursor !== null &&
    (!positiveInteger(body.next_cursor) ||
      organizations.length === 0 ||
      body.next_cursor !== last)
  )
    throw new AuthClient.Failure("invalid_response");
  return { organizations, next_cursor: body.next_cursor };
}

function credits(value: unknown, organizationId: number): AuthClient.Credits {
  const body = record(value);
  const gate = record(body?.billing_gate);
  if (
    !body ||
    !gate ||
    body.source !== "cache" ||
    body.currency !== "USD" ||
    typeof body.account_present !== "boolean"
  )
    throw new AuthClient.Failure("invalid_response");
  const org = organization(body.organization);
  if (org.id !== organizationId)
    throw new AuthClient.Failure("invalid_response");
  const common = {
    organization: org,
    source: "cache",
    currency: "USD",
  } as const;
  if (body.state === "not_provisioned") {
    if (
      body.balance_cents !== null ||
      body.cache_updated_at !== null ||
      gate.allowed !== false ||
      gate.reason !== "not_provisioned"
    )
      throw new AuthClient.Failure("invalid_response");
    return {
      ...common,
      account_present: body.account_present,
      state: "not_provisioned",
      balance_cents: null,
      cache_updated_at: null,
      billing_gate: { allowed: false, reason: "not_provisioned" },
    };
  }
  if (body.account_present !== true)
    throw new AuthClient.Failure("invalid_response");
  // Only wire consistency is checked: amount, cache age and the gate's policy
  // are independent server observations. No local threshold or freshness rule.
  let billingGate: Extract<
    AuthClient.Credits,
    { state: "cached" }
  >["billing_gate"];
  if (gate.allowed === true && gate.reason === null)
    billingGate = { allowed: true, reason: null };
  else if (
    gate.allowed === false &&
    (gate.reason === "below_floor" || gate.reason === "no_balance")
  )
    billingGate = { allowed: false, reason: gate.reason };
  else throw new AuthClient.Failure("invalid_response");
  if (
    body.state === "uncached" &&
    body.balance_cents === null &&
    body.cache_updated_at === null
  )
    return {
      ...common,
      account_present: true,
      state: "uncached",
      balance_cents: null,
      cache_updated_at: null,
      billing_gate: billingGate,
    };
  if (
    body.state === "cached" &&
    typeof body.balance_cents === "number" &&
    Number.isSafeInteger(body.balance_cents) &&
    timestamp(body.cache_updated_at)
  )
    return {
      ...common,
      account_present: true,
      state: "cached",
      balance_cents: body.balance_cents,
      cache_updated_at: body.cache_updated_at,
      billing_gate: billingGate,
    };
  throw new AuthClient.Failure("invalid_response");
}

function timestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64) return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
      value
    );
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  // Date.parse normalizes impossible month days; validate the calendar too.
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]!;
}

function validateConfig(config: AuthClient.Config) {
  if (
    !config ||
    !opaque(config.clientId) ||
    !Array.isArray(config.redirectUris) ||
    config.redirectUris.length === 0 ||
    config.redirectUris.length > 8 ||
    new Set(config.redirectUris).size !== config.redirectUris.length ||
    typeof config.issuer !== "string" ||
    !config.issuer.endsWith("/auth/v1") ||
    !origin(config.issuer.slice(0, -8)) ||
    !origin(config.apiOrigin)
  )
    throw new AuthClient.Failure("invalid_config");
  const localIssuer = config.issuer.startsWith("http:");
  if (localIssuer !== config.apiOrigin.startsWith("http:"))
    throw new AuthClient.Failure("invalid_config");
  for (const uri of config.redirectUris) {
    const match =
      typeof uri === "string" &&
      /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})(\/[A-Za-z0-9/_-]+)$/.exec(uri);
    if (!match || Number(match[1]) > 65535 || match[2].includes("//"))
      throw new AuthClient.Failure("invalid_config");
  }
}

function origin(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(https?):\/\/([a-z0-9.-]+)(?::([1-9][0-9]{0,4}))?$/.exec(
    value
  );
  if (!match || (match[3] && Number(match[3]) > 65535)) return false;
  if (match[1] === "http") return match[2] === "127.0.0.1" && !!match[3];
  return match[2]!
    .split(".")
    .every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
}
function opaque(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 16_384 &&
    !/\s/.test(value)
  );
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function form(values: Record<string, string>) {
  return Object.entries(values)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    )
    .join("&");
}
function safeFailure(error: unknown): AuthClient.Failure {
  return error instanceof AuthClient.Failure
    ? error
    : new AuthClient.Failure("unavailable");
}

async function closeListener(listener: AuthClient.Listener | undefined) {
  try {
    await listener?.close();
  } catch {
    throw new AuthClient.Failure("callback_unavailable");
  }
}
