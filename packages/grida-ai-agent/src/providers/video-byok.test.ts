import { afterEach, describe, expect, it, vi } from "vitest";
import type { Experimental_VideoModelV3CallOptions as VideoModelV3CallOptions } from "@ai-sdk/provider";
import {
  FalVideoModel,
  OpenRouterVideoModel,
  makeVideoModelFor,
} from "./video-byok";

function callOptions(
  over: Partial<VideoModelV3CallOptions> = {}
): VideoModelV3CallOptions {
  return {
    prompt: "a cat surfing",
    n: 1,
    aspectRatio: "16:9",
    resolution: undefined,
    duration: 5,
    fps: undefined,
    seed: undefined,
    image: undefined,
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FalVideoModel.doGenerate", () => {
  it("submits, polls until COMPLETED, and returns the video url", async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    let polls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: MockInit = {}) => {
        calls.push({
          url,
          method: init.method ?? "GET",
          body: init.body ? JSON.parse(init.body ?? "{}") : undefined,
        });
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
        if (url.endsWith("/status")) {
          polls++;
          return new Response(
            JSON.stringify({ status: polls < 2 ? "IN_PROGRESS" : "COMPLETED" }),
            { status: 200 }
          );
        }
        if (url === "https://queue.fal.run/r") {
          return new Response(
            JSON.stringify({
              video: {
                url: "https://fal.media/v.mp4",
                content_type: "video/mp4",
              },
            }),
            { status: 200 }
          );
        }
        return new Response("not found", { status: 404 });
      })
    );

    const model = new FalVideoModel("sk", "fal-ai/veo3.1/image-to-video");
    const result = await model.doGenerate(
      callOptions({ duration: 8, seed: 3 })
    );

    const submit = calls.find((c) => c.method === "POST")!;
    expect(submit.url).toBe(
      "https://queue.fal.run/fal-ai/veo3.1/image-to-video"
    );
    expect(submit.body).toMatchObject({
      prompt: "a cat surfing",
      aspect_ratio: "16:9",
      duration: 8,
      seed: 3,
    });
    expect(polls).toBe(2);
    expect(result.videos).toEqual([
      { type: "url", url: "https://fal.media/v.mp4", mediaType: "video/mp4" },
    ]);
    expect(result.response.modelId).toBe("fal-ai/veo3.1/image-to-video");
  });

  it("passes an input image as image_url for image-to-video", async () => {
    let submitBody: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: MockInit = {}) => {
        if (init.method === "POST") {
          submitBody = JSON.parse(init.body ?? "{}");
          return new Response(
            JSON.stringify({
              request_id: "r",
              status_url: "https://queue.fal.run/r/status",
              response_url: "https://queue.fal.run/r",
            }),
            { status: 200 }
          );
        }
        if (url.endsWith("/status")) {
          return new Response(JSON.stringify({ status: "COMPLETED" }), {
            status: 200,
          });
        }
        return new Response(
          JSON.stringify({ video: { url: "https://fal.media/v.mp4" } }),
          { status: 200 }
        );
      })
    );
    const model = new FalVideoModel("sk", "fal-ai/veo3.1/image-to-video");
    await model.doGenerate(
      callOptions({
        image: { type: "url", url: "https://x/frame.png" },
      })
    );
    expect(submitBody.image_url).toBe("https://x/frame.png");
  });

  it("throws when fal reports a failed status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: MockInit = {}) => {
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
        return new Response(JSON.stringify({ status: "ERROR" }), {
          status: 200,
        });
      })
    );
    const model = new FalVideoModel("sk", "fal-ai/x");
    await expect(model.doGenerate(callOptions())).rejects.toThrow(/ERROR/);
  });
});

describe("OpenRouterVideoModel.doGenerate", () => {
  it("submits, polls, downloads the clip with auth, and returns base64", async () => {
    const MP4 = new Uint8Array([0, 0, 0, 24]);
    let submit: Record<string, unknown> = {};
    let downloadAuth: string | undefined;
    let polls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: MockInit = {}) => {
        if (url === "https://openrouter.ai/api/v1/videos") {
          submit = JSON.parse(init.body ?? "{}");
          return new Response(
            JSON.stringify({
              id: "job_1",
              polling_url: "https://openrouter.ai/api/v1/videos/job_1",
            }),
            { status: 200 }
          );
        }
        if (url === "https://or.cdn/v.mp4") {
          downloadAuth = init.headers?.authorization;
          return new Response(MP4, {
            status: 200,
            headers: { "content-type": "video/mp4" },
          });
        }
        polls++;
        return new Response(
          JSON.stringify(
            polls < 2
              ? { status: "in_progress" }
              : { status: "completed", unsigned_urls: ["https://or.cdn/v.mp4"] }
          ),
          { status: 200 }
        );
      })
    );
    const model = new OpenRouterVideoModel("sk", "google/veo-3.1");
    const result = await model.doGenerate(
      callOptions({ duration: 8, aspectRatio: "16:9" })
    );
    expect(submit).toMatchObject({
      model: "google/veo-3.1",
      prompt: "a cat surfing",
      aspect_ratio: "16:9",
      duration: 8,
    });
    expect(polls).toBe(2);
    // downloaded with the key, returned as base64 bytes (not a remote url)
    expect(downloadAuth).toBe("Bearer sk");
    expect(result.videos).toEqual([
      {
        type: "base64",
        data: Buffer.from(MP4).toString("base64"),
        mediaType: "video/mp4",
      },
    ]);
  });

  it("throws when OpenRouter reports a failed job", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "https://openrouter.ai/api/v1/videos")
          return new Response(JSON.stringify({ id: "j" }), { status: 200 });
        return new Response(
          JSON.stringify({ status: "failed", error: "nope" }),
          {
            status: 200,
          }
        );
      })
    );
    const model = new OpenRouterVideoModel("sk", "google/veo-3.1");
    await expect(model.doGenerate(callOptions())).rejects.toThrow(/failed/);
  });
});

describe("makeVideoModelFor", () => {
  it("returns a fal adapter for fal", () => {
    const m = makeVideoModelFor("fal", "sk", "fal-ai/veo3.1/image-to-video");
    expect(m).toBeInstanceOf(FalVideoModel);
    expect(m.provider).toBe("fal");
  });

  it("returns the OpenRouter adapter for openrouter", () => {
    const m = makeVideoModelFor("openrouter", "sk", "google/veo-3.1");
    expect(m).toBeInstanceOf(OpenRouterVideoModel);
    expect(m.provider).toBe("openrouter");
  });

  it("builds a vercel video model without throwing", () => {
    expect(
      makeVideoModelFor("vercel", "sk", "google/veo-3.1-generate-001")
    ).toBeTruthy();
  });
});
