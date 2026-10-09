import assert from "node:assert/strict";
// GRIDA-EE: billing — native response parity and current-member boundaries.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { nativeCredits } from "./native-credits";
import type { oauthServer } from "../auth/oauth-server";
const authorization = "Bearer native.access.token";
const config = {
  dataOrigin: "https://source.example.test",
  publishableKey: "public-test-key",
} as oauthServer.Config;
const organization = { id: 7, name: "acme", display_name: "" };
const projection = {
  organization_id: "7",
  account_present: true,
  state: "cached",
  source: "cache",
  currency: "USD",
  balance_cents: 0,
  cache_updated_at: "2026-10-06T00:00:00Z",
  billing_gate: { allowed: false, reason: "below_floor" },
};
const rows = (values: unknown[]) =>
  Response.json(values, {
    headers: {
      "content-range": values.length
        ? `0-${values.length - 1}/${values.length}`
        : "*/0",
    },
  });
beforeEach(() => {
  vi.stubEnv("GRIDA_BILLING_OWNER", "infra");
  vi.stubEnv("GRIDA_PLATFORM_BILLING_ORIGIN", "https://platform.example.test");
  vi.stubEnv("GRIDA_PLATFORM_SSR_KEY_ID", "source-ssr");
  vi.stubEnv("GRIDA_PLATFORM_SSR_TOKEN", "w".repeat(43));
});
afterEach(() => vi.unstubAllEnvs());
it("combines same-bearer canonical identity with exact passive platform projection", async () => {
  const transport = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input)),
      headers = new Headers(init?.headers);
    if (url.origin === config.dataOrigin) {
      assert.equal(url.pathname, "/rest/v1/organization");
      assert.equal(url.searchParams.get("id"), "eq.7");
      assert.equal(url.searchParams.get("select"), "id,name,display_name");
      assert.equal(headers.get("authorization"), authorization);
      assert.equal(headers.get("apikey"), config.publishableKey);
      return rows([organization]);
    }
    expect(url.origin).toBe("https://platform.example.test");
    expect(headers.get("x-grida-native-token")).toBe("native.access.token");
    expect(headers.has("x-grida-account-token")).toBe(false);
    expect(headers.has("apikey")).toBe(false);
    expect(headers.has("cookie")).toBe(false);
    return Response.json(projection);
  });
  expect(await nativeCredits(authorization, config, 7, transport)).toEqual({
    organization,
    account_present: true,
    state: "cached",
    source: "cache",
    currency: "USD",
    balance_cents: 0,
    cache_updated_at: projection.cache_updated_at,
    billing_gate: projection.billing_gate,
  });
  expect(transport).toHaveBeenCalledTimes(2);
});
it("denies unknown/invisible org before any financial read", async () => {
  const transport = vi.fn<typeof fetch>(async () => rows([]));
  await expect(
    nativeCredits(authorization, config, 7, transport)
  ).rejects.toMatchObject({ code: "forbidden" });
  expect(transport).toHaveBeenCalledTimes(1);
});
it("membership revoked between identity and billing stays forbidden", async () => {
  const transport = vi.fn<typeof fetch>(async (url) =>
    String(url).startsWith(config.dataOrigin)
      ? rows([organization])
      : new Response("private diagnostics", { status: 403 })
  );
  await expect(
    nativeCredits(authorization, config, 7, transport)
  ).rejects.toMatchObject({ code: "forbidden" });
  expect(transport).toHaveBeenCalledTimes(2);
});
it("platform outage or foreign org cannot fall back to frozen source credits", async () => {
  for (const response of [
    new Response("unavailable", { status: 503 }),
    Response.json({ ...projection, organization_id: "8" }),
  ]) {
    const transport = vi.fn<typeof fetch>(async (url) =>
      String(url).startsWith(config.dataOrigin)
        ? rows([organization])
        : response
    );
    await expect(
      nativeCredits(authorization, config, 7, transport)
    ).rejects.toMatchObject({ code: "auth_unavailable" });
    expect(transport).toHaveBeenCalledTimes(2);
  }
});
it("preserves unavailable balance without fabricating zero", async () => {
  const transport = vi.fn<typeof fetch>(async (url) =>
    String(url).startsWith(config.dataOrigin)
      ? rows([organization])
      : Response.json({
          ...projection,
          state: "uncached",
          balance_cents: null,
          cache_updated_at: null,
        })
  );
  expect(
    (await nativeCredits(authorization, config, 7, transport)).balance_cents
  ).toBeNull();
});
