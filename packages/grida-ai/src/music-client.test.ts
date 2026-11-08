// GRIDA-SEC-004 / GRIDA-SEC-006 — current music offerings, original jobs and bounded results.
import { afterEach, describe, expect, it, vi } from "vitest";
import { MusicClient, ProviderHttp } from "./index";
import { fixtureGGDiscovery } from "./testing/gg-discovery";
const ID = "fixture/new-music";
const TOKEN = "synthetic-scoped-token";
const DATA = new Uint8Array([0x49, 0x44, 0x33]);
const URL = "https://assets.example/music.mp3";
function job(audio: unknown = { url: URL, media_type: "audio/mpeg" }) {
  return {
    id: "req_music",
    request_id: "req_music",
    status: "succeeded",
    result_status: "available",
    result: { audio },
  };
}
function setup() {
  const request = vi.fn<typeof fetch>(async (url) =>
    Response.json(
      String(url).includes("/jobs?")
        ? job()
        : { id: "req_music", request_id: "req_music", result_status: "pending" }
    )
  );
  const download = vi.fn<typeof fetch>(async () => new Response(DATA));
  const read = vi.fn<() => string | null>(() => TOKEN);
  const client = new MusicClient({
    http: new ProviderHttp({ request, download }),
    gg: { getAccessToken: read },
    gg_base_url: "https://grida.example",
    gg_catalog: fixtureGGDiscovery([{ id: ID, kind: "music" }]),
  });
  return { client, request, download, read };
}
async function failure(
  promise: Promise<unknown>,
  code: MusicClient.FailureCode
) {
  const error = await promise.catch((value) => value);
  expect(error).toBeInstanceOf(MusicClient.Failure);
  expect(error).toMatchObject({ code, message: code });
  expect(JSON.parse(JSON.stringify(error))).toEqual({ code, message: code });
  expect(String(error)).not.toMatch(/synthetic-|upstream|secret/);
  expect(error).not.toHaveProperty("cause");
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("MusicClient current GG operation", () => {
  it("runs a new ID using its discovered endpoint and returns only native MP3 bytes", async () => {
    const { client, request, download } = setup();
    const selected = await client.resolve({ model_id: ID, provider: "gg" });
    expect(Object.isFrozen(selected)).toBe(true);
    expect(Object.keys(client)).toEqual([]);
    expect(
      await selected.generate({ prompt: "  A quiet piano melody  ", seed: 0 })
    ).toEqual({ audio: { data: DATA, media_type: "audio/mpeg" } });
    expect(request.mock.calls.map(([url]) => String(url))).toEqual([
      "https://grida.example/api/v1/ai/operations",
      "https://grida.example/api/v1/ai/jobs?request_id=req_music",
    ]);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({
      operation_id: "music.fixture.new-music.generate",
      input: { prompt: "A quiet piano melody", seed: 0 },
    });
    expect(download).toHaveBeenCalledWith(URL, {
      signal: expect.any(AbortSignal),
    });
    expect(
      new Headers(download.mock.calls[0][1]?.headers).has("authorization")
    ).toBe(false);
  });
  it("does not infer availability from old Lyria IDs or accept another provider", async () => {
    const { client, request, download } = setup();
    await failure(
      client.resolve({ model_id: "google/lyria-3", provider: "gg" }),
      "model_unavailable"
    );
    await failure(
      client.resolve({ model_id: ID, provider: "fal" } as never),
      "invalid_input"
    );
    expect(request).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });
  it("rechecks scoped custody for the submission and every original-job lookup", async () => {
    const { client, request, read } = setup();
    const selected = await client.resolve({ model_id: ID, provider: "gg" });
    read.mockReturnValue("replacement-scoped-token");
    await selected.generate({ prompt: "A piano" });
    for (const [, init] of request.mock.calls)
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer replacement-scoped-token"
      );
    read.mockReturnValue(null);
    await failure(selected.generate({ prompt: "A piano" }), "gg_token_expired");
    expect(request).toHaveBeenCalledTimes(2);
  });
  it.each([
    [401, "gg_token_expired"],
    [402, "insufficient_credits"],
    [429, "generation_failed"],
    [503, "generation_failed"],
  ] as const)(
    "contains HTTP %i without retry or response leakage",
    async (status, code) => {
      const { client, request, download } = setup();
      const selected = await client.resolve({ model_id: ID, provider: "gg" });
      request.mockImplementation(
        async () => new Response("upstream-secret", { status })
      );
      await failure(selected.generate({ prompt: "A piano" }), code);
      expect(request).toHaveBeenCalledOnce();
      expect(download).not.toHaveBeenCalled();
    }
  );
  it.each([
    { prompt: "" },
    { prompt: "a", seed: 1.2 },
    { prompt: "a", extra: "secret" },
    { prompt: "x".repeat(4097) },
  ])("rejects malformed native input before dispatch %j", async (input) => {
    const { client, request } = setup();
    const selected = await client.resolve({ model_id: ID, provider: "gg" });
    await failure(
      selected.generate(input as MusicClient.Input),
      "invalid_input"
    );
    expect(request).not.toHaveBeenCalled();
  });
  it.each([
    { url: "http://private.example/a.mp3", media_type: "audio/mpeg" },
    {
      url: "https://user:secret@assets.example/a.mp3",
      media_type: "audio/mpeg",
    },
    { url: URL, media_type: "audio/wav" },
    { media_type: "audio/mpeg" },
    null,
  ])(
    "rejects unsupported result contracts without downloading %j",
    async (audio) => {
      const { client, request, download } = setup();
      const selected = await client.resolve({ model_id: ID, provider: "gg" });
      request.mockImplementation(async (url) =>
        Response.json(
          String(url).includes("/jobs?")
            ? job(audio)
            : { id: "req_music", request_id: "req_music" }
        )
      );
      await failure(
        selected.generate({ prompt: "A piano" }),
        "invalid_response"
      );
      expect(download).not.toHaveBeenCalled();
    }
  );
  it("does not expose the provider URL, filenames, warnings or secret metadata", async () => {
    const { client, request } = setup();
    const selected = await client.resolve({ model_id: ID, provider: "gg" });
    request.mockImplementation(async (url) =>
      Response.json(
        String(url).includes("/jobs?")
          ? {
              ...job(),
              warning: "secret",
              input: "secret",
              stored_media: "secret",
            }
          : { id: "req_music", request_id: "req_music" }
      )
    );
    expect(await selected.generate({ prompt: "A piano" })).toEqual({
      audio: { data: DATA, media_type: "audio/mpeg" },
    });
  });
  it("refuses private result targets and bounds the downloaded bytes", async () => {
    const { client, request, download } = setup();
    const selected = await client.resolve({ model_id: ID, provider: "gg" });
    request.mockImplementation(async (url) =>
      Response.json(
        String(url).includes("/jobs?")
          ? job({
              url: "https://127.0.0.1/music.mp3",
              media_type: "audio/mpeg",
            })
          : { id: "req_music", request_id: "req_music" }
      )
    );
    await failure(
      selected.generate({ prompt: "A piano" }),
      "generation_failed"
    );
    expect(download).not.toHaveBeenCalled();
    request.mockImplementation(async (url) =>
      Response.json(
        String(url).includes("/jobs?")
          ? job()
          : { id: "req_music", request_id: "req_music" }
      )
    );
    download.mockImplementation(
      async () =>
        new Response(DATA, {
          headers: { "content-length": String(33 * 1024 * 1024) },
        })
    );
    await failure(
      selected.generate({ prompt: "A piano" }),
      "generation_failed"
    );
  });
  it("aborts before submission without acquiring another credential", async () => {
    const { client, request, read } = setup();
    const selected = await client.resolve({ model_id: ID, provider: "gg" });
    const before = read.mock.calls.length;
    await failure(
      selected.generate({ prompt: "A piano", signal: AbortSignal.abort() }),
      "aborted"
    );
    expect(request).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(before);
  });
  it("settles a host transport that ignores cancellation at the whole invocation deadline", async () => {
    vi.useFakeTimers();
    const { client, request } = setup();
    const selected = await client.resolve({ model_id: ID, provider: "gg" });
    request.mockImplementation(async () => new Promise<Response>(() => {}));
    const check = failure(selected.generate({ prompt: "A piano" }), "timeout");
    await vi.advanceTimersByTimeAsync(300_001);
    await check;
    expect(request).toHaveBeenCalledOnce();
  });
});
