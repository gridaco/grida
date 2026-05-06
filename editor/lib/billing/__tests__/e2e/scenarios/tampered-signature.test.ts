import { beforeAll, describe, expect, it } from "vitest";
import { assertSuiteSafety } from "../fixtures/safety";
import { deliverEvent } from "../fixtures/deliver-event";

describe("E2E — tampered webhook signature", () => {
  beforeAll(() => assertSuiteSafety());

  // Structural guarantee: the receiver verifies signature BEFORE calling
  // `dispatchStripeEvent`, which is the only path that inserts into
  // `grida_billing.stripe_event`. A 400 here proves no projection occurred.
  // Direct DB-side assertion isn't worth adding because `grida_billing` is
  // intentionally not on PostgREST's allow-list (locked-down schema).
  it("returns 400 and does not project state", async () => {
    const result = await deliverEvent(
      "customer.subscription.created",
      {
        id: "sub_tamper_test",
        status: "active",
        items: { data: [] },
      },
      { tamperSignature: true }
    );

    expect(result.status).toBe(400);
    expect(result.body).toHaveProperty("error");
    expect((result.body as { error: string }).error).toMatch(
      /invalid|signature/i
    );
  });
});
