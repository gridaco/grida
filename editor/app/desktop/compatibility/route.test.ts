import { describe, expect, it } from "vitest";
import { version as desktopVersion } from "../../../../desktop/package.json";
import { GET } from "./route";

describe("GET /desktop/compatibility", () => {
  it("publishes the exact Desktop package version without caching", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ desktopVersion });
  });
});
