// GRIDA-SEC-004 / GRIDA-SEC-006 — public video authority, whole-operation bounds, safe results.
// GRIDA-GG: token — synthetic scoped credentials only; no services or provider calls.
import { afterEach, describe, expect, it, vi } from "vitest";
import { models } from "@grida/ai-models";
import {
  VideoClient,
  ProviderHttp,
  GridaGatewaySessionStore,
  ModelCatalogStore,
} from "./index";

const ID = "google/veo-3.1";
const KEY = "synthetic-private-key";
const PROMPT = "synthetic-private-prompt";
const FRAME = "https://assets.example/frame.png";
const DATA = new Uint8Array([1, 2, 3]);
const BASE64 = "AQID";
const GG = "https://gg.example";

function sse(videos: unknown[], extras = {}) {
  return new Response(
    `data: ${JSON.stringify({ type: "result", videos, ...extras })}\n\n`,
    { headers: { "content-type": "text/event-stream" } }
  );
}
const inline = () => ({ type: "base64", data: BASE64, mediaType: "video/mp4" });
function setup(overrides: Partial<VideoClient.Options> = {}) {
  const request = vi.fn<typeof fetch>(async () => sse([inline()]));
  const download = vi.fn<typeof fetch>(async () => new Response(DATA));
  const get = vi.fn<VideoClient.Keys["get"]>(() => KEY);
  const client = new VideoClient({
    keys: { get },
    http: new ProviderHttp({ request, download }),
    ...overrides,
  });
  return { client, request, download, get };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function failure(
  promise: Promise<unknown>,
  code: VideoClient.FailureCode
) {
  const error: unknown = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(VideoClient.Failure);
  expect(error).toMatchObject({ code, message: code });
  expect(JSON.parse(JSON.stringify(error))).toEqual({ code, message: code });
  expect(String(error)).not.toMatch(/synthetic-|secret|upstream/);
  expect(error).not.toHaveProperty("cause");
}
function falMock(
  request: ReturnType<typeof setup>["request"],
  overrides: { result?: unknown; poll?: unknown } = {}
) {
  request.mockImplementation(async (url, init) => {
    if (init?.method === "POST")
      return Response.json({
        status_url: "https://queue.fal.run/job/status",
        response_url: "https://queue.fal.run/job/result",
      });
    if (String(url).endsWith("/status"))
      return Response.json(overrides.poll ?? { status: "COMPLETED" });
    return Response.json(
      overrides.result ?? {
        video: {
          url: "https://v3.fal.media/video.mp4",
          content_type: "video/mp4",
        },
      }
    );
  });
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("VideoClient public operation", () => {
  it("freezes explicit selection without a credential/model access surface and uses Vercel's video wire", async () => {
    const { client, request, get, download } = setup();
    const operation = await client.resolve({
      model_id: ID,
      provider: "vercel",
      image: true,
    });
    expect(operation).toMatchObject({
      model_id: ID,
      provider_id: "vercel",
      binding_id: "google/veo-3.1-generate-001",
      input: "text-or-image",
    });
    expect(Object.isFrozen(operation)).toBe(true);
    expect(Object.keys(client)).toEqual([]);
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(client))).toEqual([
      "constructor",
      "resolve",
    ]);
    expect(request).not.toHaveBeenCalled();
    expect(JSON.stringify(operation)).not.toContain(KEY);
    const result = await operation.generate({
      prompt: PROMPT,
      image_url: FRAME,
      aspect_ratio: "16:9",
      resolution: "1280x720",
      duration: 4,
      fps: 24,
      seed: 7,
    });
    expect(result).toEqual({
      videos: [{ data: DATA, media_type: "video/mp4" }],
    });
    expect(result.videos[0].data.constructor).toBe(Uint8Array);
    expect(get).toHaveBeenCalledTimes(2);
    expect(download).not.toHaveBeenCalled();
    const [url, init] = request.mock.calls[0];
    expect(url).toBe("https://ai-gateway.vercel.sh/v3/ai/video-model");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${KEY}`
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({
      prompt: PROMPT,
      n: 1,
      image: { type: "url", url: FRAME },
      aspectRatio: "16:9",
      resolution: "1280x720",
      duration: 4,
      fps: 24,
      seed: 7,
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it.each(["google/veo-3.1", "bytedance/seedance-2.0", "alibaba/wan-3.0"])(
    "requires the grounded fal frame and maps the exact binding: %s",
    async (model_id) => {
      const { client, request, download } = setup();
      falMock(request);
      await failure(
        client.resolve({ model_id, provider: "fal" }),
        "input_unsupported"
      );
      const operation = await client.resolve({
        model_id,
        provider: "fal",
        image: true,
      });
      await failure(operation.generate({ prompt: PROMPT }), "invalid_input");
      expect(request).not.toHaveBeenCalled();
      expect(
        await operation.generate({ prompt: PROMPT, image_url: FRAME, seed: 0 })
      ).toEqual({ videos: [{ data: DATA, media_type: "video/mp4" }] });
      const body = JSON.parse(String(request.mock.calls[0][1]?.body));
      const field =
        model_id === "alibaba/wan-3.0" ? "start_image_url" : "image_url";
      expect(body).toEqual({ prompt: PROMPT, [field]: FRAME, seed: 0 });
      expect(
        request.mock.calls.every(
          ([, init]) =>
            new Headers(init?.headers).get("authorization") === `Key ${KEY}`
        )
      ).toBe(true);
      expect(download).toHaveBeenCalledWith("https://v3.fal.media/video.mp4", {
        signal: expect.any(AbortSignal),
      });
      expect(
        new Headers(download.mock.calls[0][1]?.headers).has("authorization")
      ).toBe(false);
    }
  );

  it("uses an invocation key snapshot for OpenRouter polls/content, ignores unsigned URLs, and rereads for the next operation", async () => {
    const { client, request, get, download } = setup();
    const operation = await client.resolve({
      model_id: ID,
      provider: "openrouter",
      image: true,
    });
    get.mockReturnValue("rotated-key");
    request.mockImplementation(async (url, init) => {
      if (init?.method === "POST") {
        get.mockReturnValue(null);
        return Response.json({ id: "job/a" });
      }
      if (String(url).includes("/content?"))
        return new Response(DATA, { headers: { "content-type": "video/mp4" } });
      return Response.json({
        status: "completed",
        unsigned_urls: ["https://untrusted.example/secret"],
      });
    });
    expect(
      await operation.generate({
        prompt: PROMPT,
        image_url: FRAME,
        resolution: "1280x720",
        duration: 4,
        fps: 24,
        seed: 0,
      })
    ).toEqual({ videos: [{ data: DATA, media_type: "video/mp4" }] });
    expect(request.mock.calls.map(([url]) => String(url))).toEqual([
      "https://openrouter.ai/api/v1/videos",
      "https://openrouter.ai/api/v1/videos/job%2Fa",
      "https://openrouter.ai/api/v1/videos/job%2Fa/content?index=0",
    ]);
    expect(
      request.mock.calls.every(
        ([, init]) =>
          new Headers(init?.headers).get("authorization") ===
          "Bearer rotated-key"
      )
    ).toBe(true);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({
      model: ID,
      prompt: PROMPT,
      size: "1280x720",
      duration: 4,
      fps: 24,
      seed: 0,
      frame_images: [
        {
          type: "image_url",
          image_url: { url: FRAME },
          frame_type: "first_frame",
        },
      ],
    });
    expect(download).not.toHaveBeenCalled();
    await failure(
      operation.generate({ prompt: PROMPT, image_url: FRAME }),
      "provider_unavailable"
    );
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("uses actual auto precedence, keeps explicit providers fixed, and intersects GG with verified text eligibility", async () => {
    const { client, get } = setup();
    expect(
      (await client.resolve({ model_id: ID, provider: "auto" })).provider_id
    ).toBe("openrouter");
    get.mockImplementation((provider) => (provider === "fal" ? KEY : null));
    await failure(
      client.resolve({ model_id: ID, provider: "vercel" }),
      "provider_unavailable"
    );
    expect(
      (await client.resolve({ model_id: ID, provider: "auto", image: true }))
        .provider_id
    ).toBe("fal");
    const gg = new GridaGatewaySessionStore();
    gg.set({ access_token: "scoped-token", expires_at: Date.now() + 600_000 });
    const hosted = setup({ gg, gg_base_url: GG });
    await failure(
      hosted.client.resolve({
        model_id: "xai/grok-imagine-video-1.5",
        provider: "gg",
      }),
      "input_unsupported"
    );
    await failure(
      hosted.client.resolve({ model_id: ID, provider: "gg", image: true }),
      "input_unsupported"
    );
  });

  it("keeps exact legacy binding facts but refuses unknown/replaced capability routes", async () => {
    const snapshot = models.snapshot.seed();
    const legacy = JSON.parse(JSON.stringify(snapshot));
    // Published snapshots store video cards by canonical id.
    const section = legacy.video;
    const cards = section.models;
    delete cards[ID].providers.vercel.input;
    const first = setup({
      catalog: new ModelCatalogStore({ snapshot: legacy }),
    });
    expect(
      (await first.client.resolve({ model_id: ID, provider: "vercel" })).input
    ).toBe("text-or-image");
    cards[ID].providers.vercel.id = "new/unverified-binding";
    const second = setup({
      catalog: new ModelCatalogStore({ snapshot: legacy }),
    });
    await failure(
      second.client.resolve({ model_id: ID, provider: "vercel" }),
      "input_unsupported"
    );
  });

  it("GG posts once using the live scoped token, returns only bytes, and clear blocks later submissions", async () => {
    const gg = new GridaGatewaySessionStore();
    gg.set({ access_token: "scoped-token", expires_at: Date.now() + 600_000 });
    const { client, request } = setup({ gg, gg_base_url: GG });
    request.mockImplementation(async () => {
      gg.clear();
      return Response.json({
        videos: [{ base64: BASE64, media_type: "video/mp4", secret: KEY }],
        stored_media: [KEY],
      });
    });
    const operation = await client.resolve({ model_id: ID, provider: "gg" });
    expect(await operation.generate({ prompt: PROMPT, seed: 0 })).toEqual({
      videos: [{ data: DATA, media_type: "video/mp4" }],
    });
    expect(request.mock.calls[0][0]).toBe(`${GG}/api/v1/ai/videos/generations`);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({
      model_id: ID,
      prompt: PROMPT,
      seed: 0,
    });
    expect(
      new Headers(request.mock.calls[0][1]?.headers).get("authorization")
    ).toBe("Bearer scoped-token");
    await failure(operation.generate({ prompt: PROMPT }), "gg_token_expired");
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([
    [401, "gg_token_expired"],
    [402, "insufficient_credits"],
    [500, "generation_failed"],
  ] as const)("contains GG HTTP %i", async (status, code) => {
    const gg = { getAccessToken: () => "scoped-token" };
    const { client, request } = setup({ gg, gg_base_url: GG });
    request.mockImplementation(
      async () => new Response(`secret ${PROMPT}`, { status })
    );
    const operation = await client.resolve({ model_id: ID, provider: "gg" });
    await failure(operation.generate({ prompt: PROMPT }), code);
    expect(request).toHaveBeenCalledOnce();
  });

  it("does not log arbitrary successful provider warnings or expose metadata", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, request } = setup();
    request.mockImplementation(async () =>
      sse([inline()], {
        warnings: [{ type: "other", message: `secret ${KEY}` }],
        providerMetadata: { vercel: { secret: KEY } },
      })
    );
    const operation = await client.resolve({
      model_id: ID,
      provider: "vercel",
    });
    expect(await operation.generate({ prompt: PROMPT })).toEqual({
      videos: [{ data: DATA, media_type: "video/mp4" }],
    });
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it.each(["fal", "vercel", "openrouter"] as const)(
    "never retries a failed paid %s submission",
    async (provider) => {
      const { client, request } = setup();
      request.mockImplementation(
        async () => new Response(`upstream-secret ${KEY}`, { status: 503 })
      );
      const operation = await client.resolve({
        model_id: ID,
        provider,
        image: provider === "fal",
      });
      await failure(
        operation.generate({
          prompt: PROMPT,
          ...(provider === "fal" ? { image_url: FRAME } : {}),
        }),
        "generation_failed"
      );
      expect(request).toHaveBeenCalledOnce();
    }
  );

  it.each([
    "https://other.example/result.mp4",
    "https://ai-gateway.vercel.sh.evil.example/result.mp4",
    "https://ai-gateway.vercel.sh:8443/result.mp4",
  ])("refuses an untrusted Vercel result origin %s", async (url) => {
    const { client, request, download } = setup();
    request.mockImplementation(async () =>
      sse([{ type: "url", url, mediaType: "video/mp4" }])
    );
    const operation = await client.resolve({
      model_id: ID,
      provider: "vercel",
    });
    await failure(
      operation.generate({ prompt: PROMPT }),
      "unsupported_untrusted_result_origin"
    );
    expect(download).not.toHaveBeenCalled();
  });

  it.each([
    "https://ai-gateway.vercel.sh/result.mp4",
    "data:video/mp4;base64,AQID",
  ])("accepts allowed Vercel results %s", async (url) => {
    const { client, request, download } = setup();
    request.mockImplementation(async () =>
      sse([{ type: "url", url, mediaType: "video/mp4" }])
    );
    const operation = await client.resolve({
      model_id: ID,
      provider: "vercel",
    });
    expect(await operation.generate({ prompt: PROMPT })).toEqual({
      videos: [{ data: DATA, media_type: "video/mp4" }],
    });
    expect(download).toHaveBeenCalledTimes(url.startsWith("data:") ? 0 : 1);
  });

  it("refuses queue credential exfiltration before a second request", async () => {
    const { client, request, download } = setup();
    request.mockImplementation(async () =>
      Response.json({
        status_url: "https://evil.example/status",
        response_url: "https://fal.run/result",
      })
    );
    const operation = await client.resolve({
      model_id: ID,
      provider: "fal",
      image: true,
    });
    await failure(
      operation.generate({ prompt: PROMPT, image_url: FRAME }),
      "generation_failed"
    );
    expect(request).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
  });

  it.each([
    { prompt: PROMPT, n: 2 },
    { prompt: PROMPT, resolution: "720p" },
    { prompt: PROMPT, image_url: FRAME },
    { prompt: PROMPT, duration: -1 },
    { prompt: PROMPT, fps: 0 },
    { prompt: PROMPT, seed: NaN },
  ])(
    "rejects invalid input before authority lookup/submission",
    async (input) => {
      const { client, request, get } = setup();
      const operation = await client.resolve({
        model_id: ID,
        provider: "vercel",
      });
      await failure(
        operation.generate(input as VideoClient.Input),
        "invalid_input"
      );
      expect(get).toHaveBeenCalledOnce();
      expect(request).not.toHaveBeenCalled();
    }
  );

  it("snapshots input getters and safely contains throwing inputs/provider errors", async () => {
    const { client, request, get } = setup();
    const operation = await client.resolve({
      model_id: ID,
      provider: "vercel",
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
    get.mockImplementation(() => {
      throw new Proxy(
        {},
        {
          getPrototypeOf() {
            throw new Error(KEY);
          },
        }
      );
    });
    await failure(operation.generate({ prompt: PROMPT }), "generation_failed");
    expect(request).toHaveBeenCalledOnce();
  });

  it("refuses the pinned Vercel adapter's unrepresentable zero seed before key lookup", async () => {
    const { client, request, get } = setup();
    const operation = await client.resolve({
      model_id: ID,
      provider: "vercel",
    });
    await failure(
      operation.generate({ prompt: PROMPT, seed: 0 }),
      "invalid_input"
    );
    expect(get).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
  });
});

describe("video execution and result bounds", () => {
  it("allows cancellation timers to run during an always-ready zero-byte download", async () => {
    const { client, request, download } = setup();
    request.mockImplementation(async () =>
      sse([
        {
          type: "url",
          url: "https://ai-gateway.vercel.sh/result",
          mediaType: "video/mp4",
        },
      ])
    );
    const controller = new AbortController();
    let pulls = 0;
    const cancel = vi.fn<() => void>();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(stream) {
          pulls++;
          // A broken reader must fail this fixture instead of starving the test runner.
          if (pulls > 256) {
            stream.error(new Error("fixture exhausted"));
            return;
          }
          stream.enqueue(new Uint8Array());
        },
        cancel,
      })
    );
    download.mockImplementation(async () => {
      setTimeout(() => controller.abort(), 0);
      return response;
    });
    const operation = await client.resolve({
      model_id: ID,
      provider: "vercel",
    });
    await failure(
      operation.generate({ prompt: PROMPT, signal: controller.signal }),
      "aborted"
    );
    // The inner read's next task performs its final cleanup after the outer wait settles.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pulls).toBeLessThan(130);
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body!.locked).toBe(false);
  });

  it("refuses paid continuation past the monotonic deadline even before its timer can run", async () => {
    const { client, request, get } = setup();
    const operation = await client.resolve({
      model_id: ID,
      provider: "vercel",
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
    "observes rejection when the %s capability synchronously aborts",
    async (stage) => {
      const { client, request, get } = setup();
      const operation = await client.resolve({
        model_id: ID,
        provider: "vercel",
      });
      const controller = new AbortController();
      const rejected = () => {
        controller.abort();
        return Promise.reject(new Error(KEY));
      };
      if (stage === "key") get.mockImplementation(rejected);
      else request.mockImplementation(rejected);
      await failure(
        operation.generate({ prompt: PROMPT, signal: controller.signal }),
        "aborted"
      );
      // Vitest reports any unhandled rejection after this turn as a failed run.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(request).toHaveBeenCalledTimes(stage === "key" ? 0 : 1);
    }
  );

  it("releases a stalled provider reader even when cancellation never settles", async () => {
    const { client, request } = setup();
    const started = deferred<void>();
    const response = new Response(
      new ReadableStream({
        pull() {
          started.resolve();
        },
        cancel() {
          return new Promise<void>(() => {});
        },
      })
    );
    request.mockResolvedValue(response);
    const operation = await client.resolve({
      model_id: ID,
      provider: "vercel",
    });
    const controller = new AbortController();
    const checked = failure(
      operation.generate({ prompt: PROMPT, signal: controller.signal }),
      "aborted"
    );
    await started.promise;
    await Promise.resolve();
    controller.abort();
    await checked;
    expect(response.body!.locked).toBe(false);
  });

  it("settles a stalled credential read at the deadline and never submits when that read later resolves", async () => {
    vi.useFakeTimers();
    const { client, request, get } = setup();
    const operation = await client.resolve({
      model_id: ID,
      provider: "vercel",
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

  it("bounds a transport ignoring cancellation and discards/cancels its late response", async () => {
    vi.useFakeTimers();
    const { client, request } = setup();
    const response = deferred<Response>();
    request.mockReturnValue(response.promise);
    const operation = await client.resolve({
      model_id: ID,
      provider: "vercel",
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

  it("cancels a stalled result stream on explicit abort and does not wait for host cancellation", async () => {
    const { client, request, download } = setup();
    request.mockImplementation(async () =>
      sse([
        {
          type: "url",
          url: "https://ai-gateway.vercel.sh/result",
          mediaType: "video/mp4",
        },
      ])
    );
    const started = deferred<void>();
    const cancel = vi.fn<() => Promise<void>>(
      () => new Promise<void>(() => {})
    );
    const response = new Response(new ReadableStream({ cancel }));
    download.mockImplementation(async () => {
      started.resolve();
      return response;
    });
    const operation = await client.resolve({
      model_id: ID,
      provider: "vercel",
    });
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

  it("cancels a Vercel SSE connection after its first result even when the server leaves it open", async () => {
    const { client, request } = setup();
    const cancel = vi.fn<() => void>();
    request.mockImplementation(
      async () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify({ type: "result", videos: [inline()] })}\n\n`
                )
              );
            },
            cancel,
          }),
          { headers: { "content-type": "text/event-stream" } }
        )
    );
    const operation = await client.resolve({
      model_id: ID,
      provider: "vercel",
    });
    expect(await operation.generate({ prompt: PROMPT })).toEqual({
      videos: [{ data: DATA, media_type: "video/mp4" }],
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("bounds queue work by the original operation deadline without a second paid submission", async () => {
    vi.useFakeTimers();
    const { client, request } = setup();
    falMock(request, { poll: { status: "IN_PROGRESS" } });
    const operation = await client.resolve({
      model_id: ID,
      provider: "fal",
      image: true,
    });
    const checked = failure(
      operation.generate({ prompt: PROMPT, image_url: FRAME }),
      "timeout"
    );
    await vi.advanceTimersByTimeAsync(300_000);
    await checked;
    expect(
      request.mock.calls.filter(([, init]) => init?.method === "POST")
    ).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(
    [
      [],
      Array.from({ length: 17 }, inline),
      [{ ...inline(), data: "!!!" }],
      [{ ...inline(), data: "" }],
      [{ ...inline(), mediaType: "text/html" }],
    ].map((videos) => [videos])
  )("rejects invalid/count-bounded inline output", async (videos) => {
    const { client, request } = setup();
    request.mockImplementation(async () => sse(videos));
    const operation = await client.resolve({
      model_id: ID,
      provider: "vercel",
    });
    await failure(operation.generate({ prompt: PROMPT }), "invalid_response");
    expect(request).toHaveBeenCalledOnce();
  });

  it("bounds authenticated OpenRouter content before allocation and cancels the oversized body", async () => {
    const { client, request, download } = setup();
    const cancel = vi.fn<() => void>();
    request.mockImplementation(async (url, init) => {
      if (init?.method === "POST") return Response.json({ id: "job" });
      if (String(url).includes("/content?"))
        return new Response(new ReadableStream({ cancel }), {
          headers: { "content-length": String(64 * 1024 * 1024 + 1) },
        });
      return Response.json({ status: "completed" });
    });
    const operation = await client.resolve({
      model_id: ID,
      provider: "openrouter",
    });
    await failure(operation.generate({ prompt: PROMPT }), "invalid_response");
    expect(cancel).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
  });

  it("shares the decoded byte budget across mixed inline and remote results", async () => {
    const { client, request, download } = setup();
    const cancel = vi.fn<() => void>();
    request.mockImplementation(async () =>
      sse([
        inline(),
        {
          type: "url",
          url: "https://ai-gateway.vercel.sh/result",
          mediaType: "video/mp4",
        },
      ])
    );
    download.mockImplementation(
      async () =>
        new Response(new ReadableStream({ cancel }), {
          headers: { "content-length": String(64 * 1024 * 1024 - 2) },
        })
    );
    const operation = await client.resolve({
      model_id: ID,
      provider: "vercel",
    });
    await failure(operation.generate({ prompt: PROMPT }), "generation_failed");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("bounds streamed credential-free downloads without trusting Content-Length", async () => {
    const { client, request, download } = setup();
    falMock(request);
    const cancel = vi.fn<() => void>();
    download.mockImplementation(
      async () =>
        new Response(
          new ReadableStream({
            pull(c) {
              c.enqueue(new Uint8Array(1024 * 1024));
            },
            cancel,
          })
        )
    );
    const operation = await client.resolve({
      model_id: ID,
      provider: "fal",
      image: true,
    });
    await failure(
      operation.generate({ prompt: PROMPT, image_url: FRAME }),
      "generation_failed"
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("caps GG encoded envelopes even when there is no Content-Length", async () => {
    const { client, request } = setup({
      gg: { getAccessToken: () => "scoped-token" },
      gg_base_url: GG,
    });
    const cancel = vi.fn<() => void>();
    request.mockImplementation(
      async () =>
        new Response(
          new ReadableStream({
            pull(c) {
              c.enqueue(new Uint8Array(1024 * 1024));
            },
            cancel,
          })
        )
    );
    const operation = await client.resolve({ model_id: ID, provider: "gg" });
    await failure(operation.generate({ prompt: PROMPT }), "invalid_response");
    expect(cancel).toHaveBeenCalledOnce();
  });
});
