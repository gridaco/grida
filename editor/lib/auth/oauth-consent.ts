import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { oauthServer } from "./oauth-server";

/** GRIDA-SEC-010 — browser intent bound to the issuer's authorization details. */
export namespace oauthConsent {
  export type Browser = Readonly<{ id: string; access_token: string }>;
  export type View =
    | Readonly<{ kind: "redirect"; url: string }>
    | Readonly<{
        kind: "consent";
        authorization_id: string;
        client_name: string;
        email: string | null;
        scopes: readonly string[];
        proof: string;
      }>;
  type Details = {
    authorization_id: string;
    client_id: string;
    client_name: string;
    user_id: string;
    email: string | null;
    redirect_uri: string;
    scope: string;
  };
  const PROOF_AUDIENCE = "grida:oauth-consent";

  export function authorizationId(value: unknown): string {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(value)) {
      throw new oauthServer.Failure("invalid_request");
    }
    return value;
  }

  export function path(id: string): string {
    return `/oauth/consent?${new URLSearchParams({ authorization_id: authorizationId(id) })}`;
  }

  /** Direct insiders resume avoids both Desktop's challenge branch and the
   * ordinary sign-in page's already-signed-in redirect to '/'. */
  export function insidersPath(
    id: string,
    config: Pick<oauthServer.ConsentConfig, "origin">
  ): string {
    // The existing insiders handler resolves relative next against Next's
    // reconstructed request URL, which can have an internal localhost host.
    const next = new URL(path(id), config.origin).href;
    return `/insiders/auth/basic?${new URLSearchParams({ next })}`;
  }

  /** GET navigation need not carry Origin, but must use the configured web host. */
  export function requireHost(
    headers: Pick<Headers, "get">,
    config: Pick<oauthServer.ConsentConfig, "origin">
  ): void {
    // Next may reconstruct request.url with an internal hostname. Incoming Host
    // is authoritative; forwarded headers never expand the configured origin.
    if (headers.get("host") !== new URL(config.origin).host) {
      throw new oauthServer.Failure("forbidden");
    }
  }

  export function requireOrigin(
    request: Request,
    config: oauthServer.ConsentConfig
  ): void {
    requireHost(request.headers, config);
    if (request.headers.get("origin") !== config.origin) {
      throw new oauthServer.Failure("forbidden");
    }
  }

  export function issuerRedirect(
    value: unknown,
    config: oauthServer.ConsentConfig
  ): string {
    const url = oauthServer.parseUrl(value);
    if (!url || url.username || url.password || url.hash)
      throw new oauthServer.Failure("forbidden");
    const base = `${url.origin}${url.pathname}`;
    // URL parsing normalizes alternate IP spellings, dot segments, and slashes.
    // The issuer must return the registered callback spelling exactly.
    if (
      typeof value !== "string" ||
      value.split("?")[0] !== base ||
      !config.redirectUris.includes(base)
    )
      throw new oauthServer.Failure("forbidden");
    const entries = [...url.searchParams.entries()];
    const allowed = new Set(["code", "state", "error", "error_description"]);
    if (
      entries.some(
        ([key, item]) =>
          !allowed.has(key) ||
          url.searchParams.getAll(key).length !== 1 ||
          item.length > 4096 ||
          // oxlint-disable-next-line no-control-regex -- Reject ASCII controls in issuer callback parameters.
          /[\u0000-\u001f\u007f]/.test(item)
      )
    ) {
      throw new oauthServer.Failure("forbidden");
    }
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    if (
      !url.searchParams.get("state") ||
      Boolean(code) === Boolean(error) ||
      (url.searchParams.has("code") && url.searchParams.has("error")) ||
      (url.searchParams.has("code") &&
        url.searchParams.has("error_description")) ||
      (error && !/^[a-z_]{1,128}$/.test(error))
    ) {
      throw new oauthServer.Failure("forbidden");
    }
    return url.toString();
  }

  export class Service {
    constructor(
      readonly config: oauthServer.ConsentConfig,
      private readonly fetcher: typeof fetch = globalThis.fetch,
      private readonly now: () => number = Date.now
    ) {}

    async load(id: string, browser: Browser): Promise<View> {
      const data = await this.get(authorizationId(id), browser);
      if (oauthServer.record(data) && "redirect_url" in data) {
        // Prior consent may auto-approve at the issuer and omit client details.
        // Only configured native callbacks are accepted; bearer APIs still
        // independently verify the OAuth client on every request.
        return {
          kind: "redirect",
          url: issuerRedirect(data.redirect_url, this.config),
        };
      }
      const details = this.details(data, id, browser);
      const now = Math.floor(this.now() / 1000);
      const proof = await new SignJWT({
        authorization_id: details.authorization_id,
        client_id: details.client_id,
        redirect_uri: details.redirect_uri,
        scope: details.scope,
      })
        .setProtectedHeader({ alg: "HS256", typ: "grida-consent+jwt" })
        .setSubject(browser.id)
        .setIssuer(this.config.origin)
        .setAudience(PROOF_AUDIENCE)
        .setIssuedAt(now)
        .setExpirationTime(now + 600)
        .sign(this.config.secret);
      return {
        kind: "consent",
        authorization_id: details.authorization_id,
        client_name: details.client_name,
        email: details.email,
        scopes: details.scope.split(" "),
        proof,
      };
    }

    async decide(request: Request, browser: Browser): Promise<string> {
      requireOrigin(request, this.config);
      if (
        request.headers.get("content-type")?.split(";")[0]?.trim() !==
        "application/x-www-form-urlencoded"
      ) {
        throw new oauthServer.Failure("invalid_request");
      }
      const form = new URLSearchParams(
        await oauthServer.readText(request, 8192)
      );
      const names = ["authorization_id", "proof", "decision"];
      if (
        [...form.keys()].some((key) => !names.includes(key)) ||
        names.some((key) => form.getAll(key).length !== 1)
      ) {
        throw new oauthServer.Failure("invalid_request");
      }
      const id = authorizationId(form.get("authorization_id"));
      const decision = form.get("decision");
      if (decision !== "approve" && decision !== "deny")
        throw new oauthServer.Failure("invalid_request");
      let proof;
      try {
        ({ payload: proof } = await jwtVerify(
          form.get("proof")!,
          this.config.secret,
          {
            algorithms: ["HS256"],
            typ: "grida-consent+jwt",
            issuer: this.config.origin,
            audience: PROOF_AUDIENCE,
            subject: browser.id,
            currentDate: new Date(this.now()),
          }
        ));
      } catch {
        throw new oauthServer.Failure("forbidden");
      }
      if (proof.authorization_id !== id)
        throw new oauthServer.Failure("forbidden");
      // Re-read pending authorization after verifying browser intent. A stale
      // form cannot silently approve another user, client, callback, or scope.
      const details = this.details(await this.get(id, browser), id, browser);
      if (
        details.client_id !== proof.client_id ||
        details.redirect_uri !== proof.redirect_uri ||
        details.scope !== proof.scope
      ) {
        throw new oauthServer.Failure("forbidden");
      }
      const result = await oauthServer.request(
        this.config,
        this.fetcher,
        `/oauth/authorizations/${id}/consent`,
        browser.access_token,
        { action: decision },
        this.config.origin
      );
      if (!oauthServer.record(result))
        throw new oauthServer.Failure("auth_unavailable");
      const target = issuerRedirect(result.redirect_url, this.config);
      if (
        `${new URL(target).origin}${new URL(target).pathname}` !==
        details.redirect_uri
      ) {
        throw new oauthServer.Failure("forbidden");
      }
      return target;
    }

    private get(id: string, browser: Browser): Promise<unknown> {
      return oauthServer.request(
        this.config,
        this.fetcher,
        `/oauth/authorizations/${id}`,
        browser.access_token,
        undefined,
        this.config.origin
      );
    }

    private details(data: unknown, id: string, browser: Browser): Details {
      if (
        !oauthServer.record(data) ||
        !oauthServer.record(data.client) ||
        !oauthServer.record(data.user) ||
        data.authorization_id !== id ||
        data.user.id !== browser.id ||
        typeof data.client.id !== "string" ||
        !this.config.clientIds.includes(data.client.id) ||
        typeof data.redirect_uri !== "string" ||
        !this.config.redirectUris.includes(data.redirect_uri) ||
        typeof data.scope !== "string"
      ) {
        throw new oauthServer.Failure("forbidden");
      }
      const scopes = [...new Set(data.scope.split(" ").filter(Boolean))].sort();
      if (
        scopes.length === 0 ||
        scopes.some((scope) => scope !== "email" && scope !== "profile")
      ) {
        throw new oauthServer.Failure("forbidden");
      }
      return {
        authorization_id: id,
        client_id: data.client.id,
        client_name:
          typeof data.client.name === "string" && data.client.name
            ? data.client.name
            : "Grida CLI",
        user_id: browser.id,
        email: typeof data.user.email === "string" ? data.user.email : null,
        redirect_uri: data.redirect_uri,
        scope: scopes.join(" "),
      };
    }
  }
}
