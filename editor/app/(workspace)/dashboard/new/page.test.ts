import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() =>
  vi.fn<(destination: string) => never>((destination) => {
    throw new Error(`REDIRECT:${destination}`);
  })
);

vi.mock("next/navigation", () => ({ redirect }));

import LegacyPricingIntentPage from "./page";

beforeEach(() => {
  redirect.mockClear();
});

async function expectRedirect(
  searchParams: { plan?: string; period?: string },
  destination: string
) {
  await expect(
    LegacyPricingIntentPage({ searchParams: Promise.resolve(searchParams) })
  ).rejects.toThrow(`REDIRECT:${destination}`);
  expect(redirect).toHaveBeenCalledOnce();
  expect(redirect).toHaveBeenCalledWith(destination);
}

describe("legacy pricing intent route", () => {
  it("sends the default and Free intents to the dashboard", async () => {
    await expectRedirect({}, "/dashboard");
    redirect.mockClear();
    await expectRedirect({ plan: "free" }, "/dashboard");
  });

  it("sends the old monthly Pro intent to the universal upgrade route", async () => {
    await expectRedirect({ plan: "pro" }, "/_/settings/billing/upgrade");
    redirect.mockClear();
    await expectRedirect(
      { plan: "pro", period: "monthly" },
      "/_/settings/billing/upgrade"
    );
  });

  it.each([
    { plan: "team" },
    { plan: "team", period: "monthly" },
    { plan: "pro", period: "yearly" },
    { plan: "unknown" },
  ])("retires unsupported intent $plan/$period", async (searchParams) => {
    await expectRedirect(searchParams, "/pricing");
  });
});
