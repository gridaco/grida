// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: token — compatibility exports; implementation lives in lib/gg.
import { gg } from "../gg/gg";

export const GG_TOKEN_AUDIENCE = gg.AUDIENCE;
export const GG_TOKEN_TTL_SECONDS = gg.TTL_SECONDS;
export type GgTokenClaims = gg.Claims;
export const GgTokenError = gg.TokenError;
export type GgTokenError = gg.TokenError;
export const signGgToken = gg.sign;
export const verifyGgToken = gg.verify;
export const allowGgTokenMint = gg.allowMint;
