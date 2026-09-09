// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: token — policy receives its clock, key reader and quota capability.
import { SignJWT, jwtVerify, errors as joseErrors } from "jose";

/** Internal policy; the configured server surface is the gg namespace. */
export class GgTokens {
  constructor(private readonly host: GgTokens.Host) {}

  /**
   * One mint policy for every authenticated host: quota → membership → sign.
   * A raw organization is never a mint input. The trusted host capability must
   * resolve membership for the supplied principal, including any host selector.
   */
  async mint(
    principal: GgTokens.Principal,
    membership: GgTokens.Membership
  ): Promise<GgTokens.Grant> {
    const userId = principal.id;
    if (typeof userId !== "string" || userId.length === 0)
      throw new GgTokens.TokenError(
        "invalid_token",
        "missing authenticated principal"
      );
    if (!(await this.allowMint(userId)))
      throw new GgTokens.MintError("rate_limited");
    const member = await membership.organization(userId);
    if (member === null) throw new GgTokens.MintError("no_organization");
    const { id, name } = member;
    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      typeof name !== "string" ||
      !name
    )
      throw new GgTokens.TokenError(
        "invalid_token",
        "invalid member organization"
      );
    const { token, expiresAt } = await this.sign(userId, id);
    return {
      token,
      expires_at: expiresAt.toISOString(),
      organization: { id, name },
    };
  }

  /** Low-level signer retained for the existing trusted server contract. */
  async sign(
    sub: string,
    org: number
  ): Promise<{ token: string; expiresAt: Date }> {
    if (typeof sub !== "string" || sub.length === 0)
      throw new GgTokens.TokenError(
        "invalid_token",
        "signGgToken: missing sub"
      );
    if (!Number.isSafeInteger(org) || org <= 0)
      throw new GgTokens.TokenError(
        "invalid_token",
        "signGgToken: invalid org id"
      );
    const { current } = this.host.signing();
    if (!current) throw new GgTokens.TokenError("not_configured");
    const iat = Math.floor(this.host.now() / 1000);
    const exp = iat + GgTokens.TTL_SECONDS;
    const token = await new SignJWT({ org })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(sub)
      .setAudience(GgTokens.AUDIENCE)
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(current);
    return { token, expiresAt: new Date(exp * 1000) };
  }

  /** GG bearer only. No cookie, account token or provider credential fallback. */
  async verify(request: Request): Promise<GgTokens.Claims> {
    const match = /^Bearer\s+(.+)$/i.exec(
      request.headers.get("authorization") ?? ""
    );
    if (!match)
      throw new GgTokens.TokenError("invalid_token", "missing bearer token");
    const now = this.host.now();
    const payload = await this.verifyWithRotation(match[1]!, now);
    if (typeof payload.sub !== "string" || !payload.sub)
      throw new GgTokens.TokenError("invalid_token", "missing sub claim");
    const org = payload.org;
    if (typeof org !== "number" || !Number.isSafeInteger(org) || org <= 0)
      throw new GgTokens.TokenError("invalid_token", "invalid org claim");
    const { iat, exp } = payload;
    if (
      typeof iat !== "number" ||
      typeof exp !== "number" ||
      !Number.isSafeInteger(iat) ||
      !Number.isSafeInteger(exp) ||
      exp <= iat ||
      exp - iat > GgTokens.TTL_SECONDS ||
      iat > Math.floor(now / 1000) + 60
    )
      throw new GgTokens.TokenError("invalid_token", "invalid token window");
    return {
      sub: payload.sub,
      org,
      aud: GgTokens.AUDIENCE,
      iat,
      exp,
    };
  }

  /** Shared per-user mint quota, independent of host or selected organization. */
  async allowMint(userId: string): Promise<boolean> {
    return this.host.allowMint(userId);
  }

  private async verifyWithRotation(token: string, now: number) {
    const options = {
      audience: GgTokens.AUDIENCE,
      algorithms: ["HS256"],
      requiredClaims: ["iat", "exp"],
      clockTolerance: 60,
      currentDate: new Date(now),
    };
    const { current, previous } = this.host.signing();
    if (!current) throw new GgTokens.TokenError("not_configured");
    try {
      return (await jwtVerify(token, current, options)).payload;
    } catch (error) {
      if (error instanceof joseErrors.JWTExpired)
        throw new GgTokens.TokenError("token_expired");
      if (
        previous &&
        error instanceof joseErrors.JWSSignatureVerificationFailed
      ) {
        try {
          return (await jwtVerify(token, previous, options)).payload;
        } catch (previousError) {
          if (previousError instanceof joseErrors.JWTExpired)
            throw new GgTokens.TokenError("token_expired");
          throw new GgTokens.TokenError("invalid_token");
        }
      }
      throw new GgTokens.TokenError("invalid_token");
    }
  }
}

export namespace GgTokens {
  export const AUDIENCE = "gg:ai";
  export const TTL_SECONDS = 900;

  export type Principal = Readonly<{ id: string }>;
  export type Organization = Readonly<{ id: number; name: string }>;
  export type Membership = {
    /** Return only a currently verified member organization for this user. */
    organization(userId: string): Promise<Organization | null>;
  };
  export type Grant = {
    token: string;
    expires_at: string;
    organization: { id: number; name: string };
  };
  export type Claims = {
    sub: string;
    org: number;
    aud: typeof AUDIENCE;
    iat: number;
    exp: number;
  };

  export class TokenError extends Error {
    constructor(
      readonly code: "token_expired" | "invalid_token" | "not_configured",
      message?: string
    ) {
      super(message ?? code);
      this.name = "GgTokenError";
    }
  }

  export class MintError extends Error {
    constructor(readonly code: "rate_limited" | "no_organization") {
      super(code);
      this.name = "GgMintError";
    }
  }

  export type Host = {
    signing(): { current: Uint8Array | null; previous: Uint8Array | null };
    allowMint(userId: string): Promise<boolean>;
    now(): number;
  };
}
