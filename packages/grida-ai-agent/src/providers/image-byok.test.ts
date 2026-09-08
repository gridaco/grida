import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImageModelV3CallOptions } from "@ai-sdk/provider";
import {
  FalImageModel,
  OpenRouterImageModel,
  makeImageModelFor,
} from "./image-byok";
import { ProviderHttp } from "./http";

/** Minimal full ImageModelV3CallOptions with overridable fields. */
function callOptions(
  over: Partial<ImageModelV3CallOptions> = {}
): ImageModelV3CallOptions {
  return {
    prompt: "a red apple",
    n: 1,
    size: "1024x1024",
    aspectRatio: undefined,
    seed: undefined,
    files: undefined,
    mask: undefined,
    providerOptions: {},
    ...over,
  };
}

/** Shape of the `init` arg our `fetch` mocks read. */
type MockInit = {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A complete queue roundtrip with separate authenticated and download lanes. */
function falQueue(
  status: () => "IN_PROGRESS" | "COMPLETED" = () => "COMPLETED"
) {
  const request = vi.fn<typeof fetch>(async (input, init) => {
    if (init?.method === "POST") {
      return Response.json({
        request_id: "image-25",
        status_url: "https://queue.fal.run/image-25/status",
        response_url: "https://queue.fal.run/image-25",
      });
    }
    if (String(input).endsWith("/status")) {
      return Response.json({ status: status() });
    }
    return Response.json({
      images: [
        { url: "https://v3.fal.media/image-25.png", content_type: "image/png" },
      ],
    });
  });
  const download = vi.fn<typeof fetch>(async () => new Response(PNG));
  return { request, download, http: new ProviderHttp({ request, download }) };
}

describe("FalImageModel.doGenerate", () => {
  it("submits, polls until COMPLETED, and returns image bytes", async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    let statusPolls = 0;
    const request = vi.fn<
      (input: string | URL | Request, init?: MockInit) => Promise<Response>
    >(async (input: string | URL | Request, init: MockInit = {}) => {
      const url = String(input);
      calls.push({
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(init.body) : undefined,
      });
      if (init.method === "POST") {
        return new Response(
          JSON.stringify({
            request_id: "req_1",
            status_url: "https://queue.fal.run/req_1/status",
            response_url: "https://queue.fal.run/req_1",
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/status")) {
        statusPolls++;
        // first poll in-progress, second completed → exercises the loop
        return new Response(
          JSON.stringify({
            status: statusPolls < 2 ? "IN_PROGRESS" : "COMPLETED",
          }),
          { status: 200 }
        );
      }
      if (url === "https://queue.fal.run/req_1") {
        return new Response(
          JSON.stringify({
            images: [
              {
                url: "https://v3.fal.media/i.png",
                content_type: "image/png",
              },
            ],
          }),
          { status: 200 }
        );
      }
      throw new Error(`unexpected provider request: ${url}`);
    });
    const download = vi.fn<
      (input: string | URL | Request, init?: RequestInit) => Promise<Response>
    >(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("https://v3.fal.media/i.png");
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      return new Response(PNG, { status: 200 });
    });
    const model = new FalImageModel(
      "sk-test",
      "fal-ai/flux-2-pro",
      new ProviderHttp({
        request: request as unknown as typeof globalThis.fetch,
        download: download as unknown as typeof globalThis.fetch,
      })
    );
    const result = await model.doGenerate(
      callOptions({ seed: 42, providerOptions: { fal: { guidance: 3 } } })
    );

    // submit body carries the mapped params
    const submit = calls.find((c) => c.method === "POST")!;
    expect(submit.url).toBe("https://queue.fal.run/fal-ai/flux-2-pro");
    expect(submit.body).toMatchObject({
      prompt: "a red apple",
      num_images: 1,
      image_size: { width: 1024, height: 1024 },
      seed: 42,
      guidance: 3, // providerOptions.fal passthrough
    });
    // polled more than once (loop ran)
    expect(statusPolls).toBe(2);
    expect(calls.map((call) => call.url)).toEqual([
      "https://queue.fal.run/fal-ai/flux-2-pro",
      "https://queue.fal.run/req_1/status",
      "https://queue.fal.run/req_1/status",
      "https://queue.fal.run/req_1",
    ]);
    expect(download).toHaveBeenCalledOnce();
    // bytes returned, not the url
    expect(result.images).toEqual([PNG]);
    expect(result.response.modelId).toBe("fal-ai/flux-2-pro");
  });

  it("throws when fal reports a failed status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: MockInit = {}) => {
        if (init.method === "POST") {
          return new Response(
            JSON.stringify({
              request_id: "r",
              status_url: "https://queue.fal.run/r/status",
              response_url: "https://queue.fal.run/r",
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ status: "FAILED" }), {
          status: 200,
        });
      })
    );
    const model = new FalImageModel("sk", "fal-ai/x");
    await expect(model.doGenerate(callOptions())).rejects.toThrow(/FAILED/);
  });

  it.each([
    "fal-ai/x",
    "openai/gpt-image-2.5/flare/text-to-image",
    "openai/gpt-image-2.5/unknown/edit",
  ])(
    "rejects references on a route without a supported edit schema: %s",
    async (id) => {
      // A references binding without an adapter mapping must fail before I/O,
      // rather than degrade the requested edit to text-to-image.
      const model = new FalImageModel("sk", id);
      await expect(
        model.doGenerate(
          callOptions({
            providerOptions: { grida: { references: ["https://x/y.png"] } },
          })
        )
      ).rejects.toThrow(/image-to-image references are not supported/i);
    }
  );

  it.each([
    ["openai/gpt-image-2.5/flare/text-to-image", "auto"],
    ["openai/gpt-image-2.5/sunburst/text-to-image", "auto"],
    ["fal-ai/flux-2-pro", undefined],
  ])("maps absent dimensions for %s to %s", async (id, expected) => {
    const queue = falQueue();
    await new FalImageModel("sk", id!, queue.http).doGenerate(
      callOptions({ size: undefined })
    );
    const body = JSON.parse(queue.request.mock.calls[0]![1]!.body as string);
    expect(body.image_size).toBe(expected);
  });

  it("preserves an explicit FAL image_size option over Auto", async () => {
    const queue = falQueue();
    await new FalImageModel(
      "sk",
      "openai/gpt-image-2.5/flare/text-to-image",
      queue.http
    ).doGenerate(
      callOptions({
        size: undefined,
        providerOptions: { fal: { image_size: { width: 2048, height: 1024 } } },
      })
    );
    const body = JSON.parse(queue.request.mock.calls[0]![1]!.body as string);
    expect(body.image_size).toEqual({ width: 2048, height: 1024 });
  });

  it.each(["flare", "sunburst"])(
    "submits GPT Image 2.5 %s with its extended quality and image options",
    async (variant) => {
      const queue = falQueue();
      const id = `openai/gpt-image-2.5/${variant}/text-to-image`;
      const quality = variant === "flare" ? "xhigh" : "max";
      const result = await new FalImageModel("sk", id, queue.http).doGenerate(
        callOptions({
          prompt: "A landscape with legible small text",
          size: "1536x1024",
          n: 4,
          providerOptions: {
            fal: {
              quality,
              background: "transparent",
              output_format: "webp",
              output_compression: 90,
              image_urls: ["https://untrusted.example/injected.png"],
              sync_mode: true,
            },
          },
        })
      );
      const [url, init] = queue.request.mock.calls[0]!;
      expect(String(url)).toBe(`https://queue.fal.run/${id}`);
      expect(JSON.parse(init!.body as string)).toEqual({
        prompt: "A landscape with legible small text",
        num_images: 4,
        image_size: { width: 1536, height: 1024 },
        quality,
        background: "transparent",
        output_format: "webp",
        output_compression: 90,
      });
      expect(result.images).toEqual([PNG]);
      expect(
        new Headers(queue.download.mock.calls[0]![1]?.headers).has(
          "authorization"
        )
      ).toBe(false);
    }
  );

  it.each(["flare", "sunburst"])(
    "maps curated references to GPT Image 2.5 %s edit inputs",
    async (variant) => {
      const queue = falQueue();
      const id = `openai/gpt-image-2.5/${variant}/edit`;
      const references = [
        "data:image/png;base64,Zm9v",
        "https://assets.example/reference.png",
      ];
      await new FalImageModel("sk", id, queue.http).doGenerate(
        callOptions({
          providerOptions: {
            grida: { references },
            fal: {
              image_urls: ["https://untrusted.example/injected.png"],
              mask_url: "data:image/png;base64,bWFzaw==",
              quality: "auto",
            },
          },
        })
      );
      const [url, init] = queue.request.mock.calls[0]!;
      const body = JSON.parse(init!.body as string);
      expect(String(url)).toBe(`https://queue.fal.run/${id}`);
      expect(body.image_urls).toEqual(references);
      expect(body.mask_url).toBe("data:image/png;base64,bWFzaw==");
      expect(body.quality).toBe("auto");
      expect(body).not.toHaveProperty("grida");
    }
  );

  it.each([0, 17])(
    "rejects GPT Image 2.5 edits with %i references before submission",
    async (count) => {
      const queue = falQueue();
      await expect(
        new FalImageModel(
          "sk",
          "openai/gpt-image-2.5/flare/edit",
          queue.http
        ).doGenerate(
          callOptions({
            providerOptions: {
              grida: {
                references: Array(count).fill(
                  "https://assets.example/reference.png"
                ),
              },
            },
          })
        )
      ).rejects.toThrow(/require 1–16 reference images/);
      expect(queue.request).not.toHaveBeenCalled();
    }
  );

  it("lets Sunburst complete beyond the legacy two-minute poll budget", async () => {
    vi.useFakeTimers();
    const started = Date.now();
    const queue = falQueue(() =>
      Date.now() - started < 180_000 ? "IN_PROGRESS" : "COMPLETED"
    );
    const generation = new FalImageModel(
      "sk",
      "openai/gpt-image-2.5/sunburst/text-to-image",
      queue.http
    ).doGenerate(callOptions());
    await vi.advanceTimersByTimeAsync(180_000);
    expect((await generation).images).toEqual([PNG]);
  });

  it("still bounds a GPT Image 2.5 queue to ten minutes", async () => {
    vi.useFakeTimers();
    const queue = falQueue(() => "IN_PROGRESS");
    const generation = new FalImageModel(
      "sk",
      "openai/gpt-image-2.5/sunburst/text-to-image",
      queue.http
    ).doGenerate(callOptions());
    await Promise.all([
      expect(generation).rejects.toThrow(/timed out after 600000ms/),
      vi.advanceTimersByTimeAsync(600_000),
    ]);
    expect(queue.download).not.toHaveBeenCalled();
  });

  it("propagates an aborted signal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: MockInit = {}) => {
        if (init.signal?.aborted) {
          const e = new Error("aborted");
          e.name = "AbortError";
          throw e;
        }
        return new Response("{}", { status: 200 });
      })
    );
    const ctrl = new AbortController();
    ctrl.abort();
    const model = new FalImageModel("sk", "fal-ai/x");
    await expect(
      model.doGenerate(callOptions({ abortSignal: ctrl.signal }))
    ).rejects.toThrow(/abort/i);
  });
});

describe("OpenRouterImageModel.doGenerate", () => {
  it("POSTs the unified /v1/images route and returns base64 images", async () => {
    let called: { url: string; body: unknown } | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: MockInit = {}) => {
        called = { url, body: JSON.parse(init.body ?? "{}") };
        return new Response(
          JSON.stringify({
            data: [{ b64_json: "AAAA" }],
            usage: { cost: 0.04 },
          }),
          { status: 200 }
        );
      })
    );
    const model = new OpenRouterImageModel("sk", "bytedance-seed/seedream-4.5");
    const result = await model.doGenerate(
      callOptions({ seed: 7, aspectRatio: "16:9" })
    );
    expect(called?.url).toBe("https://openrouter.ai/api/v1/images");
    expect(called?.body).toMatchObject({
      model: "bytedance-seed/seedream-4.5",
      prompt: "a red apple",
      aspect_ratio: "16:9",
      seed: 7,
    });
    // base64 strings passed straight through (the AI SDK detects media type)
    expect(result.images).toEqual(["AAAA"]);
  });

  it("throws with the upstream status + body on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("404 Not Found", { status: 404 }))
    );
    const model = new OpenRouterImageModel("sk", "openai/does-not-exist");
    await expect(model.doGenerate(callOptions())).rejects.toThrow(/404/);
  });

  it("maps grida.references → input_references for image-to-image", async () => {
    let body: Record<string, unknown> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: MockInit = {}) => {
        body = JSON.parse(init.body ?? "{}");
        return new Response(JSON.stringify({ data: [{ b64_json: "AAAA" }] }), {
          status: 200,
        });
      })
    );
    const model = new OpenRouterImageModel("sk", "bytedance-seed/seedream-4.5");
    await model.doGenerate(
      callOptions({
        providerOptions: {
          grida: {
            references: ["data:image/png;base64,Zm9v", "https://x/y.png"],
          },
        },
      })
    );
    expect(body?.input_references).toEqual([
      { type: "image_url", image_url: { url: "data:image/png;base64,Zm9v" } },
      { type: "image_url", image_url: { url: "https://x/y.png" } },
    ]);
    // the internal `grida` namespace is never forwarded raw to the provider
    expect(body).not.toHaveProperty("grida");
  });

  it("omits input_references for a plain text-to-image call", async () => {
    let body: Record<string, unknown> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: MockInit = {}) => {
        body = JSON.parse(init.body ?? "{}");
        return new Response(JSON.stringify({ data: [{ b64_json: "AAAA" }] }), {
          status: 200,
        });
      })
    );
    const model = new OpenRouterImageModel("sk", "bytedance-seed/seedream-4.5");
    await model.doGenerate(callOptions());
    expect(body).not.toHaveProperty("input_references");
  });
});

describe("makeImageModelFor", () => {
  it("returns a fal adapter for the fal provider", () => {
    const m = makeImageModelFor("fal", "sk", "fal-ai/flux-2-pro");
    expect(m).toBeInstanceOf(FalImageModel);
    expect(m.provider).toBe("fal");
    expect(m.modelId).toBe("fal-ai/flux-2-pro");
  });

  it("returns the OpenRouter unified-image adapter for openrouter", () => {
    const m = makeImageModelFor(
      "openrouter",
      "sk",
      "bytedance-seed/seedream-4.5"
    );
    expect(m).toBeInstanceOf(OpenRouterImageModel);
    expect(m.provider).toBe("openrouter");
  });

  it("builds a vercel image model without throwing", () => {
    expect(makeImageModelFor("vercel", "sk", "bfl/flux-2-pro")).toBeTruthy();
  });

  it("keeps Vercel Gateway image results on the provider request lane", async () => {
    const request = vi.fn<
      (input: string | URL | Request, init?: MockInit) => Promise<Response>
    >(async (input: string | URL | Request, init: MockInit = {}) => {
      expect(String(input)).toBe(
        "https://ai-gateway.vercel.sh/v3/ai/image-model"
      );
      expect(init.method).toBe("POST");
      return new Response(
        JSON.stringify({ images: ["iVBORw=="], warnings: [] }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    });
    const download = vi.fn<typeof globalThis.fetch>(async () => {
      throw new Error("Vercel image results must never open a download lane");
    });
    const model = makeImageModelFor(
      "vercel",
      "sk",
      "bfl/flux-2-pro",
      new ProviderHttp({
        request: request as unknown as typeof globalThis.fetch,
        download: download as unknown as typeof globalThis.fetch,
      })
    );

    const result = await model.doGenerate(callOptions());

    expect(result.images).toEqual(["iVBORw=="]);
    expect(request).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
  });
});
