// GRIDA-SEC-004 — public voice discovery, fixed authority, safe projection and bounded pagination.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderHttp, TextToSpeechClient } from "./index";

const KEY = "synthetic-private-voice-key";
const LIMIT = 2 * 1024 * 1024;
const ENDPOINT = "https://api.elevenlabs.io/v2/voices";
const SELECTION = { provider: "elevenlabs" } as const;

function page(voices: unknown[] = [], extra: Record<string, unknown> = {}) {
  return Response.json({ voices, has_more: false, ...extra });
}
function setup() {
  const get = vi.fn<TextToSpeechClient.Keys["get"]>(() => KEY);
  const request = vi.fn<typeof fetch>(async () => page());
  const download = vi.fn<typeof fetch>(async () => {
    throw new Error("synthetic-private-download-must-not-run");
  });
  const client = new TextToSpeechClient({
    keys: { get },
    http: new ProviderHttp({ request, download }),
  });
  return { client, get, request, download };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function failure(
  promise: Promise<unknown>,
  code: TextToSpeechClient.FailureCode
) {
  const error: unknown = await promise.catch((value: unknown) => value);
  expect(error).toBeInstanceOf(TextToSpeechClient.Failure);
  expect(error).toMatchObject({ code, message: code });
  expect(JSON.parse(JSON.stringify(error))).toEqual({ code, message: code });
  expect(error).not.toHaveProperty("cause");
  expect(String(error)).not.toMatch(/synthetic-|upstream|secret/);
  expect((error as Error).stack).not.toMatch(/synthetic-|upstream|secret/);
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("TextToSpeechClient voice discovery", () => {
  it("uses the fixed request and projects, deduplicates and sorts names then ids", async () => {
    const { client, get, request, download } = setup();
    const opaque = "next/?token=+&other#你好";
    request.mockResolvedValueOnce(
      page(
        [
          {
            voice_id: " b ",
            name: " Same ",
            preview_url: KEY,
            settings: { key: KEY },
          },
          { voice_id: " z ", name: " Zed ", sample: KEY },
        ],
        {
          has_more: true,
          next_page_token: ` ${opaque} `,
          total_count: 99,
          private: KEY,
        }
      )
    );
    request.mockResolvedValueOnce(
      page([
        { voice_id: "b", name: "Changed duplicate" },
        { voice_id: "a", name: "Same" },
        { voice_id: "first", name: "Alice" },
      ])
    );
    const voices = await client.listVoices(SELECTION);
    expect(voices).toEqual([
      { voice_id: "first", name: "Alice" },
      { voice_id: "a", name: "Same" },
      { voice_id: "b", name: "Same" },
      { voice_id: "z", name: "Zed" },
    ]);
    expect(JSON.stringify(voices)).not.toContain(KEY);
    expect(request).toHaveBeenCalledTimes(2);
    for (const [index, [input, init]] of request.mock.calls.entries()) {
      const expected = new URL(ENDPOINT);
      expected.searchParams.set("page_size", "100");
      if (index) expected.searchParams.set("next_page_token", opaque);
      expect(String(input)).toBe(expected.toString());
      expect(init?.method).toBe("GET");
      expect(init?.body).toBeUndefined();
      expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
        "xi-api-key": KEY,
        accept: "application/json",
      });
    }
    expect(get.mock.calls).toEqual([["elevenlabs"]]);
    expect(download).not.toHaveBeenCalled();
  });

  it("accepts first-page default voices beyond the requested page size", async () => {
    const { client, request } = setup();
    request.mockResolvedValue(
      page(
        Array.from({ length: 125 }, (_, i) => ({
          voice_id: `voice-${i}`,
          name: `Voice ${i}`,
        }))
      )
    );
    expect(await client.listVoices(SELECTION)).toHaveLength(125);
    expect(request).toHaveBeenCalledOnce();
  });

  it("keeps one account key across pages and reads a changed or removed key on the next invocation", async () => {
    const { client, get, request } = setup();
    let current: string | null = KEY;
    get.mockImplementation(() => current);
    request.mockImplementationOnce(async () => {
      current = "synthetic-private-rotated-key";
      return page([{ voice_id: "one", name: "One" }], {
        has_more: true,
        next_page_token: "next",
      });
    });
    request.mockImplementation(async () => page());
    await client.listVoices(SELECTION);
    expect(get).toHaveBeenCalledOnce();
    expect(
      request.mock.calls.map(([, init]) =>
        new Headers(init?.headers).get("xi-api-key")
      )
    ).toEqual([KEY, KEY]);
    await client.listVoices(SELECTION);
    expect(get).toHaveBeenCalledTimes(2);
    expect(
      new Headers(request.mock.calls[2][1]?.headers).get("xi-api-key")
    ).toBe(current);
    current = null;
    await failure(client.listVoices(SELECTION), "provider_key_required");
    expect(request).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["empty", ""],
    ["blank", " "],
    ["number", 123],
    ["object", {}],
    ["oversized", "x".repeat(1025)],
    ["unpaired surrogate", "\ud800"],
  ])("rejects a %s continuation cursor", async (_label, cursor) => {
    const { client, request } = setup();
    request.mockResolvedValue(
      page([], { has_more: true, next_page_token: cursor })
    );
    await failure(client.listVoices(SELECTION), "invalid_response");
    expect(request).toHaveBeenCalledOnce();
  });

  it("rejects a cursor cycle before issuing the repeated page", async () => {
    const { client, request } = setup();
    for (const cursor of ["a", "b", "a"])
      request.mockResolvedValueOnce(
        page([], { has_more: true, next_page_token: cursor })
      );
    await failure(client.listVoices(SELECTION), "invalid_response");
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("accepts a maximum-length opaque cursor and stops on the terminal page", async () => {
    const { client, request } = setup();
    const cursor = "😀".repeat(1024);
    request.mockResolvedValueOnce(
      page([], { has_more: true, next_page_token: cursor })
    );
    request.mockResolvedValueOnce(page([], { next_page_token: null }));
    expect(await client.listVoices(SELECTION)).toEqual([]);
    expect(
      new URL(String(request.mock.calls[1][0])).searchParams.get(
        "next_page_token"
      )
    ).toBe(cursor);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("returns a sorted partial catalogue after ten pages without requesting eleven", async () => {
    const { client, request } = setup();
    let count = 0;
    request.mockImplementation(async () => {
      count++;
      return page(
        [{ voice_id: `voice-${count}`, name: `Voice ${11 - count}` }],
        { has_more: true, next_page_token: `page-${count}` }
      );
    });
    const voices = await client.listVoices(SELECTION);
    expect(voices).toHaveLength(10);
    expect(voices.map((voice) => voice.name)).toEqual([
      "Voice 1",
      "Voice 10",
      "Voice 2",
      "Voice 3",
      "Voice 4",
      "Voice 5",
      "Voice 6",
      "Voice 7",
      "Voice 8",
      "Voice 9",
    ]);
    expect(request).toHaveBeenCalledTimes(10);
  });

  it("stops at two thousand unique results without fetching another page", async () => {
    const { client, request } = setup();
    request.mockResolvedValue(
      page(
        Array.from({ length: 2001 }, (_, i) => ({
          voice_id: `voice-${i}`,
          name: `Voice ${i}`,
        })),
        { has_more: true, next_page_token: "unused" }
      )
    );
    const voices = await client.listVoices(SELECTION);
    expect(voices).toHaveLength(2000);
    expect(voices.some((voice) => voice.voice_id === "voice-2000")).toBe(false);
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([
    ["nonboolean has_more", { voices: [], has_more: "false" }],
    ["missing voices", { voices: null, has_more: false }],
    ["nonobject voice", { voices: [null], has_more: false }],
    [
      "empty id",
      { voices: [{ voice_id: "", name: "Voice" }], has_more: false },
    ],
    [
      "oversized name",
      { voices: [{ voice_id: "id", name: "x".repeat(257) }], has_more: false },
    ],
    [
      "oversized id",
      {
        voices: [{ voice_id: "x".repeat(257), name: "Voice" }],
        has_more: false,
      },
    ],
    [
      "invalid unused cursor",
      { voices: [], has_more: false, next_page_token: 123 },
    ],
  ])(
    "rejects %s page metadata without returning partial voices",
    async (_label, value) => {
      const { client, request } = setup();
      request.mockResolvedValue(Response.json(value));
      await failure(client.listVoices(SELECTION), "invalid_response");
      expect(request).toHaveBeenCalledOnce();
    }
  );

  it("rejects malformed JSON without reflecting its private contents", async () => {
    const { client, request } = setup();
    request.mockResolvedValue(
      new Response(`{invalid upstream ${KEY}`, {
        headers: { "content-type": "application/json" },
      })
    );
    await failure(client.listVoices(SELECTION), "invalid_response");
    expect(request).toHaveBeenCalledOnce();
  });

  it("does not turn access denied on a later page into a successful partial list", async () => {
    const { client, request } = setup();
    request.mockResolvedValueOnce(
      page([{ voice_id: "first", name: "First" }], {
        has_more: true,
        next_page_token: "second",
      })
    );
    request.mockResolvedValueOnce(
      new Response(`upstream ${KEY}`, { status: 403 })
    );
    await failure(client.listVoices(SELECTION), "provider_access_denied");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403])(
    "preserves access denied for HTTP %i even with an oversized error body",
    async (status) => {
      const { client, request } = setup();
      const cancel = vi.fn<() => void>();
      const body = new ReadableStream<Uint8Array>({ cancel });
      request.mockResolvedValue(
        new Response(body, {
          status,
          headers: {
            "content-length": String(LIMIT + 1),
            "content-type": "application/json",
          },
        })
      );
      await failure(client.listVoices(SELECTION), "provider_access_denied");
      expect(cancel).toHaveBeenCalledOnce();
      expect(body.locked).toBe(false);
      expect(request).toHaveBeenCalledOnce();
    }
  );

  it.each([429, 500])(
    "discards HTTP %i error bodies and returns only a safe failure",
    async (status) => {
      const { client, request } = setup();
      const cancel = vi.fn<() => void>();
      request.mockResolvedValue(
        new Response(
          new ReadableStream<Uint8Array>({
            start(stream) {
              stream.enqueue(new TextEncoder().encode(`upstream ${KEY}`));
            },
            cancel,
          }),
          { status }
        )
      );
      await failure(client.listVoices(SELECTION), "generation_failed");
      expect(cancel).toHaveBeenCalledOnce();
      expect(request).toHaveBeenCalledOnce();
    }
  );

  it.each(["key", "request"] as const)(
    "contains a throwing %s capability without retaining its private error",
    async (where) => {
      const { client, get, request } = setup();
      const error = () => {
        throw new Error(`upstream ${KEY}`);
      };
      if (where === "key") get.mockImplementation(error);
      else request.mockImplementation(error);
      await failure(client.listVoices(SELECTION), "generation_failed");
      expect(request).toHaveBeenCalledTimes(where === "key" ? 0 : 1);
    }
  );

  it("rejects a declared successful page above two MiB and accepts exactly two MiB", async () => {
    const { client, request } = setup();
    const cancel = vi.fn<() => void>();
    request.mockResolvedValueOnce(
      new Response(new ReadableStream({ cancel }), {
        headers: {
          "content-type": "application/json",
          "content-length": String(LIMIT + 1),
        },
      })
    );
    await failure(client.listVoices(SELECTION), "invalid_response");
    expect(cancel).toHaveBeenCalledOnce();
    const json = JSON.stringify({ voices: [], has_more: false });
    request.mockResolvedValueOnce(
      new Response(json.padEnd(LIMIT, " "), {
        headers: { "content-type": "application/json" },
      })
    );
    expect(await client.listVoices(SELECTION)).toEqual([]);
  });

  it("bounds streamed page bytes independently of Content-Length and releases its reader", async () => {
    const { client, request } = setup();
    const cancel = vi.fn<() => void>();
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(stream) {
        if (++pulls > 8) {
          stream.error(new Error("bounded fixture exhausted"));
          return;
        }
        stream.enqueue(new Uint8Array(1024 * 1024));
      },
      cancel,
    });
    request.mockResolvedValue(
      new Response(body, { headers: { "content-type": "application/json" } })
    );
    await failure(client.listVoices(SELECTION), "invalid_response");
    expect(pulls).toBeLessThanOrEqual(4);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it("shares one whole deadline across key lookup and every page, then cancels a late response", async () => {
    vi.useFakeTimers();
    const { client, get, request } = setup();
    const key = deferred<string>();
    const first = deferred<Response>();
    const second = deferred<Response>();
    get.mockReturnValue(key.promise);
    request
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const checked = failure(client.listVoices(SELECTION), "timeout");
    await vi.advanceTimersByTimeAsync(100_000);
    key.resolve(KEY);
    await vi.advanceTimersByTimeAsync(100_000);
    expect(request).toHaveBeenCalledOnce();
    first.resolve(page([], { has_more: true, next_page_token: "second" }));
    await vi.advanceTimersByTimeAsync(99_999);
    expect(request).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await checked;
    const cancel = vi.fn<() => void>();
    second.resolve(
      new Response(new ReadableStream({ cancel }), {
        headers: { "content-type": "application/json" },
      })
    );
    await vi.advanceTimersByTimeAsync(1);
    expect(cancel).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start a first page after cancellation during a pending key lookup", async () => {
    const { client, get, request } = setup();
    const key = deferred<string>();
    get.mockReturnValue(key.promise);
    const controller = new AbortController();
    const checked = failure(
      client.listVoices({ ...SELECTION, signal: controller.signal }),
      "aborted"
    );
    controller.abort();
    await checked;
    key.resolve(KEY);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(request).not.toHaveBeenCalled();
  });

  it("cancels a pending page body without waiting for host cancellation or starting another page", async () => {
    const { client, request } = setup();
    const cancel = vi.fn<() => Promise<void>>(() => new Promise(() => {}));
    const started = deferred<void>();
    const body = new ReadableStream<Uint8Array>({
      pull() {
        started.resolve();
      },
      cancel,
    });
    request.mockResolvedValue(
      new Response(body, { headers: { "content-type": "application/json" } })
    );
    const controller = new AbortController();
    const checked = failure(
      client.listVoices({ ...SELECTION, signal: controller.signal }),
      "aborted"
    );
    await started.promise;
    await vi.waitFor(() => expect(body.locked).toBe(true));
    controller.abort();
    await checked;
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(request).toHaveBeenCalledOnce();
  });

  it("refuses a pre-aborted list before consulting the credential capability", async () => {
    const { client, get, request } = setup();
    const controller = new AbortController();
    controller.abort();
    await failure(
      client.listVoices({ ...SELECTION, signal: controller.signal }),
      "aborted"
    );
    expect(get).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
});
