import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

function policy(minimum?: string, update?: string) {
  vi.stubEnv("GRIDA_DESKTOP_MINIMUM_VERSION", minimum);
  vi.stubEnv("GRIDA_DESKTOP_UPDATE_VERSION", update);
}

afterEach(() => vi.unstubAllEnvs());

describe("GET /desktop/compatibility", () => {
  it("publishes a dormant policy before a release line is activated", async () => {
    policy();
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      minimumSupportedVersion: null,
      updateVersion: null,
    });
  });

  it("publishes the exact configured release values", async () => {
    policy("0.7.0", "0.7.1");
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      minimumSupportedVersion: "0.7.0",
      updateVersion: "0.7.1",
    });
  });

  it("returns an unavailable response for an invalid configuration", async () => {
    policy("0.7.0", "0.6.9");
    const response = GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "desktop_compatibility_unavailable",
    });
  });
});
