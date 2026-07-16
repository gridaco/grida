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
});

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

  it("throws (never silently drops) when i2i references arrive on the fal route", async () => {
    // The catalog ships no fal `references` binding, so resolveImageModel never
    // routes i2i here — but if it ever did, degrading to t2i would be worse than
    // an error. Guard fires BEFORE any fetch (no network mock needed).
    const model = new FalImageModel("sk", "fal-ai/x");
    await expect(
      model.doGenerate(
        callOptions({
          providerOptions: { grida: { references: ["https://x/y.png"] } },
        })
      )
    ).rejects.toThrow(/image-to-image references are not supported/i);
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
