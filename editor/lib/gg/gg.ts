// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: token — configured server binding over the host-independent policy.
import "server-only";

import { ggConfig } from "./config";
import { GgTokens } from "./tokens";

const owner = new GgTokens({
  signing: () => ggConfig.signing(),
  now: () => Date.now(),
  async allowMint(userId) {
    const limiter = await mintLimiter();
    return limiter ? (await limiter.limit(userId)).success : true;
  },
});

/** Shared scoped-token surface; hosts supply authentication and member lookup. */
export namespace gg {
  export const AUDIENCE = GgTokens.AUDIENCE;
  export const TTL_SECONDS = GgTokens.TTL_SECONDS;
  export type Principal = GgTokens.Principal;
  export type Organization = GgTokens.Organization;
  export type Membership = GgTokens.Membership;
  export type Grant = GgTokens.Grant;
  export type Claims = GgTokens.Claims;
  export const TokenError = GgTokens.TokenError;
  export type TokenError = GgTokens.TokenError;
  export const MintError = GgTokens.MintError;
  export type MintError = GgTokens.MintError;
  export const mint = owner.mint.bind(owner);
  export const sign = owner.sign.bind(owner);
  export const verify = owner.verify.bind(owner);
  export const allowMint = owner.allowMint.bind(owner);
}

type MintLimiter = { limit(key: string): Promise<{ success: boolean }> };
let configuredLimiter: Promise<MintLimiter | null> | undefined;

function mintLimiter(): Promise<MintLimiter | null> {
  // One initialization even when two hosts mint concurrently. An upstream
  // failure never becomes an unconfigured/fail-open limiter.
  return (configuredLimiter ??= createMintLimiter().catch((error) => {
    configuredLimiter = undefined;
    throw error;
  }));
}

async function createMintLimiter(): Promise<MintLimiter | null> {
  const config = ggConfig.limiter();
  if (!config) return null;
  const [{ Ratelimit }, { Redis }] = await Promise.all([
    import("@upstash/ratelimit"),
    import("@upstash/redis"),
  ]);
  return new Ratelimit({
    redis: new Redis(config),
    limiter: Ratelimit.slidingWindow(10, "60 s"),
    prefix: "rl:v1-ai:mint",
  });
}
