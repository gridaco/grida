import Stripe from "stripe";

// Signature verification uses only the endpoint signing secret. This client
// never calls Stripe or loads financial API credentials.
const signatures = new Stripe("sk_test_signature_verification_only").webhooks;
export async function verifyStripeWebhook(
  body: Buffer,
  signature: string,
  secret: string,
  receivedAt: number
) {
  return signatures.constructEventAsync(
    body,
    signature,
    secret,
    300,
    undefined,
    receivedAt
  );
}
