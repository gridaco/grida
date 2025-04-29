import { createClient } from "@/lib/supabase/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(20, "30d"),
});

export async function ai_credit_remaining({ user_id }: { user_id: string }) {
  const { reset, remaining } = await ratelimit.getRemaining(
    `ratelimit_u_${user_id}`
  );

  return {
    reset,
    remaining,
  };
}

export async function ai_credit_limit() {
  const client = await createClient();

  const { data: userdata, error: auth_err } = await client.auth.getUser();
  if (auth_err) throw new Error(auth_err.message);
  const user_id = userdata.user.id;

  // limit
  const { success, limit, reset, remaining } = await ratelimit.limit(
    `ratelimit_u_${user_id}`
  );

  const ratelimit_headers = {
    "x-ratelimit-limit": limit.toString(),
    "x-ratelimit-reset": reset.toString(),
    "x-ratelimit-remaining": remaining.toString(),
  };

  return {
    success: success,
    limit,
    reset,
    remaining,
    headers: ratelimit_headers,
  };
}
