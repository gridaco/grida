// GRIDA-SEC-004 — public speech authority, safe voice paths/text, bounded audio and failures.
import { afterEach, describe, expect, it, vi } from "vitest";
import { models } from "@grida/ai-models";
import { TextToSpeechClient, ProviderHttp } from "./index";

const ID = "eleven_v3";
const KEY = "synthetic-private-elevenlabs-key";
const TEXT = "  [whispers] Keep this text\n exactly as written.  ";
const DATA = new Uint8Array([0x49, 0x44, 0x33]);
function setup(overrides: Partial<TextToSpeechClient.Options> = {}) {
  const request = vi.fn<typeof fetch>(
    async () =>
      new Response(DATA, { headers: { "content-type": "audio/mpeg" } })
  );
  const download = vi.fn<typeof fetch>(async () => {
    throw new Error(KEY);
  });
  const get = vi.fn<TextToSpeechClient.Keys["get"]>(() => KEY);
  const client = new TextToSpeechClient({
    keys: { get },
    http: new ProviderHttp({ request, download }),
    ...overrides,
  });
  return { client, request, download, get };
}
async function failure(
  promise: Promise<unknown>,
  code: TextToSpeechClient.FailureCode
) {
  const error: unknown = await promise.catch((value: unknown) => value);
  expect(error).toBeInstanceOf(TextToSpeechClient.Failure);
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

describe("TextToSpeechClient speech operation", () => {
  it("admits staged v3, normalizes the explicit voice, and exposes no credential or SDK model", async () => {
    const { client, request, download } = setup();
    expect(models.audio.text_to_speech.models[ID].status).toBe("staged");
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
      voice_id: " voice/id ",
    });
    expect(operation).toMatchObject({
      model_id: ID,
      binding_id: ID,
      provider_id: "elevenlabs",
      voice_id: "voice/id",
    });
    expect(Object.isFrozen(operation)).toBe(true);
    expect(Object.keys(client)).toEqual([]);
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(client))).toEqual([
      "constructor",
      "listVoices",
      "resolve",
    ]);
    expect(JSON.stringify(operation)).not.toContain(KEY);
    expect(request).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("posts one fixed speech wire without voice discovery and preserves original text/tags/whitespace", async () => {
    const { client, request, download, get } = setup();
    request.mockImplementation(
      async () =>
        new Response(DATA, {
          headers: {
            "content-type": "Audio/MPEG; charset=binary",
            "x-provider-metadata": KEY,
          },
        })
    );
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
      voice_id: " voice/id?# ",
    });
    const result = await operation.generate({ text: TEXT });
    expect(result).toEqual({ audio: { data: DATA, media_type: "audio/mpeg" } });
    expect(result.audio.data.constructor).toBe(Uint8Array);
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0];
    expect(url).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/voice%2Fid%3F%23?output_format=mp3_44100_128"
    );
    expect(init?.method).toBe("POST");
    expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
      "xi-api-key": KEY,
      "content-type": "application/json",
      accept: "audio/mpeg",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model_id: ID,
      text: TEXT,
    });
    expect(get.mock.calls).toEqual([["elevenlabs"], ["elevenlabs"]]);
    expect(download).not.toHaveBeenCalled();
  });

  it.each([".", "..", "  ", "x".repeat(257), "\ud800"])(
    "rejects unsafe or unencodable voice selection before key lookup",
    async (voice_id) => {
      const { client, get, request } = setup();
      await failure(
        client.resolve({ model_id: ID, provider: "elevenlabs", voice_id }),
        "invalid_input"
      );
      expect(get).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    }
  );

  it.each([
    "%2e%2e",
    "../voice",
    "https://other.example/voice",
    "😀".repeat(256),
  ])(
    "encodes an opaque voice as one fixed-origin path segment",
    async (voice_id) => {
      const { client, request } = setup();
      const operation = await client.resolve({
        model_id: ID,
        provider: "elevenlabs",
        voice_id,
      });
      await operation.generate({ text: "Hello" });
      const url = new URL(String(request.mock.calls[0][0]));
      expect(url.origin).toBe("https://api.elevenlabs.io");
      expect(url.pathname).toBe(
        `/v1/text-to-speech/${encodeURIComponent(voice_id)}`
      );
      expect(url.search).toBe("?output_format=mp3_44100_128");
    }
  );

  it.each(["auto", "gg", "fal"])(
    "rejects unowned provider %s before key lookup",
    async (provider) => {
      const { client, get, request } = setup();
      await failure(
        client.resolve({
          model_id: ID,
          provider,
          voice_id: "voice",
        } as TextToSpeechClient.Selection),
        "invalid_input"
      );
      expect(get).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    }
  );

  it.each(["eleven_text_to_sound_v2", "eleven_v2", "__proto__"])(
    "refuses unbound model %s before key lookup",
    async (model_id) => {
      const { client, get, request } = setup();
      await failure(
        client.resolve({ model_id, provider: "elevenlabs", voice_id: "voice" }),
        "model_unavailable"
      );
      expect(get).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    }
  );

  it.each([
    { text: " \n " },
    { text: "a".repeat(5001) },
    { text: "😀".repeat(5001) },
    { text: "hello", seed: 0 },
    { text: "hello", voice_settings: {} },
    { text: "hello", output_format: "wav" },
    { text: "hello", language_code: "en" },
  ])(
    "rejects invalid or unrequested generation input before key lookup",
    async (input) => {
      const { client, get, request } = setup();
      const operation = await client.resolve({
        model_id: ID,
        provider: "elevenlabs",
        voice_id: "voice",
      });
      await failure(
        operation.generate(input as TextToSpeechClient.Input),
        "invalid_input"
      );
      expect(get).toHaveBeenCalledOnce();
      expect(request).not.toHaveBeenCalled();
    }
  );

  it("consumes the bundled text limit using Unicode code points and includes whitespace in the count", async () => {
    const { client, request } = setup();
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
      voice_id: "voice",
    });
    const limit = models.audio.text_to_speech.models[ID].input.max_characters;
    const text = "😀".repeat(limit);
    await operation.generate({ text });
    expect(JSON.parse(String(request.mock.calls[0][1]?.body)).text).toBe(text);
    await failure(operation.generate({ text: `${text} ` }), "invalid_input");
    expect(request).toHaveBeenCalledOnce();
  });

  it("captures the bound key getter once and uses the current key on each generation", async () => {
    let reads = 0;
    const keys = {
      value: KEY,
      get get() {
        reads++;
        return function (this: { value: string }) {
          return this.value;
        };
      },
    };
    const { client, request } = setup({ keys });
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
      voice_id: "voice",
    });
    keys.value = " new-key ";
    await operation.generate({ text: TEXT });
    expect(reads).toBe(1);
    expect(
      new Headers(request.mock.calls[0][1]?.headers).get("xi-api-key")
    ).toBe("new-key");
  });

  it.each([null, "", "  "])(
    "refuses missing/blank keys at resolution and after selection",
    async (value) => {
      const { client, get, request } = setup();
      get.mockReturnValue(value);
      await failure(
        client.resolve({
          model_id: ID,
          provider: "elevenlabs",
          voice_id: "voice",
        }),
        "provider_key_required"
      );
      get.mockReturnValue(KEY);
      const operation = await client.resolve({
        model_id: ID,
        provider: "elevenlabs",
        voice_id: "voice",
      });
      get.mockReturnValue(value);
      await failure(
        operation.generate({ text: TEXT }),
        "provider_key_required"
      );
      expect(request).not.toHaveBeenCalled();
    }
  );

  it("snapshots normalized voice and text getters once and contains thrown accessors", async () => {
    const { client, request } = setup();
    let voices = 0;
    let texts = 0;
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
      get voice_id() {
        voices++;
        return " voice ";
      },
    });
    await operation.generate({
      get text() {
        texts++;
        return TEXT;
      },
    });
    expect(voices).toBe(1);
    expect(texts).toBe(1);
    await failure(
      operation.generate({
        get text(): string {
          throw new Error(KEY);
        },
      }),
      "invalid_input"
    );
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([401, 403])(
    "preserves HTTP %i access denial even when its error body declares an oversized length",
    async (status) => {
      const { client, request } = setup();
      const cancel = vi.fn<() => void>();
      request.mockResolvedValue(
        new Response(new ReadableStream({ cancel }), {
          status,
          headers: { "content-length": String(64 * 1024 * 1024) },
        })
      );
      const operation = await client.resolve({
        model_id: ID,
        provider: "elevenlabs",
        voice_id: "voice",
      });
      await failure(
        operation.generate({ text: TEXT }),
        "provider_access_denied"
      );
      expect(request).toHaveBeenCalledOnce();
      expect(cancel).toHaveBeenCalledOnce();
    }
  );

  it.each([429, 500, 503])(
    "never retries or exposes a provider HTTP %i failure",
    async (status) => {
      const { client, request } = setup();
      request.mockResolvedValue(new Response(`upstream ${KEY}`, { status }));
      const operation = await client.resolve({
        model_id: ID,
        provider: "elevenlabs",
        voice_id: "voice",
      });
      await failure(operation.generate({ text: TEXT }), "generation_failed");
      expect(request).toHaveBeenCalledOnce();
    }
  );

  it("contains transport/key exceptions and never logs provider secrets", async () => {
    const { client, request, get } = setup();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
      voice_id: "voice",
    });
    request.mockRejectedValue(
      new Proxy(
        {},
        {
          getPrototypeOf() {
            throw new Error(KEY);
          },
        }
      )
    );
    await failure(operation.generate({ text: TEXT }), "generation_failed");
    get.mockRejectedValue(new Error(KEY));
    await failure(operation.generate({ text: TEXT }), "generation_failed");
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([undefined, "audio/wav", "application/json"])(
    "refuses unexpected output media before materializing audio",
    async (type) => {
      const { client, request } = setup();
      const cancel = vi.fn<() => void>();
      request.mockResolvedValue(
        new Response(new ReadableStream({ cancel }), {
          headers: type ? { "content-type": type } : {},
        })
      );
      const operation = await client.resolve({
        model_id: ID,
        provider: "elevenlabs",
        voice_id: "voice",
      });
      await failure(operation.generate({ text: TEXT }), "invalid_response");
      expect(cancel).toHaveBeenCalledOnce();
    }
  );

  it("refuses empty audio and output beyond 16 MiB", async () => {
    const { client, request } = setup();
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
      voice_id: "voice",
    });
    request.mockResolvedValueOnce(
      new Response(new Uint8Array(), {
        headers: { "content-type": "audio/mpeg" },
      })
    );
    await failure(operation.generate({ text: TEXT }), "invalid_response");
    const cancel = vi.fn<() => void>();
    request.mockResolvedValueOnce(
      new Response(new ReadableStream({ cancel }), {
        headers: {
          "content-type": "audio/mpeg",
          "content-length": String(16 * 1024 * 1024 + 1),
        },
      })
    );
    await failure(operation.generate({ text: TEXT }), "invalid_response");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("bounds streamed audio without trusting Content-Length", async () => {
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
      voice_id: "voice",
    });
    await failure(operation.generate({ text: TEXT }), "invalid_response");
    expect(cancel).toHaveBeenCalledOnce();
  });
});

describe("speech invocation lifecycle", () => {
  it("bounds resolution and generation key lookups without later paid submission", async () => {
    vi.useFakeTimers();
    const { client, get, request } = setup();
    const key = deferred<string>();
    get.mockReturnValue(key.promise);
    const selection = failure(
      client.resolve({
        model_id: ID,
        provider: "elevenlabs",
        voice_id: "voice",
      }),
      "timeout"
    );
    await vi.advanceTimersByTimeAsync(300_000);
    await selection;
    key.resolve(KEY);
    await vi.advanceTimersByTimeAsync(1);
    get.mockReturnValue(KEY);
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
      voice_id: "voice",
    });
    const next = deferred<string>();
    get.mockReturnValue(next.promise);
    const checked = failure(operation.generate({ text: TEXT }), "timeout");
    await vi.advanceTimersByTimeAsync(300_000);
    await checked;
    next.resolve(KEY);
    await vi.advanceTimersByTimeAsync(1);
    expect(request).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("checks the monotonic deadline before submitting after delayed key work", async () => {
    const { client, get, request } = setup();
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
      voice_id: "voice",
    });
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    get.mockImplementation(() => {
      now = 300_001;
      return KEY;
    });
    await failure(operation.generate({ text: TEXT }), "timeout");
    expect(request).not.toHaveBeenCalled();
  });

  it.each(["key", "request"] as const)(
    "contains rejected work when the %s capability synchronously aborts",
    async (stage) => {
      const { client, get, request } = setup();
      const operation = await client.resolve({
        model_id: ID,
        provider: "elevenlabs",
        voice_id: "voice",
      });
      const controller = new AbortController();
      const reject = () => {
        controller.abort();
        return Promise.reject(new Error(KEY));
      };
      if (stage === "key") get.mockImplementation(reject);
      else request.mockImplementation(reject);
      await failure(
        operation.generate({ text: TEXT, signal: controller.signal }),
        "aborted"
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(request).toHaveBeenCalledTimes(stage === "key" ? 0 : 1);
    }
  );

  it("discards late responses after timeout without retrying the accepted submission", async () => {
    vi.useFakeTimers();
    const { client, request } = setup();
    const pending = deferred<Response>();
    request.mockReturnValue(pending.promise);
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
      voice_id: "voice",
    });
    const checked = failure(operation.generate({ text: TEXT }), "timeout");
    await vi.advanceTimersByTimeAsync(300_000);
    await checked;
    const cancel = vi.fn<() => void>();
    pending.resolve(new Response(new ReadableStream({ cancel })));
    await vi.advanceTimersByTimeAsync(1);
    expect(cancel).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledOnce();
  });

  it("unlocks a stalled body on cancellation without awaiting host cleanup", async () => {
    const { client, request } = setup();
    const cancel = vi.fn<() => Promise<void>>(() => new Promise(() => {}));
    const response = new Response(new ReadableStream({ cancel }), {
      headers: { "content-type": "audio/mpeg" },
    });
    request.mockResolvedValue(response);
    const operation = await client.resolve({
      model_id: ID,
      provider: "elevenlabs",
      voice_id: "voice",
    });
    const controller = new AbortController();
    const checked = failure(
      operation.generate({ text: TEXT, signal: controller.signal }),
      "aborted"
    );
    await vi.waitFor(() => expect(response.body!.locked).toBe(true));
    controller.abort();
    await checked;
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body!.locked).toBe(false);
  });
});
