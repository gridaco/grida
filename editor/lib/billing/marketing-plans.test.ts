import { describe, expect, it } from "vitest";
import { freePlan, plans } from "./marketing-plans";

describe("public pricing plans", () => {
  it("compares exactly Free and Custom", () => {
    expect(plans.map((plan) => plan.name)).toEqual(["Free", "Custom"]);
    expect(plans.map((plan) => plan.id)).toEqual(["tier_free", "tier_custom"]);
  });

  it("presents Free as free rather than as a price", () => {
    expect(freePlan.priceMonthly).toBe("Free");
  });

  it("routes each call to action to its canonical destination", () => {
    expect(plans.map((plan) => [plan.name, plan.href])).toEqual([
      ["Free", "/dashboard"],
      ["Custom", "/contact"],
    ]);
  });

  it("advertises no subscription offer", () => {
    expect(plans.map((plan) => plan.id)).not.toContain("tier_pro");
    expect(plans.map((plan) => plan.id)).not.toContain("tier_team");
    expect(JSON.stringify(plans)).not.toMatch(
      /upgrade|\/month|plan=|period=|yearly|annual/i
    );
  });
});
