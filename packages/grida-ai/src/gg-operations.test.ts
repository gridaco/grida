import { afterEach, describe, expect, it, vi } from "vitest";
import { GGOperationsClient } from "./gg-operations";
import { ProviderHttp } from "./http";
import { fixtureGGDiscovery } from "./testing/gg-discovery";
function setup() {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({
      id: "req_original",
      request_id: "req_original",
      status: "succeeded",
      result_status: "available",
      result: { videos: [] },
    })
  );
  const client = new GGOperationsClient({
    http: new ProviderHttp({
      request: fetcher,
      download: vi.fn<typeof fetch>(),
    }),
    gg: { getAccessToken: () => "scoped-token" },
    gg_base_url: "https://grida.example",
    gg_catalog: fixtureGGDiscovery([
      { id: "fixture/new-video", kind: "video" },
    ]),
  });
  return { client, fetcher };
}
afterEach(() => vi.useRealTimers());
describe("GG original job observation", () => {
  it("honors polling 429 Retry-After without repeating the accepted generation", async () => {
    vi.useFakeTimers();
    const { client, fetcher } = setup();
    fetcher.mockResolvedValueOnce(
      new Response(null, { status: 429, headers: { "retry-after": "12" } })
    );
    const pending = client.wait("req_original");
    await vi.advanceTimersByTimeAsync(11_999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).id).toBe("req_original");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      fetcher.mock.calls.every(
        ([url, init]) =>
          String(url).endsWith("/api/v1/ai/jobs?request_id=req_original") &&
          init?.method === "GET"
      )
    ).toBe(true);
  });
  it("looks up an old accepted job without any catalogue read", async () => {
    const { client, fetcher } = setup();
    const ready = vi.spyOn(client.discovery, "ready");
    await client.job("req_original");
    expect(ready).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("does not retry a rejected new submission", async () => {
    const { client, fetcher } = setup();
    fetcher.mockResolvedValue(new Response(null, { status: 429 }));
    await expect(
      client.submit("video.fixture.new-video.text", { prompt: "A square" })
    ).rejects.toThrow("[grida-operation] hosted request failed (429)");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][1]?.method).toBe("POST");
  });
  it("keeps revoked authentication terminal rather than retrying a job forever", async () => {
    const { client, fetcher } = setup();
    fetcher.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(client.wait("req_original")).rejects.toThrow(
      "gg_token_expired"
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("bounds a large polling delay by the original waiting deadline and releases its timer", async () => {
    vi.useFakeTimers();
    const { client, fetcher } = setup();
    fetcher.mockImplementation(
      async () =>
        new Response(null, {
          status: 429,
          headers: { "retry-after": "999999" },
        })
    );
    const result = client.wait("req_original").catch((error) => error);
    await vi.advanceTimersByTimeAsync(600_001);
    expect(await result).toMatchObject({ code: "timeout" });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
