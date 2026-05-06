// Stripe billing for Grida orgs: clients, auth, redirect validation, data
// helpers, and webhook projector dispatch. All projection logic lives in
// `public.fn_billing_apply_stripe_event`; TS only signs/parses/dispatches.

import Stripe from "stripe";
// Relative (not `@/lib/...`) so tsx-driven scripts that import this module
// don't need a tsconfig-paths shim to resolve the alias.
import { service_role } from "../supabase/server";

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const STRIPE_API_VERSION = "2026-04-22.dahlia" as const;

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  throw new Error("STRIPE_SECRET_KEY is required.");
}
if (
  process.env.BILLING_TEST_MODE === "true" &&
  !stripeKey.startsWith("sk_test_")
) {
  throw new Error(
    "BILLING_TEST_MODE=true but STRIPE_SECRET_KEY is not a test key."
  );
}

export const stripe = new Stripe(stripeKey, {
  apiVersion: STRIPE_API_VERSION,
  httpClient: Stripe.createFetchHttpClient(),
  typescript: true,
});
export type { Stripe };

// `grida_billing` is locked down — all access goes through `fn_billing_*`
// RPCs and `v_billing_*` views on `public`. We piggy-back on the project's
// shared `service_role.workspace` (also "public"-scoped) at each call site.

// supabase-js returns `RETURNS TABLE` RPCs as arrays; unwrap to the first row.
function firstRow<T>(data: T | T[] | null | undefined): T | null {
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  return (data as T | null) ?? null;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

// One error class for every billing-action failure mode. `code` is the stable
// machine-readable tag callers branch on; `status` is the HTTP code; `redirect`
// is an optional path the UI should send the user to (e.g. "billing/upgrade").
export class BillingError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number = 400,
    readonly redirect?: string
  ) {
    super(message);
    this.name = "BillingError";
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function assertOrgMember(
  user_id: string,
  org_id: string | number
): Promise<void> {
  if (!user_id) throw new BillingError("unauthorized", "unauthorized", 401);
  const orgId = typeof org_id === "string" ? Number(org_id) : org_id;
  if (!Number.isFinite(orgId)) {
    throw new BillingError(`invalid org_id: ${org_id}`, "invalid_org", 403);
  }

  const { data, error } = await service_role.workspace
    .from("organization_member")
    .select("id")
    .eq("organization_id", orgId)
    .eq("user_id", user_id)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new BillingError(
      `membership check failed: ${error.message}`,
      "membership_check_failed",
      403
    );
  }
  if (!data) {
    throw new BillingError(
      "not a member of this organization",
      "not_member",
      403
    );
  }
}

export async function assertOrgOwner(
  user_id: string,
  org_id: string | number
): Promise<void> {
  if (!user_id) throw new BillingError("unauthorized", "unauthorized", 401);
  const orgId = typeof org_id === "string" ? Number(org_id) : org_id;
  if (!Number.isFinite(orgId)) {
    throw new BillingError(`invalid org_id: ${org_id}`, "invalid_org", 403);
  }

  const { data, error } = await service_role.workspace
    .from("organization")
    .select("owner_id")
    .eq("id", orgId)
    .maybeSingle();

  if (error) {
    throw new BillingError(
      `owner check failed: ${error.message}`,
      "owner_check_failed",
      403
    );
  }
  if (!data || data.owner_id !== user_id) {
    throw new BillingError(
      "not the owner of this organization",
      "not_owner",
      403
    );
  }
}

// ---------------------------------------------------------------------------
// Redirect validation
// ---------------------------------------------------------------------------

// URL must be absolute, http(s), and origin-equal to the request origin or
// `NEXT_PUBLIC_BASE_URL`. Stripe Checkout accepts any URL we hand it, so this
// is the place we draw the line.
export function assertAllowedRedirect(
  url: string | undefined,
  request_origin: string
): string {
  if (!url) {
    throw new BillingError(
      "invalid redirect",
      "invalid_redirect",
      400,
      "billing"
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BillingError(
      "invalid redirect",
      "invalid_redirect",
      400,
      "billing"
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BillingError(
      "invalid redirect",
      "invalid_redirect",
      400,
      "billing"
    );
  }
  const allowedOrigin = new URL(request_origin).origin;
  const baseEnv = process.env.NEXT_PUBLIC_BASE_URL;
  let baseOrigin: string | null = null;
  if (baseEnv) {
    try {
      baseOrigin = new URL(baseEnv).origin;
    } catch {
      // ignore malformed env
    }
  }
  if (parsed.origin !== allowedOrigin && parsed.origin !== baseOrigin) {
    throw new BillingError(
      "invalid redirect",
      "invalid_redirect",
      400,
      "billing"
    );
  }
  return parsed.toString();
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

export async function getCustomerId(org_id: number): Promise<string | null> {
  const { data, error } = await service_role.workspace.rpc(
    "fn_billing_get_customer_id",
    {
      p_org_id: org_id,
    }
  );
  if (error) throw new Error(`getCustomerId: ${error.message}`);
  return typeof data === "string" && data ? data : null;
}

export async function getCatalogueStripeIds(
  grida_billing_id: string
): Promise<{ stripe_product_id: string; stripe_price_id: string } | null> {
  const { data, error } = await service_role.workspace.rpc(
    "fn_billing_get_catalogue",
    {
      p_id: grida_billing_id,
    }
  );
  if (error) throw new Error(`getCatalogueStripeIds: ${error.message}`);
  const row = firstRow<{
    stripe_product_id?: string | null;
    stripe_price_id?: string | null;
  }>(data);
  if (!row?.stripe_product_id || !row.stripe_price_id) return null;
  return {
    stripe_product_id: row.stripe_product_id,
    stripe_price_id: row.stripe_price_id,
  };
}

export async function getActivePaidSubscription(org_id: number): Promise<{
  stripe_subscription_id: string;
  status: string;
  quantity: number;
} | null> {
  const { data, error } = await service_role.workspace.rpc(
    "fn_billing_get_active_subscription",
    {
      p_org_id: org_id,
    }
  );
  if (error) throw new Error(`getActivePaidSubscription: ${error.message}`);
  const row = firstRow<{
    stripe_subscription_id?: string | null;
    status?: string | null;
    quantity?: number | null;
  }>(data);
  if (!row?.stripe_subscription_id) return null;
  return {
    stripe_subscription_id: row.stripe_subscription_id,
    status: row.status ?? "active",
    quantity: row.quantity ?? 1,
  };
}

export async function countOrgMembers(org_id: number): Promise<number> {
  const { count, error } = await service_role.workspace
    .from("organization_member")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org_id);
  if (error) throw new Error(`countOrgMembers: ${error.message}`);
  return count ?? 0;
}

// Resolve `account.stripe_customer_id` for an org; mint + persist if absent.
// Race-safe via `fn_billing_attach_stripe_customer` — concurrent callers
// converge on the first-written id.
export async function resolveOrCreateStripeCustomer(
  org_id: number
): Promise<string> {
  const cached = await getCustomerId(org_id);
  if (cached) return cached;

  const orgRow = await service_role.workspace
    .from("organization")
    .select("name, display_name, email")
    .eq("id", org_id)
    .maybeSingle();
  const orgName =
    orgRow.data?.display_name ?? orgRow.data?.name ?? `org-${org_id}`;
  const ownerEmail = orgRow.data?.email ?? undefined;

  const created = await stripe.customers.create({
    name: orgName,
    email: ownerEmail,
    metadata: { grida_organization_id: String(org_id) },
  });

  const attachRes = await service_role.workspace.rpc(
    "fn_billing_attach_stripe_customer",
    {
      p_org_id: org_id,
      p_stripe_customer_id: created.id,
    }
  );
  if (attachRes.error) {
    throw new Error(
      `resolveOrCreateStripeCustomer attach: ${attachRes.error.message}`
    );
  }
  const row = firstRow<{ stripe_customer_id?: string | null }>(attachRes.data);
  return row?.stripe_customer_id ?? created.id;
}

// ---------------------------------------------------------------------------
// Webhook projector
// ---------------------------------------------------------------------------

type StripeEventDispatchResult = {
  result: "handled" | "replayed";
  handler: string | null;
};

// `charge.dispute.*` events lack the subscription id; the projector requires
// `metadata.grida_subscription_id`. Walk dispute → charge → invoice → sub
// before dispatching. If we can't resolve, leave it — the projector raises
// a clear error and Stripe retries.
async function enrichDispute(
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const md = payload.metadata as Record<string, unknown> | null | undefined;
  if (md && typeof md.grida_subscription_id === "string") return payload;

  const chargeRef = payload.charge;
  const chargeId =
    typeof chargeRef === "string"
      ? chargeRef
      : (chargeRef as { id?: string } | null)?.id;
  if (!chargeId) return payload;

  try {
    const charge = (await stripe.charges.retrieve(chargeId, {
      expand: ["invoice"],
    })) as unknown as { invoice?: unknown };
    const invoice = charge.invoice as
      | { subscription?: string | { id: string } | null }
      | string
      | null
      | undefined;
    if (!invoice || typeof invoice === "string") return payload;
    const sub = invoice.subscription;
    const subId = typeof sub === "string" ? sub : sub?.id;
    if (!subId) return payload;
    return {
      ...payload,
      metadata: { ...md, grida_subscription_id: subId },
    };
  } catch (err) {
    console.warn("[billing] dispute pre-resolve failed:", err);
    return payload;
  }
}

export async function dispatchStripeEvent(
  event: Stripe.Event
): Promise<StripeEventDispatchResult> {
  // oxlint-disable-next-line typescript-eslint/no-explicit-any -- Stripe object shape varies per event type; jsonb passthrough
  let payload: any = event.data.object;
  if (event.type.startsWith("charge.dispute.")) {
    payload = await enrichDispute(payload as Record<string, unknown>);
  }

  const { data, error } = await service_role.workspace.rpc(
    "fn_billing_apply_stripe_event",
    {
      p_event_id: event.id,
      p_event_type: event.type,
      p_payload: payload,
    }
  );
  if (error) throw new Error(`apply_stripe_event: ${error.message}`);

  const row = firstRow(data) as {
    result?: "handled" | "replayed";
    handler?: string | null;
  } | null;
  return {
    result: row?.result ?? "handled",
    handler: row?.handler ?? null,
  };
}

// Failure stamps go through a separate RPC so they survive the projector's
// RAISE-driven rollback.
export async function stampStripeEventFailure(
  eventId: string,
  reason: string
): Promise<void> {
  const { error } = await service_role.workspace.rpc(
    "fn_billing_stamp_failure",
    {
      p_event_id: eventId,
      p_reason: reason,
    }
  );
  if (error) console.warn("[billing] stamp_failure:", error.message);
}
