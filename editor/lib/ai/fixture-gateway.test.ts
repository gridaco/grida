import { expect, it } from "vitest";
import { fixtureGateway } from "./fixture-gateway";
const valid = {
  GRIDA_PLATFORM_AI_FIXTURE_ORIGIN: "http://127.0.0.1:56746",
  GRIDA_PLATFORM_ALLOW_LOCAL: "1",
  NODE_ENV: "development",
  GG_VERCEL_AI_GATEWAY_API_KEY: "grida-local-ai-fixture",
};
it("absent fixture keeps normal provider configuration", () =>
  expect(fixtureGateway({})).toBeNull());
it("admits only the dedicated loopback fixture with synthetic authority", () =>
  expect(fixtureGateway(valid)).toEqual({
    baseURL: "http://127.0.0.1:56746/v3/ai",
    apiKey: "grida-local-ai-fixture",
  }));
it.each([
  { NODE_ENV: "production" },
  { GRIDA_PLATFORM_ALLOW_LOCAL: "0" },
  { GRIDA_PLATFORM_AI_FIXTURE_ORIGIN: "https://example.test" },
  { GRIDA_PLATFORM_AI_FIXTURE_ORIGIN: "http://127.0.0.1:56746/path" },
  { GG_VERCEL_AI_GATEWAY_API_KEY: "real-key" },
  { BYOK_OPENROUTER_API_KEY: "byok" },
])("refuses unsafe fixture %j", (change) =>
  expect(() => fixtureGateway({ ...valid, ...change })).toThrow(
    "invalid local AI fixture"
  )
);

it("keeps the M4 simulator in its separate explicit local profile", () => {
  expect(
    fixtureGateway({
      ...valid,
      GRIDA_PLATFORM_FIXTURE_PROFILE: "m4",
      GRIDA_PLATFORM_AI_FIXTURE_ORIGIN: "http://127.0.0.1:56846",
    })
  ).toEqual({
    baseURL: "http://127.0.0.1:56846/v3/ai",
    apiKey: "grida-local-ai-fixture",
  });
});
it.each([
  { GRIDA_PLATFORM_FIXTURE_PROFILE: "unknown" },
  { GRIDA_PLATFORM_FIXTURE_PROFILE: "m4" },
  { GRIDA_PLATFORM_AI_FIXTURE_ORIGIN: "http://127.0.0.1:56846" },
  {
    GRIDA_PLATFORM_FIXTURE_PROFILE: "m4",
    GRIDA_PLATFORM_AI_FIXTURE_ORIGIN: "http://127.0.0.1:56846",
    NODE_ENV: "production",
  },
])("rejects crossed or unsafe fixture profiles %j", (change) =>
  expect(() => fixtureGateway({ ...valid, ...change })).toThrow(
    "invalid local AI fixture"
  )
);
