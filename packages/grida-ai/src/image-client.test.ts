// GRIDA-SEC-004 / GRIDA-SEC-006 — public image authority, output, and no-retry contracts.
// GRIDA-GG: token — synthetic scoped credentials only; no services or provider calls.
import { describe, expect, it, vi } from "vitest";
import { catalog as models } from "@grida/ai-models/grida";
import { ImageClient, ProviderHttp, GridaGatewaySessionStore } from "./index";

const view = models.snapshot.view();
// These wire assertions target GPT Image 2's controls, independent of recommendations.
const card = view.image.models["openai/gpt-image-2"]!;
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const BASE64 = "iVBORw0KGgo=";
const PROMPT = "synthetic-private-prompt";
const KEY = "synthetic-private-key";
const TOKEN = "synthetic-scoped-gg-token";

function setup(overrides: Partial<ImageClient.Options> = {}) {
  const request = vi.fn<typeof fetch>(async () =>
    Response.json({ data: [{ b64_json: BASE64 }] })
  );
  const download = vi.fn<typeof fetch>(async () => new Response(PNG));
  const get = vi.fn<ImageClient.Keys["get"]>(() => KEY);
  const client = new ImageClient({
    keys: { get },
    http: new ProviderHttp({ request, download }),
    ...overrides,
  });
  return { client, request, download, get };
}

async function failure(
  promise: Promise<unknown>,
  code: ImageClient.FailureCode
) {
  const error: unknown = await promise.catch((value: unknown) => value);
  expect(error).toBeInstanceOf(ImageClient.Failure);
  expect(error).toMatchObject({ code, message: code });
  expect(JSON.parse(JSON.stringify(error))).toEqual({ code, message: code });
  expect(String(error)).not.toMatch(/synthetic-|upstream-private/);
  expect(error).not.toHaveProperty("cause");
}

describe("ImageClient public operations", () => {
  it("resolves before asset reads, maps capped references/options, and returns only bytes", async () => {
    const { client, request, download } = setup();
    const operation = await client.resolve({
      model_id: card.id,
      provider: "openrouter",
      references: true,
    });
    const binding = view.image.binding(card, "openrouter")!;
    expect(operation).toMatchObject({
      model_id: card.id,
      provider_id: "openrouter",
      binding_id: binding.references!.id,
      references_max: binding.references!.max,
    });
    expect(Object.isFrozen(operation)).toBe(true);
    expect(Object.keys(client)).toEqual([]);
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(client))).toEqual([
      "constructor",
      "resolve",
    ]);
    expect("key" in client).toBe(false);
    expect("hosted" in client).toBe(false);
    expect(JSON.stringify(operation)).not.toContain(KEY);
    expect(request).not.toHaveBeenCalled();
    const result = await operation.generate({
      prompt: PROMPT,
      references: ["data:image/png;base64," + BASE64],
      size: "128x256",
      aspect_ratio: "1:2",
      seed: 0,
      quality: "medium",
    });
    expect(result).toEqual({
      images: [{ data: PNG, media_type: "image/png" }],
    });
    expect(result.images[0].data.constructor).toBe(Uint8Array);
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/images");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer " + KEY
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      model: binding.references!.id,
      prompt: PROMPT,
      n: 1,
      size: "128x256",
      aspect_ratio: "1:2",
      seed: 0,
      quality: "medium",
      input_references: [
        {
          type: "image_url",
          image_url: { url: "data:image/png;base64," + BASE64 },
        },
      ],
    });
    expect(download).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(
      /synthetic-|stored_media|workspace/
    );
  });

  it("uses Vercel's declared image protocol with the supplied key", async () => {
    const { client, request, download } = setup();
    request.mockImplementation(async () => Response.json({ images: [BASE64] }));
    const operation = await client.resolve({
      model_id: card.id,
      provider: "vercel",
    });
    expect(
      await operation.generate({
        prompt: PROMPT,
        quality: "low",
        size: "256x256",
      })
    ).toEqual({ images: [{ data: PNG, media_type: "image/png" }] });
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0];
    expect(String(url)).toMatch(
      /^https:\/\/ai-gateway\.vercel\.sh\/v3\/ai\/image-model$/
    );
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer " + KEY
    );
    expect(new Headers(init?.headers).get("ai-model-id")).toBe(
      view.image.binding(card, "vercel")!.id
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({
      size: "256x256",
      providerOptions: { openai: { quality: "low" } },
    });
    expect(download).not.toHaveBeenCalled();
  });

  it("fal submits once, polls, then downloads through the credential-free lane", async () => {
    const { client, request, download } = setup();
    request.mockImplementation(async (url, init) => {
      if (init?.method === "POST")
        return Response.json({
          request_id: "job",
          status_url: "https://queue.fal.run/job/status",
          response_url: "https://queue.fal.run/job/result",
        });
      if (String(url).endsWith("/status"))
        return Response.json({ status: "COMPLETED" });
      return Response.json({
        images: [{ url: "https://v3.fal.media/image.png" }],
      });
    });
    const operation = await client.resolve({
      model_id: card.id,
      provider: "fal",
    });
    expect(
      await operation.generate({
        prompt: PROMPT,
        size: "128x256",
        seed: 0,
        quality: "high",
      })
    ).toEqual({ images: [{ data: PNG, media_type: "image/png" }] });
    expect(
      request.mock.calls.filter(([, init]) => init?.method === "POST")
    ).toHaveLength(1);
    expect(
      request.mock.calls.every(
        ([, init]) =>
          new Headers(init?.headers).get("authorization") === "Key " + KEY
      )
    ).toBe(true);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({
      image_size: { width: 128, height: 256 },
      seed: 0,
      quality: "high",
    });
    expect(download).toHaveBeenCalledOnce();
    expect(
      new Headers(download.mock.calls[0][1]?.headers).has("authorization")
    ).toBe(false);
  });

  it("suppresses arbitrary provider warnings before the AI SDK logger", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { client, request } = setup();
      request.mockImplementation(async () =>
        Response.json({
          images: [BASE64],
          warnings: [{ type: "other", message: KEY + PROMPT }],
        })
      );
      const operation = await client.resolve({
        model_id: card.id,
        provider: "vercel",
      });
      expect(await operation.generate({ prompt: PROMPT })).toEqual({
        images: [{ data: PNG, media_type: "image/png" }],
      });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("GG uses its fixed route and rereads a replacement token at submission", async () => {
    const gg = new GridaGatewaySessionStore();
    gg.set({ access_token: TOKEN, expires_at: Date.now() + 900_000 });
    const { client, request, get, download } = setup({
      gg,
      gg_base_url: "https://grida.example",
    });
    request.mockImplementation(async () =>
      Response.json({
        images: [{ base64: BASE64, stored_media: { access_token: TOKEN } }],
      })
    );
    const operation = await client.resolve({
      model_id: card.id,
      provider: "gg",
    });
    gg.set({ access_token: TOKEN + "-new", expires_at: Date.now() + 900_000 });
    expect(
      await operation.generate({
        prompt: PROMPT,
        size: "128x256",
        aspect_ratio: "1:2",
        seed: 0,
        quality: "medium",
      })
    ).toEqual({ images: [{ data: PNG, media_type: "image/png" }] });
    expect(get).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    expect(request.mock.calls[0][0]).toBe(
      "https://grida.example/api/v1/ai/images/generations"
    );
    expect(
      new Headers(request.mock.calls[0][1]?.headers).get("authorization")
    ).toBe("Bearer " + TOKEN + "-new");
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({
      model_id: card.id,
      prompt: PROMPT,
      n: 1,
      width: 128,
      height: 256,
      aspect_ratio: "1:2",
      seed: 0,
      quality: "medium",
    });
  });

  it("makes legacy automatic precedence explicit and never changes the resolved provider", async () => {
    const { client, get, request } = setup();
    const operation = await client.resolve({
      model_id: card.id,
      provider: "auto",
    });
    expect(operation.provider_id).toBe("openrouter");
    get.mockImplementation((provider) => (provider === "vercel" ? KEY : null));
    await failure(
      operation.generate({ prompt: PROMPT }),
      "provider_unavailable"
    );
    expect(request).not.toHaveBeenCalled();
    expect(get.mock.calls.map(([provider]) => provider)).toEqual([
      "openrouter",
      "openrouter",
    ]);
  });

  it("only checks an explicitly selected provider and rejects unknown or unsupported routes before network", async () => {
    const { client, request, get } = setup();
    await failure(
      client.resolve({
        model_id: "unknown-private-id",
        provider: "openrouter",
      }),
      "model_unavailable"
    );
    await failure(
      client.resolve({ model_id: card.id, provider: "fal", references: true }),
      "references_unsupported"
    );
    await failure(
      client.resolve({ model_id: card.id, provider: "gg", references: true }),
      "references_unsupported"
    );
    expect(get).not.toHaveBeenCalled();
    get.mockReturnValue(null);
    await failure(
      client.resolve({ model_id: card.id, provider: "fal" }),
      "provider_unavailable"
    );
    expect(get.mock.calls).toEqual([["fal"]]);
    expect(request).not.toHaveBeenCalled();
  });

  it("missing, expired, or cleared GG cannot submit or fall back", async () => {
    const gg = new GridaGatewaySessionStore();
    const { client, request, get } = setup({
      gg,
      gg_base_url: "https://grida.example",
    });
    await failure(
      client.resolve({ model_id: card.id, provider: "gg" }),
      "gg_token_expired"
    );
    gg.set({ access_token: TOKEN, expires_at: Date.now() + 1000 });
    await failure(
      client.resolve({ model_id: card.id, provider: "gg" }),
      "gg_token_expired"
    );
    gg.set({ access_token: TOKEN, expires_at: Date.now() + 900_000 });
    const operation = await client.resolve({
      model_id: card.id,
      provider: "gg",
    });
    gg.clear();
    await failure(operation.generate({ prompt: PROMPT }), "gg_token_expired");
    expect(get).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(gg.status()).toEqual({ active: false });
    expect(JSON.stringify(gg)).toBe("{}");
  });

  it.each(["openrouter", "vercel", "fal", "gg"] as const)(
    "does not retry a failed %s submission and redacts its error",
    async (provider) => {
      const gg = new GridaGatewaySessionStore();
      gg.set({ access_token: TOKEN, expires_at: Date.now() + 900_000 });
      const { client, request } = setup({
        gg,
        gg_base_url: "https://grida.example",
      });
      request.mockImplementation(
        async () =>
          new Response("upstream-private " + KEY + PROMPT + TOKEN, {
            status: 503,
          })
      );
      const operation = await client.resolve({ model_id: card.id, provider });
      await failure(
        operation.generate({ prompt: PROMPT }),
        "generation_failed"
      );
      expect(request).toHaveBeenCalledOnce();
    }
  );

  it.each([
    [401, "gg_token_expired"],
    [402, "insufficient_credits"],
  ] as const)(
    "retains actionable GG %i errors without the response body",
    async (status, code) => {
      const gg = new GridaGatewaySessionStore();
      gg.set({ access_token: TOKEN, expires_at: Date.now() + 900_000 });
      const { client, request } = setup({
        gg,
        gg_base_url: "https://grida.example",
      });
      request.mockImplementation(
        async () => new Response(PROMPT + TOKEN, { status })
      );
      const operation = await client.resolve({
        model_id: card.id,
        provider: "gg",
      });
      await failure(operation.generate({ prompt: PROMPT }), code);
      expect(request).toHaveBeenCalledOnce();
    }
  );

  it("respects the provider's batch size for an explicitly requested larger count", async () => {
    const { client, request } = setup();
    request.mockImplementation(async (_, init) =>
      Response.json({
        data: Array.from({ length: JSON.parse(String(init?.body)).n }, () => ({
          b64_json: BASE64,
        })),
      })
    );
    const operation = await client.resolve({
      model_id: card.id,
      provider: "openrouter",
    });
    expect(
      (await operation.generate({ prompt: PROMPT, n: 5 })).images
    ).toHaveLength(5);
    expect(
      request.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).n)
    ).toEqual([4, 1]);
  });

  it("validates references and options before looking up another credential or submitting", async () => {
    const { client, request, get } = setup();
    const plain = await client.resolve({
      model_id: card.id,
      provider: "openrouter",
    });
    const edited = await client.resolve({
      model_id: card.id,
      provider: "openrouter",
      references: true,
    });
    const calls = get.mock.calls.length;
    for (const input of [
      { prompt: "" },
      { prompt: PROMPT, n: 0 },
      { prompt: PROMPT, n: 1.5 },
      { prompt: PROMPT, size: "0x256" },
      { prompt: PROMPT, extra: KEY },
      { prompt: PROMPT, references: ["https://public.example/ref.png"] },
    ]) {
      await failure(
        plain.generate(input as ImageClient.Input),
        "invalid_input"
      );
    }
    await failure(edited.generate({ prompt: PROMPT }), "invalid_input");
    await failure(
      edited.generate({ prompt: PROMPT, references: ["file:///private/key"] }),
      "invalid_input"
    );
    await failure(
      edited.generate({
        prompt: PROMPT,
        references: Array.from(
          { length: edited.references_max! + 1 },
          () => "https://public.example/ref.png"
        ),
      }),
      "invalid_input"
    );
    expect(get).toHaveBeenCalledTimes(calls);
    expect(request).not.toHaveBeenCalled();
  });

  it("snapshots getter inputs and bound capabilities; thrown getters remain safe", async () => {
    const { client, request } = setup();
    let reads = 0;
    const operation = await client.resolve({
      get model_id() {
        reads++;
        return card.id;
      },
      provider: "openrouter",
    });
    expect(reads).toBe(1);
    let promptReads = 0;
    await operation.generate({
      get prompt() {
        promptReads++;
        return PROMPT;
      },
    });
    expect(promptReads).toBe(1);
    await failure(
      operation.generate({
        get prompt(): string {
          throw new Error(KEY);
        },
      }),
      "invalid_input"
    );
    await failure(
      client.resolve({
        get model_id(): string {
          throw new Error(KEY);
        },
        provider: "openrouter",
      }),
      "invalid_input"
    );
    expect(request).toHaveBeenCalledOnce();
  });

  it("contains arbitrary credential/transport failures and malformed provider output", async () => {
    const { client, request, get } = setup();
    get.mockImplementationOnce(() => {
      throw new Error(KEY);
    });
    await failure(
      client.resolve({ model_id: card.id, provider: "openrouter" }),
      "generation_failed"
    );
    const operation = await client.resolve({
      model_id: card.id,
      provider: "openrouter",
    });
    request.mockImplementationOnce(async () => {
      throw new Error(KEY);
    });
    await failure(operation.generate({ prompt: PROMPT }), "generation_failed");
    request.mockImplementationOnce(async () => Response.json({ data: [] }));
    await failure(operation.generate({ prompt: PROMPT }), "generation_failed");
    expect(
      JSON.stringify(new ImageClient.Failure(KEY as ImageClient.FailureCode))
    ).not.toContain(KEY);
  });

  it("aborts before submission and fences a result when the host ignores cancellation", async () => {
    const { client, request } = setup();
    const operation = await client.resolve({
      model_id: card.id,
      provider: "openrouter",
    });
    const aborted = AbortSignal.abort();
    await failure(
      operation.generate({ prompt: PROMPT, signal: aborted }),
      "aborted"
    );
    expect(request).not.toHaveBeenCalled();
    const controller = new AbortController();
    request.mockImplementation(async () => {
      controller.abort();
      return Response.json({ data: [{ b64_json: BASE64 }] });
    });
    await failure(
      operation.generate({ prompt: PROMPT, signal: controller.signal }),
      "aborted"
    );
    expect(request).toHaveBeenCalledOnce();
  });

  it("contains a throwing host signal getter even on the error path", async () => {
    const { client, request } = setup();
    const operation = await client.resolve({
      model_id: card.id,
      provider: "openrouter",
    });
    const signal = Object.create(AbortSignal.prototype) as AbortSignal;
    Object.defineProperty(signal, "aborted", {
      get() {
        throw new Error(KEY + PROMPT);
      },
    });
    await failure(
      operation.generate({ prompt: PROMPT, signal }),
      "generation_failed"
    );
    expect(request).not.toHaveBeenCalled();
  });
});

describe("ImageClient native background admission", () => {
  it("captures resolution intent and refuses later weakening before another key read", async () => {
    const { client, request, get } = setup();
    const operation = await client.resolve({
      model_id: "openai/gpt-image-2.5-flare",
      provider: "fal",
      background: "transparent",
    });
    const reads = get.mock.calls.length;
    for (const background of ["auto", "opaque"] as const) {
      await failure(
        operation.generate({ prompt: "sticker", background }),
        "invalid_input"
      );
    }
    expect(request).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(reads);
  });

  it("does not infer native background support from a vendor or a connected key", async () => {
    const { client, request, get } = setup();
    await failure(
      client.resolve({
        model_id: "openai/gpt-image-2.5-flare",
        provider: "openrouter",
        background: "transparent",
      }),
      "provider_unavailable"
    );
    expect(get).not.toHaveBeenCalled();
    const operation = await client.resolve({
      model_id: "openai/gpt-image-2.5-flare",
      provider: "openrouter",
    });
    get.mockClear();
    await failure(
      operation.generate({ prompt: "sticker", background: "transparent" }),
      "invalid_input"
    );
    expect(get).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it.each(["fal", "openrouter"] as const)(
    "refuses unsupported GPT Image 2.5 controls on %s before generation key lookup",
    async (provider) => {
      const { client, request, get } = setup();
      const operation = await client.resolve({
        model_id: "openai/gpt-image-2.5-sunburst",
        provider,
      });
      get.mockClear();
      await failure(
        operation.generate({ prompt: "sticker", seed: 0 }),
        "invalid_input"
      );
      if (provider === "fal")
        await failure(
          operation.generate({ prompt: "sticker", aspect_ratio: "1:1" }),
          "invalid_input"
        );
      expect(get).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    }
  );
});
