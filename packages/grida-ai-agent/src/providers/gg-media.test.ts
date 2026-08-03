// GRIDA-GG: provider — see docs/wg/platform/hosted-ai.md
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImageModelV3CallOptions } from "@ai-sdk/provider";
import {
  GridaGatewayImageModel,
  GridaGatewayMusicProvider,
  GridaGatewayVideoModel,
} from "./gg-media";
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

describe("GridaGatewayMusicProvider.generate", () => {
  it("posts the closed request to hosted audio and accepts base64 bytes only", async () => {
    const request = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      expect(String(input)).toBe(
        "https://grida.test/api/v1/ai/audio/generations"
      );
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer tok"
      );
      expect(JSON.parse(String(init?.body))).toEqual({
        model_id: "google/lyria-3",
        prompt: "clockwork percussion",
        seed: 7,
      });
      return Response.json({
        model_id: "google/lyria-3",
        provider_id: "gg",
        audio: {
          base64: "SUQz",
          media_type: "audio/mpeg",
          file_name: "music.mp3",
        },
      });
    });
    const download = vi.fn<typeof globalThis.fetch>();
    const provider = new GridaGatewayMusicProvider(
      liveStore(),
      "https://grida.test",
      new ProviderHttp({ request, download })
    );

    await expect(
      provider.generate({
        model_id: "google/lyria-3",
        prompt: "clockwork percussion",
        seed: 7,
      })
    ).resolves.toMatchObject({
      provider_id: "gg",
      audio: { base64: "SUQz", file_name: "music.mp3" },
    });
    expect(download).not.toHaveBeenCalled();
  });

  it("rejects a hosted response with an unsafe filename", async () => {
    const request = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        model_id: "google/lyria-3",
        provider_id: "gg",
        audio: {
          base64: "SUQz",
          media_type: "audio/mpeg",
          file_name: "../../secret.mp3",
        },
      })
    );
    const provider = new GridaGatewayMusicProvider(
      liveStore(),
      "https://grida.test",
      new ProviderHttp({ request, download: vi.fn<typeof globalThis.fetch>() })
    );

    await expect(
      provider.generate({
        model_id: "google/lyria-3",
        prompt: "x",
      })
    ).rejects.toThrow(/malformed/);
  });

  it("rejects an oversized hosted audio Content-Length before reading JSON", async () => {
    const cancel = vi.fn<(reason?: unknown) => void>();
    const body = new ReadableStream<Uint8Array>({ pull() {}, cancel });
    const request = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(body, {
          status: 200,
          headers: { "content-length": String(100 * 1024 * 1024) },
        })
    );
    const provider = new GridaGatewayMusicProvider(
      liveStore(),
      "https://grida.test",
      new ProviderHttp({ request, download: vi.fn<typeof globalThis.fetch>() })
    );

    await expect(
      provider.generate({ model_id: "google/lyria-3", prompt: "x" })
    ).rejects.toThrow(/response was too large/);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("bounds streamed hosted audio before JSON.parse without a large fixture", async () => {
    const cancel = vi.fn<(reason?: unknown) => Promise<void>>(
      async () => undefined
    );
    const releaseLock = vi.fn<() => void>();
    const read = vi.fn<() => Promise<ReadableStreamReadResult<Uint8Array>>>(
      async () => ({
        done: false,
        // The reader limit is checked before copying the chunk, so this object
        // proves the streamed boundary without allocating its advertised size.
        value: { byteLength: 100 * 1024 * 1024 } as Uint8Array,
      })
    );
    const response = {
      status: 200,
      ok: true,
      headers: new Headers(),
      body: { getReader: () => ({ read, cancel, releaseLock }) },
    } as unknown as Response;
    const request = vi.fn<typeof globalThis.fetch>(async () => response);
    const provider = new GridaGatewayMusicProvider(
      liveStore(),
      "https://grida.test",
      new ProviderHttp({ request, download: vi.fn<typeof globalThis.fetch>() })
    );

    await expect(
      provider.generate({ model_id: "google/lyria-3", prompt: "x" })
    ).rejects.toThrow(/response was too large/);
    expect(cancel).toHaveBeenCalledOnce();
    expect(releaseLock).toHaveBeenCalledOnce();
  });
});
