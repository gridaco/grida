// GRIDA-GG: provider — see docs/wg/platform/hosted-ai.md
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImageModelV3CallOptions } from "@ai-sdk/provider";
import { GridaGatewayImageModel, GridaGatewayVideoModel } from "./gg-media";
import { GridaGatewaySessionStore } from "./gg-session";
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

function liveStore(): GridaGatewaySessionStore {
  const store = new GridaGatewaySessionStore();
  store.set({ access_token: "tok", expires_at: Date.now() + 900_000 });
  return store;
}

function stubFetch(): () => Record<string, unknown> | undefined {
  let body: Record<string, unknown> | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body?: string }) => {
      body = JSON.parse(init.body ?? "{}");
      return new Response(
        JSON.stringify({
          model_id: "m",
          provider_id: "gg",
          images: [{ base64: "Zm9v", media_type: "image/png" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    })
  );
  return () => body;
}

afterEach(() => vi.unstubAllGlobals());

describe("GridaGatewayImageModel.doGenerate", () => {
  it("forwards providerOptions.gg.quality into the hosted request body", async () => {
    const readBody = stubFetch();
    const model = new GridaGatewayImageModel(
      liveStore(),
      "https://grida.test",
      "openai/gpt-image-2"
    );
    await model.doGenerate(
      callOptions({ providerOptions: { gg: { quality: "high" } } })
    );
    const body = readBody();
    expect(body?.quality).toBe("high");
    expect(body?.model_id).toBe("openai/gpt-image-2");
  });

  it("omits quality when none is set", async () => {
    const readBody = stubFetch();
    const model = new GridaGatewayImageModel(
      liveStore(),
      "https://grida.test",
      "m"
    );
    await model.doGenerate(callOptions());
    expect(readBody()?.quality).toBeUndefined();
  });

  it("hosted image and video requests use request, never download", async () => {
    const urls: string[] = [];
    const request = vi.fn<
      (input: string | URL | Request, init?: RequestInit) => Promise<Response>
    >(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      urls.push(url);
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer tok"
      );
      if (url.endsWith("/images/generations")) {
        return new Response(
          JSON.stringify({
            model_id: "image-model",
            provider_id: "gg",
            images: [{ base64: "Zm9v", media_type: "image/png" }],
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          model_id: "video-model",
          provider_id: "gg",
          videos: [{ base64: "YmFy", media_type: "video/mp4" }],
        }),
        { status: 200 }
      );
    });
    const download = vi.fn<typeof globalThis.fetch>();
    const providerHttp = new ProviderHttp({
      request: request as unknown as typeof globalThis.fetch,
      download,
    });
    await new GridaGatewayImageModel(
      liveStore(),
      "https://grida.test",
      "image-model",
      providerHttp
    ).doGenerate(callOptions());
    await new GridaGatewayVideoModel(
      liveStore(),
      "https://grida.test",
      "video-model",
      providerHttp
    ).doGenerate({
      prompt: "a wave",
      n: 1,
      aspectRatio: undefined,
      resolution: undefined,
      duration: undefined,
      fps: undefined,
      seed: undefined,
      image: undefined,
      providerOptions: {},
    });

    expect(urls).toEqual([
      "https://grida.test/api/v1/ai/images/generations",
      "https://grida.test/api/v1/ai/videos/generations",
    ]);
    expect(download).not.toHaveBeenCalled();
  });
});
