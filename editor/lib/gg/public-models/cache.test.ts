import { describe, expect, it, vi } from "vitest";
import { createCatalogueReader, MAX_RESPONSE_BYTES } from "./cache";
import { catalogueFixture } from "./fixtures";

const base = Date.parse("2030-01-01T00:00:00Z");
const response = (
  body: unknown = catalogueFixture(),
  time = base,
  headers: HeadersInit = {}
) =>
  new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
      date: new Date(time).toUTCString(),
      ...headers,
    },
  });

describe("bounded public catalogue cache", () => {
  it("deduplicates reads, omits all credentials and never keys by query or user", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response());
    const read = createCatalogueReader({
      origin: "https://gateway.example",
      fetcher,
      now: () => base,
    });
    const results = await Promise.all(Array.from({ length: 50 }, () => read()));
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.href).toBe("https://gateway.example/v1/models");
    expect(options).toMatchObject({
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    expect(results.every((result) => result.state === "fresh")).toBe(true);
    expect(results.every((result) => result.served_at === base)).toBe(true);
  });
  it("keeps last-good data for at most five minutes with failure backoff, then becomes unavailable", async () => {
    let time = base;
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValueOnce(response());
    fetcher.mockRejectedValue(new Error("offline"));
    const read = createCatalogueReader({
      origin: "https://gateway.example",
      fetcher,
      now: () => time,
    });
    expect((await read()).state).toBe("fresh");
    time += 60000;
    expect((await read()).state).toBe("stale");
    await Promise.all(Array.from({ length: 50 }, () => read()));
    expect(fetcher).toHaveBeenCalledTimes(2);
    time = base + 300000;
    expect(await read()).toMatchObject({
      state: "unavailable",
      catalogue: null,
    });
  });
  it("cannot extend upstream Age/Date or cross a scheduled operation retirement", async () => {
    let time = base;
    const fixture = catalogueFixture();
    fixture.next_change_at = new Date(base + 120000).toISOString();
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValueOnce(
      response(fixture, base - 120000, { Age: "120" })
    );
    fetcher.mockRejectedValue(new Error("offline"));
    const read = createCatalogueReader({
      origin: "https://gateway.example",
      fetcher,
      now: () => time,
    });
    expect(await read()).toMatchObject({
      state: "stale",
      served_at: base,
      validated_at: base - 120000,
      expires_at: base + 120000,
    });
    time = base + 120000;
    expect((await read()).state).toBe("unavailable");
  });
  it("rejects expired snapshots, invalid schema/UTF-8, oversized decoded bodies and bad cache headers", async () => {
    const expired = catalogueFixture();
    expired.next_change_at = new Date(base).toISOString();
    const cases = [
      response(expired),
      response({ data: [] }),
      new Response(new Uint8Array([0xff]), {
        headers: { "content-type": "application/json" },
      }),
      new Response("x".repeat(MAX_RESPONSE_BYTES + 1), {
        headers: {
          "content-type": "application/json",
          "content-length": "1",
          "content-encoding": "gzip",
        },
      }),
      response(catalogueFixture(), base, { Age: "-1" }),
      response(catalogueFixture(), base, { Date: "invalid" }),
    ];
    for (const result of cases) {
      const read = createCatalogueReader({
        origin: "https://gateway.example",
        fetcher: vi.fn<typeof fetch>(async () => result),
        now: () => base,
      });
      expect(await read()).toMatchObject({
        state: "unavailable",
        catalogue: null,
      });
    }
  });
  it("rejects insecure or user-selected destinations, with explicit development loopback as the only HTTP exception", async () => {
    for (const origin of [
      "http://gateway.example",
      "http://localhost:8080",
      "https://u:p@gateway.example",
      "https://gateway.example/x",
      "https://gateway.example?x=1",
    ])
      expect(() => createCatalogueReader({ origin })).toThrow(
        "Invalid public Gateway origin"
      );
    expect(() =>
      createCatalogueReader({
        origin: "http://127.0.0.1:8080",
        allowInsecureLoopback: true,
      })
    ).not.toThrow("Invalid public Gateway origin");
    expect(() =>
      createCatalogueReader({
        origin: "http://elsewhere.example",
        allowInsecureLoopback: true,
      })
    ).toThrow("Invalid public Gateway origin");
    const fetcher = vi.fn<typeof fetch>(
      async (_url: URL | RequestInfo, options?: RequestInit) => {
        expect(options?.redirect).toBe("error");
        throw new TypeError("redirect refused");
      }
    );
    expect(
      (
        await createCatalogueReader({
          origin: "https://gateway.example",
          fetcher,
          now: () => base,
        })()
      ).state
    ).toBe("unavailable");
  });
});
