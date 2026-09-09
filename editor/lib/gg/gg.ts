// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: token — configured server binding over the host-independent policy.
import "server-only";

import { ggConfig } from "./config";
import { GgTokens } from "./tokens";

const owner = new GgTokens({
  signing: () => ggConfig.signing(),
  now: () => Date.now(),
  async allowMint(userId) {
    try {
      const limiter = await mintLimiter();
      if (!limiter) return true;
      const result = await limiter.limit(userId);
      // The SDK deliberately allows on timeout. Configured mint quotas must
      // fail closed instead; a later Redis completion cannot resume this mint.
      if (result.reason === "timeout")
        throw new GgTokens.MintError("unavailable");
      return result.success;
    } catch {
      // Provider failures may contain credentials; expose only a safe domain code.
      throw new GgTokens.MintError("unavailable");
    }
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

type MintLimiter = Pick<import("@upstash/ratelimit").Ratelimit, "limit">;
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
    timeout: 5000,
  });
}
