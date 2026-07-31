import { describe, expect, it } from "vitest";
import { plans } from "./marketing-plans";

describe("public pricing plans", () => {
  it("publishes exactly Free, Pro, and Custom", () => {
    expect(plans.map((plan) => plan.name)).toEqual(["Free", "Pro", "Custom"]);
    expect(plans.map((plan) => plan.id)).toEqual([
      "tier_free",
      "tier_pro",
      "tier_custom",
    ]);
  });

  it("routes each call to action to its canonical destination", () => {
    expect(plans.map((plan) => [plan.name, plan.href])).toEqual([
      ["Free", "/dashboard"],
      ["Pro", "/_/settings/billing/upgrade"],
      ["Custom", "/contact"],
    ]);
  });

  it("shows the catalogue-backed monthly Pro price without retired offers", () => {
    expect(plans.find((plan) => plan.name === "Pro")?.priceMonthly).toBe("$20");
    expect(plans.map((plan) => plan.id)).not.toContain("tier_team");
    expect(plans.map((plan) => plan.href).join(" ")).not.toMatch(
      /plan=team|period=|yearly|annual/i
    );
  });
});
