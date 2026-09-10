// GRIDA-SEC-015 — scoped media credentials cannot establish native account identity.
import "server-only";
import { decodeJwt } from "jose";
import { oauthServer } from "./oauth-server";

/** GRIDA-SEC-010 — bearer-only account principal, verified by the fixed live issuer.
 * Cookies and GG credentials grant no authority here. */
export namespace bearer {
  export type Identity = Readonly<{
    id: string;
    email: string | null;
    display_name: string | null;
  }>;
  export type Principal = Readonly<{
    identity: Identity;
    client_id: string;
    session_id: string;
  }>;

  export async function authenticate(
    request: Request,
    dependencies: {
      config: oauthServer.Config;
      fetch: typeof fetch;
      now?: number;
    } = {
      config: oauthServer.config(),
      fetch: globalThis.fetch,
    }
  ): Promise<Principal> {
    const header = request.headers.get("authorization") ?? "";
    const match =
      /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(header);
    if (!match || header.length > 16_384)
      throw new oauthServer.Failure("unauthorized");
    const token = match[1]!;
    let claims;
    try {
      claims = decodeJwt(token);
    } catch {
      throw new oauthServer.Failure("unauthorized");
    }
    const now = Math.floor((dependencies.now ?? Date.now()) / 1000);
    // Preflight only: these decoded claims are not a verified identity. The
    // fixed issuer's userinfo endpoint below must accept the SAME token and its
    // live session before any claim is returned to application code. This also
    // works with the local issuer's symmetric signing key without importing it.
    if (
      claims.iss !== dependencies.config.issuer ||
      claims.aud !== "authenticated" ||
      typeof claims.exp !== "number" ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp <= now ||
      (claims.nbf !== undefined &&
        (typeof claims.nbf !== "number" || claims.nbf > now)) ||
      !oauthServer.uuid(claims.sub) ||
      !oauthServer.uuid(claims.session_id) ||
      typeof claims.client_id !== "string" ||
      !dependencies.config.clientIds.includes(claims.client_id)
    ) {
      throw new oauthServer.Failure("unauthorized");
    }
    const info = await oauthServer.request(
      dependencies.config,
      dependencies.fetch,
      "/oauth/userinfo",
      token
    );
    if (!oauthServer.record(info) || info.sub !== claims.sub)
      throw new oauthServer.Failure("unauthorized");
    if (
      (info.email != null && typeof info.email !== "string") ||
      (info.name != null && typeof info.name !== "string")
    ) {
      throw new oauthServer.Failure("auth_unavailable");
    }
    const metadata = oauthServer.record(info.user_metadata)
      ? info.user_metadata
      : {};
    const displayName =
      typeof metadata.full_name === "string" ? metadata.full_name : info.name;
    return {
      identity: {
        id: claims.sub,
        email: typeof info.email === "string" ? info.email : null,
        display_name: typeof displayName === "string" ? displayName : null,
      },
      client_id: claims.client_id,
      session_id: claims.session_id,
    };
  }
}
