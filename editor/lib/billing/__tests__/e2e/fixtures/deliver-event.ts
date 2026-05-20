import type Stripe from "stripe";
import { stripe } from "../../..";

export type DeliverResult = {
  status: number;
  body:
    | { received: true; type: string; handler: string | null }
    | { received: true; replayed: true }
    | { error: string; detail?: string };
};

function appUrl(): string {
  const url = process.env.APP_URL;
  if (!url) throw new Error("APP_URL is required");
  return url.replace(/\/$/, "");
}

function webhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is required");
  return secret;
}

// The receiver only reads `id`, `type`, and `data.object`, so we don't fill
// the giant `Stripe.Event` discriminated union.
function buildEnvelope<T extends { id: string }>(
  type: string,
  object: T,
  eventId?: string
): Stripe.Event {
  const env = {
    id:
      eventId ??
      `evt_test_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    object: "event",
    api_version: "2026-04-22.dahlia",
    created: Math.floor(Date.now() / 1000),
    data: { object },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type,
  };
  // oxlint-disable-next-line typescript-eslint/no-explicit-any -- envelope shape; Stripe.Event is a giant union
  return env as any;
}

// Generic over the input shape so callers can pass real Stripe SDK
// responses (Customer, Subscription, etc.) or hand-rolled object literals
// without an extra-property check. Anything beyond `id` rides through as
// opaque JSON.
export async function deliverEvent<T extends { id: string }>(
  type: string,
  object: T,
  options: { eventId?: string; tamperSignature?: boolean } = {}
): Promise<DeliverResult> {
  const event = buildEnvelope(type, object, options.eventId);
  const payload = JSON.stringify(event);
  const sig = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret(),
  });
  const finalSig = options.tamperSignature
    ? sig.replace(/v1=[a-f0-9]+/, "v1=" + "0".repeat(64))
    : sig;

  const res = await fetch(`${appUrl()}/webhooks/stripe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": finalSig,
    },
    body: payload,
  });
  // Read once as text, then try to parse as JSON. If we called `res.json()`
  // first and it threw, the stream would already be drained — `res.text()` in
  // the catch would yield "" and we'd lose the actual error body Stripe (or
  // the route) returned, which is the most useful diagnostic.
  const raw = await res.text();
  let body: DeliverResult["body"];
  try {
    body = JSON.parse(raw) as DeliverResult["body"];
  } catch {
    body = { error: `non-json: ${raw}` };
  }
  return { status: res.status, body };
}
