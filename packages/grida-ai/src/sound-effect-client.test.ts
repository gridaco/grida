import { CatalogFixture } from "./catalog-fixture";
// GRIDA-SEC-004 — public SFX provider authority, live keys, bounded audio, safe failures.
import { afterEach, describe, expect, it, vi } from "vitest";
import { SoundEffectClient, ProviderHttp } from "./index";

const ID = "eleven_text_to_sound_v2";
const KEY = "synthetic-private-elevenlabs-key";
const PROMPT = "synthetic-private-sound-prompt";
const ENDPOINT =
  "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128";
const DATA = new Uint8Array([0x49, 0x44, 0x33]);
function setup(overrides: Partial<SoundEffectClient.Options> = {}) {
  const request = vi.fn<typeof fetch>(
    async () =>
      new Response(DATA, { headers: { "content-type": "audio/mpeg" } })
  );
  const download = vi.fn<typeof fetch>(async () => {
    throw new Error(KEY);
  });
  const get = vi.fn<SoundEffectClient.Keys["get"]>(() => KEY);
  const client = new SoundEffectClient({
    catalog: CatalogFixture.store(),
    keys: { get },
    http: new ProviderHttp({ request, download }),
    ...overrides,
  });
  return { client, request, download, get };
}
async function failure(
  promise: Promise<unknown>,
  code: SoundEffectClient.FailureCode
) {
  const error: unknown = await promise.catch((value: unknown) => value);
  expect(error).toBeInstanceOf(SoundEffectClient.Failure);
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

describe("SoundEffectClient public contract", () => {
  it("admits the existing staged model, freezes selection, and exposes no credentials or SDK model", async () => {
    const { client, request, download } = setup();
    expect(CatalogFixture.view().lifecycle.sound_effects[ID].status).toBe(
      "staged"
    );
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
    });
    expect(operation).toMatchObject({
      model_id: ID,
      provider_id: "elevenlabs",
      binding_id: ID,
    });
    expect(Object.isFrozen(operation)).toBe(true);
    expect(Object.keys(client)).toEqual([]);
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(client))).toEqual([
      "constructor",
      "resolve",
    ]);
    expect(JSON.stringify(operation)).not.toContain(KEY);
    expect(request).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("posts the exact fixed wire once with false/zero preserved and returns bytes only", async () => {
    const { client, request, download, get } = setup();
    request.mockImplementation(
      async () =>
        new Response(DATA, {
          headers: {
            "content-type": "Audio/MPEG; charset=binary",
            "x-provider-metadata": KEY,
            "content-disposition": `attachment; filename="${KEY}"`,
          },
        })
    );
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
    });
    const result = await operation.generate({
      prompt: ` ${PROMPT} `,
      duration_seconds: 0.5,
      loop: false,
      prompt_influence: 0,
    });
    expect(result).toEqual({ audio: { data: DATA, media_type: "audio/mpeg" } });
    expect(result.audio.data.constructor).toBe(Uint8Array);
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init?.method).toBe("POST");
    expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
      "xi-api-key": KEY,
      "content-type": "application/json",
      accept: "audio/mpeg",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model_id: ID,
      text: PROMPT,
      duration_seconds: 0.5,
      loop: false,
      prompt_influence: 0,
    });
    expect(get.mock.calls).toEqual([["elevenlabs"], ["elevenlabs"]]);
    expect(download).not.toHaveBeenCalled();
  });

  it("preserves omitted options and their provider defaults", async () => {
    const { client, request } = setup();
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
    });
    await operation.generate({ prompt: PROMPT });
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({
      model_id: ID,
      text: PROMPT,
    });
    await operation.generate({
      prompt: PROMPT,
      duration_seconds: 30,
      loop: true,
      prompt_influence: 1,
    });
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual({
      model_id: ID,
      text: PROMPT,
      duration_seconds: 30,
      loop: true,
      prompt_influence: 1,
    });
  });

  it("captures a bound key callable once and reads the current key at submission", async () => {
    let accesses = 0;
    const keys = {
      value: KEY,
      get get() {
        accesses++;
        return function (this: { value: string }) {
          return this.value;
        };
      },
    };
    const { client, request } = setup({ keys });
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
    });
    keys.value = "  replacement-key  ";
    await operation.generate({ prompt: PROMPT });
    expect(accesses).toBe(1);
    expect(
      new Headers(request.mock.calls[0][1]?.headers).get("xi-api-key")
    ).toBe("replacement-key");
  });

  it.each([null, "", "   "])(
    "fails closed for an absent/blank key at resolution and after selection",
    async (value) => {
      const { client, request, get } = setup();
      get.mockReturnValue(value);
      await failure(
        client.resolve({ model_id: ID, provider: "elevenlabs" }),
        "provider_key_required"
      );
      get.mockReturnValue(KEY);
      const operation = await client.resolve({
        model_id: ID,
        provider: "elevenlabs",
      });
      get.mockReturnValue(value);
      await failure(
        operation.generate({ prompt: PROMPT }),
        "provider_key_required"
      );
      expect(request).not.toHaveBeenCalled();
    }
  );

  it("does not switch credentials or resubmit an accepted job after key removal", async () => {
    const { client, request, get } = setup();
    request.mockImplementation(async () => {
      get.mockReturnValue(null);
      return new Response(DATA, { headers: { "content-type": "audio/mpeg" } });
    });
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
    });
    expect(await operation.generate({ prompt: PROMPT })).toEqual({
      audio: { data: DATA, media_type: "audio/mpeg" },
    });
    await failure(
      operation.generate({ prompt: PROMPT }),
      "provider_key_required"
    );
    expect(request).toHaveBeenCalledOnce();
  });

  it.each(["auto", "gg", "replicate", "fal"])(
    "rejects unsupported provider %s before key access",
    async (provider) => {
      const { client, request, get } = setup();
      await failure(
        client.resolve({
          model_id: ID,
          provider,
        } as SoundEffectClient.Selection),
        "invalid_input"
      );
      expect(get).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    }
  );

  it.each([
    "eleven_v3",
    "eleven_text_to_sound_v1",
    "__proto__",
    "custom/sound",
  ])("rejects unbound model %s before key access", async (model_id) => {
    const { client, request, get } = setup();
    await failure(
      client.resolve({ model_id, provider: "elevenlabs" }),
      "model_unavailable"
    );
    expect(get).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    { prompt: " " },
    { prompt: "a".repeat(451) },
    { prompt: "😀".repeat(451) },
    { prompt: PROMPT, duration_seconds: 0.49 },
    { prompt: PROMPT, duration_seconds: 30.1 },
    { prompt: PROMPT, duration_seconds: NaN },
    { prompt: PROMPT, duration_seconds: null },
    { prompt: PROMPT, loop: 0 },
    { prompt: PROMPT, loop: null },
    { prompt: PROMPT, prompt_influence: -0.1 },
    { prompt: PROMPT, prompt_influence: 1.1 },
    { prompt: PROMPT, prompt_influence: Infinity },
    { prompt: PROMPT, prompt_influence: null },
    { prompt: PROMPT, seed: 0 },
    { prompt: PROMPT, n: 2 },
    { prompt: PROMPT, voice_id: "voice" },
    { prompt: PROMPT, output_format: "wav" },
  ])(
    "rejects invalid or unrequested generation options before key lookup",
    async (input) => {
      const { client, request, get } = setup();
      const operation = await client.resolve({
        model_id: ID,
        provider: "elevenlabs",
      });
      await failure(
        operation.generate(input as SoundEffectClient.Input),
        "invalid_input"
      );
      expect(get).toHaveBeenCalledOnce();
      expect(request).not.toHaveBeenCalled();
    }
  );

  it("limits a trimmed prompt to 450 Unicode code points", async () => {
    const { client, request } = setup();
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
    });
    await operation.generate({ prompt: ` ${"😀".repeat(450)} ` });
    expect(JSON.parse(String(request.mock.calls[0][1]?.body)).text).toBe(
      "😀".repeat(450)
    );
    expect(request).toHaveBeenCalledOnce();
  });

  it("snapshots allowed getters once and contains a thrown input accessor", async () => {
    const { client, request } = setup();
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
    });
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
          throw new Error(KEY);
        },
      }),
      "invalid_input"
    );
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([401, 403, 429, 500, 503])(
    "contains HTTP %i errors without GG remapping, logging, or retry",
    async (status) => {
      const { client, request } = setup();
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnLog = vi.spyOn(console, "warn").mockImplementation(() => {});
      request.mockImplementation(
        async () => new Response(`upstream ${KEY} ${PROMPT}`, { status })
      );
      const operation = await client.resolve({
        model_id: ID,
        provider: "elevenlabs",
      });
      await failure(
        operation.generate({ prompt: PROMPT }),
        "generation_failed"
      );
      expect(request).toHaveBeenCalledOnce();
      expect(errorLog).not.toHaveBeenCalled();
      expect(warnLog).not.toHaveBeenCalled();
    }
  );

  it("contains key/transport failures, including hostile error accessors", async () => {
    const { client, request, get } = setup();
    const thrown = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error(KEY);
        },
      }
    );
    get.mockImplementationOnce(() => {
      throw thrown;
    });
    await failure(
      client.resolve({ model_id: ID, provider: "elevenlabs" }),
      "generation_failed"
    );
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
    });
    get.mockRejectedValueOnce(new Error(KEY));
    await failure(operation.generate({ prompt: PROMPT }), "generation_failed");
    request.mockRejectedValue(thrown);
    await failure(operation.generate({ prompt: PROMPT }), "generation_failed");
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([undefined, "audio/wav", "application/json"])(
    "refuses an unexpected media type before materializing audio",
    async (mediaType) => {
      const { client, request } = setup();
      const cancel = vi.fn<() => void>();
      request.mockImplementation(
        async () =>
          new Response(new ReadableStream({ cancel }), {
            headers: mediaType ? { "content-type": mediaType } : {},
          })
      );
      const operation = await client.resolve({
        model_id: ID,
        provider: "elevenlabs",
      });
      await failure(operation.generate({ prompt: PROMPT }), "invalid_response");
      expect(cancel).toHaveBeenCalledOnce();
    }
  );

  it.each([null, new Uint8Array()])("rejects empty audio", async (body) => {
    const { client, request } = setup();
    request.mockResolvedValue(
      new Response(body, { headers: { "content-type": "audio/mpeg" } })
    );
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
    });
    await failure(operation.generate({ prompt: PROMPT }), "invalid_response");
    expect(request).toHaveBeenCalledOnce();
  });

  it("refuses unrequested GG/custom-origin authority at construction", () => {
    const http = new ProviderHttp({
      request: vi.fn<typeof fetch>(),
      download: vi.fn<typeof fetch>(),
    });
    expect(
      () =>
        new SoundEffectClient({
          catalog: CatalogFixture.store(),
          http,
          keys: { get: () => KEY },
          gg: {},
        } as SoundEffectClient.Options)
    ).toThrow("invalid_input");
    expect(
      () =>
        new SoundEffectClient({
          catalog: CatalogFixture.store(),
          http,
          keys: { get: () => KEY },
          base_url: "https://custom.example",
        } as SoundEffectClient.Options)
    ).toThrow("invalid_input");
  });
});

describe("sound-effect invocation bounds", () => {
  it("bounds a stuck resolve key lookup and does not publish a late selection", async () => {
    vi.useFakeTimers();
    const key = deferred<string>();
    const { client, get, request } = setup();
    get.mockReturnValue(key.promise);
    const checked = failure(
      client.resolve({ model_id: ID, provider: "elevenlabs" }),
      "timeout"
    );
    await vi.advanceTimersByTimeAsync(300_000);
    await checked;
    key.resolve(KEY);
    await vi.advanceTimersByTimeAsync(1);
    expect(request).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds a stuck generation key lookup and never submits after its late resolution", async () => {
    vi.useFakeTimers();
    const { client, get, request } = setup();
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
    });
    const key = deferred<string>();
    get.mockReturnValue(key.promise);
    const checked = failure(operation.generate({ prompt: PROMPT }), "timeout");
    await vi.advanceTimersByTimeAsync(300_000);
    await checked;
    key.resolve(KEY);
    await vi.advanceTimersByTimeAsync(1);
    expect(request).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("checks the monotonic deadline after blocking key work before its timer can run", async () => {
    const { client, get, request } = setup();
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
    });
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    get.mockImplementation(() => {
      now = 300_001;
      return KEY;
    });
    await failure(operation.generate({ prompt: PROMPT }), "timeout");
    expect(request).not.toHaveBeenCalled();
  });

  it.each(["key", "request"] as const)(
    "observes rejection when a %s capability aborts synchronously",
    async (stage) => {
      const { client, get, request } = setup();
      const operation = await client.resolve({
        model_id: ID,
        provider: "elevenlabs",
      });
      const controller = new AbortController();
      const reject = () => {
        controller.abort();
        return Promise.reject(new Error(KEY));
      };
      if (stage === "key") get.mockImplementation(reject);
      else request.mockImplementation(reject);
      await failure(
        operation.generate({ prompt: PROMPT, signal: controller.signal }),
        "aborted"
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(request).toHaveBeenCalledTimes(stage === "key" ? 0 : 1);
    }
  );

  it("refuses already-aborted generation before key access", async () => {
    const { client, get, request } = setup();
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
    });
    const controller = new AbortController();
    controller.abort();
    await failure(
      operation.generate({ prompt: PROMPT, signal: controller.signal }),
      "aborted"
    );
    expect(get).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
  });

  it("settles a stalled submission at the whole deadline and cancels late response work", async () => {
    vi.useFakeTimers();
    const { client, request } = setup();
    const response = deferred<Response>();
    request.mockReturnValue(response.promise);
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
    });
    const checked = failure(operation.generate({ prompt: PROMPT }), "timeout");
    await vi.advanceTimersByTimeAsync(300_000);
    await checked;
    const cancel = vi.fn<() => void>();
    response.resolve(new Response(new ReadableStream({ cancel })));
    await vi.advanceTimersByTimeAsync(1);
    expect(cancel).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledOnce();
  });

  it("cancels and unlocks a stalled audio stream even if host cancellation never settles", async () => {
    const { client, request } = setup();
    const started = deferred<void>();
    const cancel = vi.fn<() => Promise<void>>(() => new Promise(() => {}));
    const response = new Response(
      new ReadableStream({
        pull() {
          started.resolve();
        },
        cancel,
      }),
      { headers: { "content-type": "audio/mpeg" } }
    );
    request.mockResolvedValue(response);
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
    });
    const controller = new AbortController();
    const checked = failure(
      operation.generate({ prompt: PROMPT, signal: controller.signal }),
      "aborted"
    );
    await started.promise;
    await vi.waitFor(() => expect(response.body!.locked).toBe(true));
    controller.abort();
    await checked;
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body!.locked).toBe(false);
  });

  it("allows cancellation timers to run during a bounded always-ready empty-stream fixture", async () => {
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
      }),
      { headers: { "content-type": "audio/mpeg" } }
    );
    request.mockImplementation(async () => {
      setTimeout(() => controller.abort(), 0);
      return response;
    });
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
    });
    await failure(
      operation.generate({ prompt: PROMPT, signal: controller.signal }),
      "aborted"
    );
    expect(pulls).toBeLessThan(130);
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body!.locked).toBe(false);
  });

  it("rejects a declared response above 16 MiB and accepts the exact byte boundary", async () => {
    const { client, request } = setup();
    const cancel = vi.fn<() => void>();
    request.mockResolvedValueOnce(
      new Response(new ReadableStream({ cancel }), {
        headers: {
          "content-type": "audio/mpeg",
          "content-length": String(16 * 1024 * 1024 + 1),
        },
      })
    );
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
    });
    await failure(operation.generate({ prompt: PROMPT }), "invalid_response");
    expect(cancel).toHaveBeenCalledOnce();
    request.mockResolvedValueOnce(
      new Response(new Uint8Array(16 * 1024 * 1024), {
        headers: { "content-type": "audio/mpeg" },
      })
    );
    expect(
      (await operation.generate({ prompt: PROMPT })).audio.data.byteLength
    ).toBe(16 * 1024 * 1024);
  });

  it("bounds streamed audio independently of Content-Length", async () => {
    const { client, request } = setup();
    const cancel = vi.fn<() => void>();
    request.mockResolvedValue(
      new Response(
        new ReadableStream({
          pull(stream) {
            stream.enqueue(new Uint8Array(1024 * 1024));
          },
          cancel,
        }),
        { headers: { "content-type": "audio/mpeg" } }
      )
    );
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
    });
    await failure(operation.generate({ prompt: PROMPT }), "invalid_response");
    expect(cancel).toHaveBeenCalledOnce();
  });
});
