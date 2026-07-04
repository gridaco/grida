// GRIDA-GG: provider — see docs/wg/platform/hosted-ai.md
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImageModelV3CallOptions } from "@ai-sdk/provider";
import { GridaGatewayImageModel } from "./gg-media";
import { GridaGatewaySessionStore } from "./gg-session";

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
});
