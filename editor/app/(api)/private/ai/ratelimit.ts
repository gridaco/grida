import { createClient } from "@/lib/supabase/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * AI usage budget enforced via Upstash sliding-window rate limiter.
 *
 * Units are **mills** (1 mill = $0.001 USD).
 * Budget: 1000 mills = $1.00 per 30-day rolling window.
 *
 * Each API call deducts `Math.ceil(cost_usd * 1000)` mills from the
 * user's budget.
 */
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(1000, "30d"),
});

/**
 * Read the user's remaining budget (in mills) without consuming any.
 */
export async function ai_budget_remaining({ user_id }: { user_id: string }) {
  const { reset, remaining } = await ratelimit.getRemaining(
    `ratelimit_u_${user_id}`
  );

  return { reset, remaining };
}

/**
 * Deduct `cost_mills` from the authenticated user's budget.
 *
 * @param cost_mills - integer cost in mills (`Math.ceil(cost_usd * 1000)`)
 */
export async function ai_budget_deduct(cost_mills: number) {
  if (!Number.isFinite(cost_mills) || cost_mills <= 0) {
    throw new Error("cost_mills must be a positive finite number");
  }

  const client = await createClient();

  const { data: userdata, error: auth_err } = await client.auth.getUser();
  if (auth_err) throw new Error(auth_err.message);
  if (!userdata.user) throw new Error("Unauthorized");
  const user_id = userdata.user.id;

  const { success, limit, reset, remaining } = await ratelimit.limit(
    `ratelimit_u_${user_id}`,
    { rate: cost_mills }
  );

  const ratelimit_headers = {
    "x-ratelimit-limit": limit.toString(),
    "x-ratelimit-reset": reset.toString(),
    "x-ratelimit-remaining": remaining.toString(),
  };

  return {
    success,
    limit,
    reset,
    remaining,
    headers: ratelimit_headers,
  };
}
