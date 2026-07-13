import { describe, expect, it } from "vitest";
import { gridaAttribution } from "./index";

/**
 * Regression guard for the billing seam's `grida` provider-options key.
 *
 * The bug: `prepareCall` hand-wrote `grida: { organization_id }` (snake_case),
 * but the seam middleware reads `organizationId` (camelCase), so EVERY hosted
 * design-agent call threw `MissingOrgIdError` before the credit check —
 * tier-independent, and unbilled (the throw precedes the gate). The compile-time
 * guard is the shared typed builder; this pins the runtime key mapping so a
 * future refactor that drops the builder can't silently regress it.
 */
describe("gridaAttribution", () => {
  it("emits the camelCase `organizationId` key the billing seam reads", () => {
    const out = gridaAttribution({ organization_id: 42, feature: "svg/agent" });
    expect(out).toEqual({
      grida: { organizationId: 42, feature: "svg/agent" },
    });
    // The exact defect: never the snake_cased key the middleware ignores.
    expect(out.grida).not.toHaveProperty("organization_id");
  });

  it("defaults the feature tag when the caller omits it", () => {
    const out = gridaAttribution({ organization_id: 7 });
    expect(out).toEqual({
      grida: { organizationId: 7, feature: "agent/chat" },
    });
  });

  it("threads transaction_id → transactionId only when present", () => {
    expect(
      gridaAttribution({ organization_id: 7, transaction_id: "tx_1" })
    ).toEqual({
      grida: {
        organizationId: 7,
        feature: "agent/chat",
        transactionId: "tx_1",
      },
    });
    // Absent → no stray `transactionId: undefined` on the wire.
    expect(gridaAttribution({ organization_id: 7 }).grida).not.toHaveProperty(
      "transactionId"
    );
  });

  it("omits the `grida` key entirely on the BYOK path (no org id)", () => {
    // Desktop/BYOK runs a bare provider with no billing middleware — there is
    // nothing to attribute, and emitting `grida: { organizationId: undefined }`
    // would trip the seam's runtime gate on the hosted path.
    const out = gridaAttribution({ feature: "byok/local" });
    expect(out).toEqual({});
    expect(out).not.toHaveProperty("grida");
  });
});
