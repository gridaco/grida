import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Env } from "./env";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_GRIDA_OPEN_API_ORIGIN", undefined);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL_ENV", undefined);
});

afterEach(() => vi.unstubAllEnvs());

describe("Forms API origin", () => {
  it("uses the local API development port when no origin is configured", () => {
    expect(Env.forms.API_ORIGIN).toBe("http://localhost:4000");
  });

  it.each(["production", "preview"])(
    "requires explicit configuration for %s deployments",
    (environment) => {
      vi.stubEnv("VERCEL_ENV", environment);
      expect(() => Env.forms.API_ORIGIN).toThrow("is required");
    }
  );

  it("requires explicit configuration in a production browser bundle", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => Env.forms.API_ORIGIN).toThrow("is required");
  });

  it.each([
    "https://api.example.com",
    "http://127.0.0.1:4321",
    "http://[::1]:4321",
  ])("accepts the configured origin %s", (origin) => {
    vi.stubEnv("NEXT_PUBLIC_GRIDA_OPEN_API_ORIGIN", `${origin}/`);
    expect(Env.forms.API_ORIGIN).toBe(origin);
  });

  it.each([
    "api.example.com",
    "http://api.example.com",
    "ftp://api.example.com",
    "https://api.example.com/v1",
    "https://api.example.com?token=value",
    "https://api.example.com#fragment",
    "https://user:password@api.example.com",
  ])("rejects a value that is not an allowed origin: %s", (origin) => {
    vi.stubEnv("NEXT_PUBLIC_GRIDA_OPEN_API_ORIGIN", origin);
    expect(() => Env.forms.API_ORIGIN).toThrow("must be an");
  });
});
