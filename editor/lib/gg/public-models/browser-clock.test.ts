import { afterEach, describe, expect, it, vi } from "vitest";
import {
  initialTimeAnchor,
  serverTime,
  type ClockSample,
} from "./browser-clock";
import { createCatalogueReader } from "./cache";
import { catalogueFixture } from "./fixtures";

const SERVER_TIME = 2_000_000;

describe("browser catalogue deadlines", () => {
  afterEach(() => vi.useRealTimers());
  it.each([-600_000, 600_000])(
    "does not extend a deadline for visitor clock offset %i",
    (offset) => {
      const at = { monotonic: 0, wall: SERVER_TIME + offset };
      const anchor = initialTimeAnchor(SERVER_TIME, at);
      const deadline = SERVER_TIME + 300_000;
      expect(
        serverTime(anchor, { monotonic: 299_999, wall: at.wall + 299_999 })
      ).toBeLessThan(deadline);
      expect(
        serverTime(anchor, { monotonic: 300_000, wall: at.wall + 300_000 })
      ).toBe(deadline);
    }
  );
  it("counts HTML transit and feed round-trip time conservatively", () => {
    const anchor = initialTimeAnchor(
      SERVER_TIME,
      { monotonic: 299_000, wall: 100_000 },
      0
    );
    expect(serverTime(anchor, { monotonic: 300_000, wall: 101_000 })).toBe(
      SERVER_TIME + 300_000
    );
    // Feed anchors use the fetch start, so time spent receiving/parsing it counts too.
    expect(
      serverTime(
        { server: SERVER_TIME, monotonic: 1_000, wall: 10_000 },
        { monotonic: 2_100, wall: 11_100 }
      )
    ).toBe(SERVER_TIME + 1_100);
  });
  it("counts sleep even when monotonic time pauses and ignores backwards wall corrections", () => {
    const anchor = initialTimeAnchor(SERVER_TIME, {
      monotonic: 0,
      wall: 10_000,
    });
    expect(serverTime(anchor, { monotonic: 1_000, wall: 310_000 })).toBe(
      SERVER_TIME + 300_000
    );
    expect(serverTime(anchor, { monotonic: 300_000, wall: -600_000 })).toBe(
      SERVER_TIME + 300_000
    );
  });
  it("keeps expiry separate from upstream retry backoff during an outage", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(SERVER_TIME);
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      if (++calls > 1) throw new Error("Offline");
      return new Response(JSON.stringify(catalogueFixture()), {
        headers: { "Content-Type": "application/json" },
      });
    };
    const read = createCatalogueReader({
      origin: "https://gateway.example.com",
      fetcher,
    });
    const fresh = await read();
    const anchor = initialTimeAnchor(fresh.served_at, {
      monotonic: 0,
      wall: Date.now() - 600_000,
    });
    vi.setSystemTime(SERVER_TIME + 299_000);
    const stale = await read();
    expect(stale.state).toBe("stale");
    expect(stale.refresh_at).toBe(SERVER_TIME + 304_000);
    const at: ClockSample = { monotonic: 300_000, wall: Date.now() - 599_000 };
    const browserNow = serverTime(anchor, at);
    expect(browserNow).toBe(stale.expires_at);
    expect(browserNow).toBeLessThan(stale.refresh_at);
    expect(calls).toBe(2);
  });
});
