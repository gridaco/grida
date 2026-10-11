/**
 * Stripe webhook source bridge.
 *
 * `GRIDA-SEC-001` — see `editor/app/(ingest)/README.md` and `/SECURITY.md`.
 * The shared bridge verifies the original signed bytes, captures durable source
 * custody, forwards to Platform and acknowledges only its accepted receipt.
 */
import { sourceWebhook } from "@/lib/platform/webhook-forwarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return sourceWebhook(request, "stripe");
}
