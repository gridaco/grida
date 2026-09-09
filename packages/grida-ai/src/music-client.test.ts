import { CatalogFixture } from "./catalog-fixture";
// GRIDA-SEC-004 / GRIDA-SEC-006 — GG music public input, safe bytes, and bounded authority.
// GRIDA-GG: token — synthetic scoped credentials only; no services or paid generation.
import { afterEach, describe, expect, it, vi } from "vitest";
import { MusicClient, ProviderHttp, GridaGatewaySessionStore } from "./index";

const ID = "google/lyria-3";
const PRO = "google/lyria-3-pro";
const TOKEN = "synthetic-private-scoped-token";
const PROMPT = "synthetic-private-music-prompt";
const ORIGIN = "https://gg.example";
const DATA = new Uint8Array([0x49, 0x44, 0x33]);
const BASE64 = "SUQz";
function wire(model_id: string = ID) {
  return {
    model_id,
    provider_id: "gg",
    audio: {
      base64: BASE64,
      media_type: "audio/mpeg",
      file_name: `${model_id.split("/").at(-1)}.mp3`,
    },
  };
}
function setup(overrides: Partial<MusicClient.Options> = {}) {
  const request = vi.fn<typeof fetch>(async (_url, init) =>
    Response.json(wire(JSON.parse(String(init?.body)).model_id))
  );
  const download = vi.fn<typeof fetch>(async () => {
    throw new Error(TOKEN);
  });
  const read = vi.fn<() => string | null>(() => TOKEN);
  const client = new MusicClient({
    catalog: CatalogFixture.store(),
    http: new ProviderHttp({ request, download }),
    gg: { getAccessToken: read },
    gg_base_url: ORIGIN,
    ...overrides,
  });
  return { client, request, download, read };
}
async function failure(
  promise: Promise<unknown>,
  code: MusicClient.FailureCode
) {
  const error: unknown = await promise.catch((value: unknown) => value);
  expect(error).toBeInstanceOf(MusicClient.Failure);
  expect(error).toMatchObject({ code, message: code });
  expect(JSON.parse(JSON.stringify(error))).toEqual({ code, message: code });
  expect(String(error)).not.toMatch(/synthetic-|upstream|secret/);
  expect(error).not.toHaveProperty("cause");
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("MusicClient public operation", () => {
  it.each([ID, PRO])(
    "serves %s through one fixed GG request with only bytes returned",
    async (model_id) => {
      const { client, request, download, read } = setup();
      const operation = await client.resolve({ model_id, provider: "gg" });
      expect(operation).toMatchObject({
        model_id,
        provider_id: "gg",
        binding_id: model_id,
      });
      expect(Object.isFrozen(operation)).toBe(true);
      expect(Object.keys(client)).toEqual([]);
      expect(Object.getOwnPropertyNames(Object.getPrototypeOf(client))).toEqual(
        ["constructor", "resolve"]
      );
      expect(JSON.stringify(operation)).not.toContain(TOKEN);
      expect(request).not.toHaveBeenCalled();
      expect(
        await operation.generate({ prompt: `  ${PROMPT}  `, seed: 0 })
      ).toEqual({ audio: { data: DATA, media_type: "audio/mpeg" } });
      expect(request).toHaveBeenCalledOnce();
      const [url, init] = request.mock.calls[0];
      expect(url).toBe(`${ORIGIN}/api/v1/ai/music/generations`);
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        `Bearer ${TOKEN}`
      );
      expect(JSON.parse(String(init?.body))).toEqual({
        model_id,
        prompt: PROMPT,
        seed: 0,
      });
      expect(read).toHaveBeenCalledTimes(2);
      expect(download).not.toHaveBeenCalled();
    }
  );

  it("captures the construction-time credential callable once and keeps it bound", async () => {
    let gets = 0;
    const gg = {
      value: TOKEN,
      get getAccessToken() {
        gets++;
        return function (this: { value: string }) {
          return this.value;
        };
      },
    };
    const { client, request } = setup({ gg });
    const operation = await client.resolve({ model_id: ID, provider: "gg" });
    await operation.generate({ prompt: PROMPT });
    expect(gets).toBe(1);
    expect(
      new Headers(request.mock.calls[0][1]?.headers).get("authorization")
    ).toBe(`Bearer ${TOKEN}`);
  });

  it.each(["auto", "replicate", "fal", "vercel"])(
    "rejects unowned provider %s without token or transport work",
    async (provider) => {
      const { client, request, read } = setup();
      await failure(
        client.resolve({ model_id: ID, provider } as MusicClient.Selection),
        "invalid_input"
      );
      expect(read).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    }
  );

  it.each(["unknown/model", "__proto__", "google/veo-3.1"])(
    "refuses unbound model %s before token lookup",
    async (model_id) => {
      const { client, request, read } = setup();
      await failure(
        client.resolve({ model_id, provider: "gg" }),
        "model_unavailable"
      );
      expect(read).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    }
  );

  it.each([
    { prompt: " " },
    { prompt: "a".repeat(4097) },
    { prompt: "😀".repeat(2049) },
    { prompt: PROMPT, seed: 1.5 },
    { prompt: PROMPT, seed: Infinity },
    { prompt: PROMPT, seed: null },
    { prompt: PROMPT, images: [] },
    { prompt: PROMPT, lyrics: "not a GG field" },
    { prompt: PROMPT, n: 2 },
    { prompt: PROMPT, duration: 30 },
    { prompt: PROMPT, output_format: "wav" },
  ])("rejects invalid or unrequested generation input", async (input) => {
    const { client, read, request } = setup();
    const operation = await client.resolve({ model_id: ID, provider: "gg" });
    await failure(
      operation.generate(input as MusicClient.Input),
      "invalid_input"
    );
    expect(read).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
  });

  it("counts trimmed prompt length in UTF16 units, preserves the safe-integer seed range, and omits an absent seed", async () => {
    const { client, request } = setup();
    const operation = await client.resolve({ model_id: ID, provider: "gg" });
    await operation.generate({
      prompt: ` ${"😀".repeat(2048)} `,
      seed: Number.MIN_SAFE_INTEGER,
    });
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({
      model_id: ID,
      prompt: "😀".repeat(2048),
      seed: Number.MIN_SAFE_INTEGER,
    });
    await operation.generate({ prompt: "short" });
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual({
      model_id: ID,
      prompt: "short",
    });
  });

  it("snapshots input getters once and contains throwing getters", async () => {
    const { client, request } = setup();
    const operation = await client.resolve({ model_id: ID, provider: "gg" });
    let reads = 0;
    await operation.generate({
      get prompt() {
        reads++;
        return PROMPT;
      },
    });
    expect(reads).toBe(1);
    await failure(
      operation.generate({
        get prompt(): string {
          throw new Error(TOKEN);
        },
      }),
      "invalid_input"
    );
    await failure(
      client.resolve({
        get model_id(): string {
          throw new Error(TOKEN);
        },
        provider: "gg",
      }),
      "invalid_input"
    );
    expect(request).toHaveBeenCalledOnce();
  });

  it("rechecks live scoped custody per submission and does not recall accepted output after clear", async () => {
    const gg = new GridaGatewaySessionStore();
    gg.set({ access_token: TOKEN, expires_at: Date.now() + 600_000 });
    const { client, request } = setup({ gg });
    const operation = await client.resolve({ model_id: ID, provider: "gg" });
    gg.set({
      access_token: "rotated-scoped",
      expires_at: Date.now() + 600_000,
    });
    request.mockImplementation(async () => {
      gg.clear();
      return Response.json(wire());
    });
    expect(await operation.generate({ prompt: PROMPT })).toEqual({
      audio: { data: DATA, media_type: "audio/mpeg" },
    });
    expect(
      new Headers(request.mock.calls[0][1]?.headers).get("authorization")
    ).toBe("Bearer rotated-scoped");
    await failure(operation.generate({ prompt: PROMPT }), "gg_token_expired");
    expect(request).toHaveBeenCalledOnce();
  });

  it("refuses absent and near-expiry scoped tokens", async () => {
    const gg = new GridaGatewaySessionStore();
    const { client, request } = setup({ gg });
    await failure(
      client.resolve({ model_id: ID, provider: "gg" }),
      "gg_token_expired"
    );
    gg.set({ access_token: TOKEN, expires_at: Date.now() + 10_000 });
    await failure(
      client.resolve({ model_id: ID, provider: "gg" }),
      "gg_token_expired"
    );
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    [401, "gg_token_expired"],
    [402, "insufficient_credits"],
    [429, "generation_failed"],
    [503, "generation_failed"],
  ] as const)(
    "does not retry or expose an HTTP%i response body",
    async (status, code) => {
      const { client, request } = setup();
      request.mockImplementation(async () => new Response(TOKEN, { status }));
      const operation = await client.resolve({ model_id: ID, provider: "gg" });
      await failure(operation.generate({ prompt: PROMPT }), code);
      expect(request).toHaveBeenCalledOnce();
    }
  );

  it("contains transport/parser/credential exceptions and logs no upstream detail", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, request, read } = setup();
    const operation = await client.resolve({ model_id: ID, provider: "gg" });
    request.mockRejectedValueOnce(
      new Proxy(
        {},
        {
          getPrototypeOf() {
            throw new Error(TOKEN);
          },
        }
      )
    );
    await failure(operation.generate({ prompt: PROMPT }), "generation_failed");
    request.mockResolvedValueOnce(new Response(`{ secret ${TOKEN}`));
    await failure(operation.generate({ prompt: PROMPT }), "generation_failed");
    read.mockImplementation(() => {
      throw new Error(TOKEN);
    });
    await failure(operation.generate({ prompt: PROMPT }), "generation_failed");
    expect(request).toHaveBeenCalledTimes(2);
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("discards filename, URLs, warnings, receipts, and extra provider metadata", async () => {
    const { client, request, download } = setup();
    request.mockResolvedValue(
      Response.json({
        ...wire(),
        secret: TOKEN,
        stored_media: [TOKEN],
        warnings: [PROMPT],
        audio: {
          ...wire().audio,
          file_name: "alternate-safe-name.mp3",
          url: "https://untrusted.example/audio",
          secret: TOKEN,
        },
      })
    );
    const operation = await client.resolve({ model_id: ID, provider: "gg" });
    const result = await operation.generate({ prompt: PROMPT });
    expect(result).toEqual({ audio: { data: DATA, media_type: "audio/mpeg" } });
    expect(result.audio.data.constructor).toBe(Uint8Array);
    expect(download).not.toHaveBeenCalled();
  });

  it.each(
    [
      null,
      { ...wire(), model_id: PRO },
      { ...wire(), provider_id: "replicate" },
      { ...wire(), audio: null },
      { ...wire(), audio: { ...wire().audio, base64: "" } },
      { ...wire(), audio: { ...wire().audio, base64: "!!!=" } },
      { ...wire(), audio: { ...wire().audio, base64: "SUQ" } },
      { ...wire(), audio: { ...wire().audio, media_type: "audio/wav" } },
      { ...wire(), audio: { ...wire().audio, file_name: "../private.mp3" } },
      { ...wire(), audio: { ...wire().audio, file_name: "private\\file.mp3" } },
      {
        ...wire(),
        audio: {
          url: "https://untrusted.example/audio",
          media_type: "audio/mpeg",
          file_name: "music.mp3",
        },
      },
    ].map((response) => [response])
  )("refuses malformed hosted result bindings and audio", async (response) => {
    const { client, request, download } = setup();
    request.mockResolvedValue(Response.json(response));
    const operation = await client.resolve({ model_id: ID, provider: "gg" });
    await failure(operation.generate({ prompt: PROMPT }), "invalid_response");
    expect(request).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
  });

  it("refuses unused authority/configuration fields at construction", () => {
    const http = new ProviderHttp({
      request: vi.fn<typeof fetch>(),
      download: vi.fn<typeof fetch>(),
    });
    expect(
      () =>
        new MusicClient({
          catalog: CatalogFixture.store(),
          http,
          gg: { getAccessToken: () => TOKEN },
          gg_base_url: ORIGIN,
          keys: {},
        } as MusicClient.Options)
    ).toThrow("invalid_input");
    expect(
      () =>
        new MusicClient({
          catalog: CatalogFixture.store(),
          http,
          gg: { getAccessToken: () => TOKEN },
          gg_base_url: "https://user:secret@gg.example",
        })
    ).toThrow("invalid_input");
  });
});

describe("music invocation bounds", () => {
  it("lets a host cancellation timer run during an always-ready empty response stream", async () => {
    const { client, request } = setup();
    const controller = new AbortController();
    let pulls = 0;
    const cancel = vi.fn<() => void>();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(stream) {
          if (++pulls > 256) {
            stream.error(new Error("fixture exhausted"));
            return;
          }
          stream.enqueue(new Uint8Array());
        },
        cancel,
      })
    );
    request.mockImplementation(async () => {
      setTimeout(() => controller.abort(), 0);
      return response;
    });
    const operation = await client.resolve({ model_id: ID, provider: "gg" });
    await failure(
      operation.generate({ prompt: PROMPT, signal: controller.signal }),
      "aborted"
    );
    expect(pulls).toBeLessThan(130);
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body!.locked).toBe(false);
  });

  it("aborts before token lookup/submission and contains abort-during-token rejected work", async () => {
    const { client, request, read } = setup();
    const operation = await client.resolve({ model_id: ID, provider: "gg" });
    const controller = new AbortController();
    controller.abort();
    await failure(
      operation.generate({ prompt: PROMPT, signal: controller.signal }),
      "aborted"
    );
    expect(read).toHaveBeenCalledOnce();
    const next = new AbortController();
    read.mockImplementation(() => {
      next.abort();
      throw new Error(TOKEN);
    });
    await failure(
      operation.generate({ prompt: PROMPT, signal: next.signal }),
      "aborted"
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("settles an ignored cancellation transport at the whole deadline and cancels late output", async () => {
    vi.useFakeTimers();
    const { client, request } = setup();
    const response = deferred<Response>();
    request.mockReturnValue(response.promise);
    const operation = await client.resolve({ model_id: ID, provider: "gg" });
    const checked = failure(operation.generate({ prompt: PROMPT }), "timeout");
    await vi.advanceTimersByTimeAsync(300_000);
    await checked;
    const cancel = vi.fn<() => void>();
    response.resolve(new Response(new ReadableStream({ cancel })));
    await vi.advanceTimersByTimeAsync(1);
    expect(cancel).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refuses a token reader's late continuation before the deadline timer runs", async () => {
    const { client, request, read } = setup();
    const operation = await client.resolve({ model_id: ID, provider: "gg" });
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    read.mockImplementation(() => {
      now = 300_001;
      return TOKEN;
    });
    await failure(operation.generate({ prompt: PROMPT }), "timeout");
    expect(request).not.toHaveBeenCalled();
  });

  it("aborts and unlocks a stalled body without awaiting uncooperative cancellation", async () => {
    const { client, request } = setup();
    const started = deferred<void>();
    const cancel = vi.fn<() => Promise<void>>(() => new Promise(() => {}));
    const response = new Response(
      new ReadableStream({
        pull() {
          started.resolve();
        },
        cancel,
      })
    );
    request.mockResolvedValue(response);
    const operation = await client.resolve({ model_id: ID, provider: "gg" });
    const controller = new AbortController();
    const checked = failure(
      operation.generate({ prompt: PROMPT, signal: controller.signal }),
      "aborted"
    );
    await started.promise;
    await Promise.resolve();
    controller.abort();
    await checked;
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body!.locked).toBe(false);
  });

  it("rejects an oversized encoded envelope before reading its body", async () => {
    const { client, request } = setup();
    const cancel = vi.fn<() => void>();
    const pull = vi.fn<() => void>();
    request.mockResolvedValue(
      new Response(new ReadableStream({ pull, cancel }), {
        headers: {
          "content-length": String(
            Math.ceil((32 * 1024 * 1024) / 3) * 4 + 4097
          ),
        },
      })
    );
    const operation = await client.resolve({ model_id: ID, provider: "gg" });
    await failure(operation.generate({ prompt: PROMPT }), "invalid_response");
    expect(cancel).toHaveBeenCalledOnce();
    expect(pull.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("bounds chunked envelopes without trusting Content-Length", async () => {
    const { client, request } = setup();
    const cancel = vi.fn<() => void>();
    request.mockResolvedValue(
      new Response(
        new ReadableStream({
          pull(stream) {
            stream.enqueue(new Uint8Array(1024 * 1024));
          },
          cancel,
        })
      )
    );
    const operation = await client.resolve({ model_id: ID, provider: "gg" });
    await failure(operation.generate({ prompt: PROMPT }), "invalid_response");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("checks the decoded32MiB ceiling before base64 allocation", async () => {
    const { client, request } = setup();
    const oversized = "A".repeat(Math.ceil((32 * 1024 * 1024) / 3) * 4);
    request.mockResolvedValue(
      Response.json({
        ...wire(),
        audio: { ...wire().audio, base64: oversized },
      })
    );
    const atobSpy = vi.spyOn(globalThis, "atob");
    const operation = await client.resolve({ model_id: ID, provider: "gg" });
    await failure(operation.generate({ prompt: PROMPT }), "invalid_response");
    expect(atobSpy).not.toHaveBeenCalled();
  });
});
