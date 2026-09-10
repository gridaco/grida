// GRIDA-SEC-010 — canonical Auth issuer and Data API routing are independent server authority.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { oauthServer } from "../oauth-server";

const issuer = "https://project.example.invalid/auth/v1";
const dataOrigin = "https://project-all.example.invalid";
const clientId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.stubEnv("GRIDA_OAUTH_ISSUER", issuer);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", dataOrigin);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "synthetic-public-key");
  vi.stubEnv("GRIDA_OAUTH_CLIENT_IDS", clientId);
});
afterEach(() => vi.unstubAllEnvs());

describe("oauthServer.config", () => {
  it("keeps the canonical issuer independent of the Data API replica alias", () => {
    expect(oauthServer.config()).toEqual({
      issuer,
      dataOrigin,
      publishableKey: "synthetic-public-key",
      clientIds: [clientId],
    });
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://other-data.example.invalid"
    );
    expect(oauthServer.config()).toMatchObject({
      issuer,
      dataOrigin: "https://other-data.example.invalid",
    });
  });

  it("accepts explicit canonical loopback fixture destinations", () => {
    vi.stubEnv("GRIDA_OAUTH_ISSUER", "http://127.0.0.1:55431/auth/v1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55432");
    expect(oauthServer.config()).toMatchObject({
      issuer: "http://127.0.0.1:55431/auth/v1",
      dataOrigin: "http://127.0.0.1:55432",
    });
  });

  it("does not derive a missing issuer even when the Data API uses the primary host", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.example.invalid");
    vi.stubEnv("GRIDA_OAUTH_ISSUER", undefined);
    expect(() => oauthServer.config()).toThrow(
      expect.objectContaining({ code: "not_configured", status: 503 })
    );
  });

  it.each([
    undefined,
    "",
    "https://project.example.invalid",
    `${issuer}/`,
    `${issuer}?query=invalid`,
    `${issuer}#fragment`,
    "https://user:password@project.example.invalid/auth/v1",
    "https://project.example.invalid/other/auth/v1",
    "https://project.example.invalid/other/../auth/v1",
    "https://project.example.invalid//auth/v1",
    "https://PROJECT.example.invalid/auth/v1",
    "https://project.example.invalid:443/auth/v1",
    "https://project.example.invalid/%61uth/v1",
    "http://project.example.invalid/auth/v1",
    "http://localhost:55431/auth/v1",
    "http://127.1:55431/auth/v1",
    "ftp://project.example.invalid/auth/v1",
    ` ${issuer}`,
    `${issuer}\n`,
  ])(
    "rejects missing or noncanonical issuer %# without a fallback",
    (value) => {
      vi.stubEnv("GRIDA_OAUTH_ISSUER", value);
      expect(() => oauthServer.config()).toThrow(
        expect.objectContaining({
          code: "not_configured",
          status: 503,
          message: "OAuth access is not configured.",
        })
      );
    }
  );

  it.each([
    undefined,
    "",
    "https://data.example.invalid/rest/v1",
    "https://data.example.invalid?query=invalid",
    "https://data.example.invalid#fragment",
    "https://user:password@data.example.invalid",
    "http://data.example.invalid",
  ])("requires a separately valid Data API origin %#", (value) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", value);
    expect(() => oauthServer.config()).toThrow(
      expect.objectContaining({ code: "not_configured", status: 503 })
    );
  });

  it.each([
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ""],
    ["GRIDA_OAUTH_CLIENT_IDS", ""],
    ["GRIDA_OAUTH_CLIENT_IDS", "not-a-registered-client"],
  ])("retains the required %s contract", (name, value) => {
    vi.stubEnv(name, value);
    expect(() => oauthServer.config()).toThrow(
      expect.objectContaining({ code: "not_configured", status: 503 })
    );
  });
});
