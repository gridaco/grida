// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: token — synthetic-only signing and quota configuration.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ggConfig } from "./config";

beforeEach(() => {
  for (const key of [
    "GG_TOKEN_SECRET",
    "GG_TOKEN_SECRET_PREVIOUS",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ])
    vi.stubEnv(key, undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("ggConfig", () => {
  it.each([undefined, "", "  ", "a".repeat(31)])(
    "refuses a missing or short signing key",
    (value) => {
      vi.stubEnv("GG_TOKEN_SECRET", value);
      expect(ggConfig.signing().current).toBeNull();
    }
  );
  it("counts UTF-8 bytes and trims the existing configuration format", () => {
    vi.stubEnv("GG_TOKEN_SECRET", ` ${"é".repeat(16)} `);
    expect(ggConfig.signing().current?.byteLength).toBe(32);
  });
  it("reads both rotation keys on each operation without promoting the previous key", () => {
    vi.stubEnv("GG_TOKEN_SECRET_PREVIOUS", "p".repeat(32));
    expect(ggConfig.signing()).toEqual({
      current: null,
      previous: new TextEncoder().encode("p".repeat(32)),
    });
    vi.stubEnv("GG_TOKEN_SECRET", "c".repeat(32));
    expect(ggConfig.signing().current).toEqual(
      new TextEncoder().encode("c".repeat(32))
    );
    vi.stubEnv("GG_TOKEN_SECRET", "n".repeat(32));
    expect(ggConfig.signing().current).toEqual(
      new TextEncoder().encode("n".repeat(32))
    );
  });
  it("requires both limiter values and returns only that fixed configuration", () => {
    expect(ggConfig.limiter()).toBeNull();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://limiter.test");
    expect(ggConfig.limiter()).toBeNull();
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "synthetic-only");
    expect(ggConfig.limiter()).toEqual({
      url: "https://limiter.test",
      token: "synthetic-only",
    });
  });
});
