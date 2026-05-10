// `grida_billing` is not exposed to PostgREST; reach state via public
// wrapper RPCs. Webhook idempotency is checked through the receiver's HTTP
// response, not the DB, since `stripe_event` has no public read.

import { service_role } from "@/lib/supabase/server";
import { getCatalogueStripeIds, getCustomerId } from "../../..";

export interface ActiveSubscription {
  stripe_subscription_id: string | null;
  status: string;
  quantity: number;
  plan: string;
  cancel_at_period_end: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
}

export async function readActiveSubscription(
  org_id: number
): Promise<ActiveSubscription | null> {
  const { data, error } = await service_role.workspace.rpc(
    "fn_billing_get_active_subscription",
    { p_org_id: org_id }
  );
  if (error) throw new Error(`readActiveSubscription: ${error.message}`);
  const row = (
    Array.isArray(data) ? data[0] : null
  ) as ActiveSubscription | null;
  if (!row) return null;
  return {
    stripe_subscription_id: row.stripe_subscription_id ?? null,
    status: row.status,
    quantity: row.quantity,
    plan: row.plan,
    cancel_at_period_end: row.cancel_at_period_end,
    current_period_start: row.current_period_start ?? null,
    current_period_end: row.current_period_end ?? null,
  };
}

export const readCustomerId = getCustomerId;

export async function getProPriceId(): Promise<string> {
  const cat = await getCatalogueStripeIds("plan.pro");
  if (!cat) {
    throw new Error(
      "plan.pro price not wired. Run: pnpm tsx editor/scripts/billing/cli.ts setup:stripe"
    );
  }
  return cat.stripe_price_id;
}

export async function awaitDb<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  options: { tries?: number; intervalMs?: number; label?: string } = {}
): Promise<T> {
  const tries = options.tries ?? 15;
  const intervalMs = options.intervalMs ?? 200;
  let last: T | undefined;
  for (let i = 0; i < tries; i++) {
    last = await read();
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `awaitDb${options.label ? ` (${options.label})` : ""}: predicate false after ${tries} tries (${tries * intervalMs}ms). last=${JSON.stringify(last)}`
  );
}
