// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
/**
 * Per-user rate limits for the hosted `/api/v1/ai/*` endpoints.
 *
 * Abuse damping only — the billing gate (entitlement + balance floor)
 * is the real spend control. Keyed on the token's `sub` (per-user, not
 * per-org: org-keying would let one member starve another; the
 * entitlement gate already bounds org spend). Upstash sliding window
 * when configured; fail-open in unconfigured envs (local dev) — the
 * same posture as the library search limiter.
 */
import "server-only";

type Limiter = {
  limit(key: string): Promise<{ success: boolean; reset: number }>;
};

type LimiterName = "chat" | "models" | "images" | "video";

const CONFIG: Record<LimiterName, { tokens: number; window: `${number} s` }> = {
  chat: { tokens: 60, window: "60 s" },
  models: { tokens: 60, window: "60 s" },
  images: { tokens: 12, window: "60 s" },
  video: { tokens: 4, window: "600 s" },
};

const _limiters = new Map<LimiterName, Limiter | null>();

async function limiterFor(name: LimiterName): Promise<Limiter | null> {
  if (_limiters.has(name)) return _limiters.get(name)!;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    _limiters.set(name, null);
    return null;
  }
  const [{ Ratelimit }, { Redis }] = await Promise.all([
    import("@upstash/ratelimit"),
    import("@upstash/redis"),
  ]);
  const { tokens, window } = CONFIG[name];
  const limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(tokens, window),
    prefix: `rl:v1-ai:${name}`,
  });
  _limiters.set(name, limiter);
  return limiter;
}

export async function allowAiRequest(
  name: LimiterName,
  userId: string
): Promise<{ success: boolean; retryAfterSeconds?: number }> {
  const limiter = await limiterFor(name);
  if (!limiter) return { success: true };
  const { success, reset } = await limiter.limit(userId);
  return success
    ? { success }
    : { success, retryAfterSeconds: Math.max(1, (reset - Date.now()) / 1000) };
}
