import { describe, expect, expectTypeOf, it } from "vitest";
import { BillingOffers } from "./offers";
import { price_catalogue_id } from "./plans";

describe("BillingOffers", () => {
  it("sells exactly Pro monthly", () => {
    expect(BillingOffers.saleable).toEqual([
      {
        id: "pro-monthly",
        plan: "pro",
        interval: "month",
        catalogue_id: "plan.pro",
      },
    ]);
    expectTypeOf<BillingOffers.Id>().toEqualTypeOf<"pro-monthly">();
  });

  it("resolves the public offer id", () => {
    expect(BillingOffers.resolve("pro-monthly")).toBe(
      BillingOffers.saleable[0]
    );
  });

  it.each([
    "pro-annual",
    "team-monthly",
    "team-annual",
    "free",
    "custom",
    "",
    null,
    undefined,
  ])("does not resolve retired or unknown offer id %j", (id) => {
    expect(BillingOffers.resolve(id)).toBeNull();
  });

  it("finds only the saleable plan and interval pair", () => {
    expect(BillingOffers.find("pro", "month")).toBe(BillingOffers.saleable[0]);

    expect(BillingOffers.find("pro", "year")).toBeNull();
    expect(BillingOffers.find("team", "month")).toBeNull();
    expect(BillingOffers.find("team", "year")).toBeNull();
    expect(BillingOffers.find("free", "month")).toBeNull();
    expect(BillingOffers.find("custom", "month")).toBeNull();
  });

  it("keeps the historical catalogue addressable for reads", () => {
    expect(price_catalogue_id("pro", "month")).toBe("plan.pro");
    expect(price_catalogue_id("pro", "year")).toBe("plan.pro.annual");
    expect(price_catalogue_id("team", "month")).toBe("plan.team");
    expect(price_catalogue_id("team", "year")).toBe("plan.team.annual");
  });
});
