import { CatalogFixture } from "./catalog-fixture";
// GRIDA-SEC-004 — public exact 3D contracts, input/authority bounds and GLB projection.
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { ProviderHttp, ThreeDClient } from "./index";

const TEXT = "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d";
const IMAGE = "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d";
const TRELLIS = "fal-ai/trellis-2";
const STATUS = "https://queue.fal.run/requests/one/status";
const RESULT = "https://queue.fal.run/requests/one";
const ASSET = "https://v3.fal.media/model.glb";
const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]);
const IMAGE_BYTES = new Uint8Array([0, 1, 2]);

function setup() {
  const get = vi.fn<ThreeDClient.Keys["get"]>(() => "synthetic-fal-key");
  const request = vi.fn<typeof fetch>(async (input) => {
    if (String(input) === STATUS) return Response.json({ status: "COMPLETED" });
    if (String(input) === RESULT)
      return Response.json({ model_glb: { url: ASSET } });
    return Response.json({ status_url: STATUS, response_url: RESULT });
  });
  const download = vi.fn<typeof fetch>(async () => new Response(GLB));
  const client = new ThreeDClient({
    catalog: CatalogFixture.store(),
    keys: { get },
    http: new ProviderHttp({ request, download }),
  });
  return { client, get, request, download };
}
async function fail(pending: Promise<unknown>, code: ThreeDClient.FailureCode) {
  const error: unknown = await pending.catch((value: unknown) => value);
  expect(error).toBeInstanceOf(ThreeDClient.Failure);
  expect(error).toMatchObject({ code, message: code });
  expect(JSON.parse(JSON.stringify(error))).toEqual({ code, message: code });
  expect(error).not.toHaveProperty("cause");
  expect(String(error)).not.toMatch(/synthetic|upstream|secret/);
}

describe("ThreeDClient exact endpoint contracts", () => {
  it("infers literal inputs and narrows dynamic operations by their exact model id", async () => {
    const { client } = setup();
    const text = await client.resolve({ model_id: TEXT, provider: "fal" });
    expectTypeOf(text.generate)
      .parameter(0)
      .toEqualTypeOf<ThreeDClient.Input<typeof TEXT>>();
    const image = await client.resolve({ model_id: IMAGE, provider: "fal" });
    expectTypeOf(image.generate)
      .parameter(0)
      .toEqualTypeOf<ThreeDClient.Input<typeof IMAGE>>();
    const unknownId: string = TEXT;
    const dynamic = await client.resolve({
      model_id: unknownId,
      provider: "fal",
    });
    if (dynamic.model_id === TEXT) {
      expectTypeOf(dynamic.generate)
        .parameter(0)
        .toEqualTypeOf<{ prompt: string; signal?: AbortSignal }>();
    } else {
      expectTypeOf(dynamic.generate)
        .parameter(0)
        .toEqualTypeOf<{ image: ThreeDClient.Image; signal?: AbortSignal }>();
    }
    // Compile-only negative cases must remain invalid in the emitted contract too.
    const incompatible = () => {
      void text.generate({
        // @ts-expect-error text endpoint does not accept image input
        image: { data: IMAGE_BYTES, media_type: "image/png" },
      });
      // @ts-expect-error image endpoint does not accept prompt input
      void image.generate({ prompt: "a mesh" });
      void image.generate({
        image: { data: IMAGE_BYTES, media_type: "image/png" },
        // @ts-expect-error no speculative resolution/provider-options surface
        resolution: 1024,
      });
    };
    expect(incompatible).toBeTypeOf("function");
  });

  it.each([TEXT, IMAGE, TRELLIS] as const)(
    "executes the staged endpoint %s with only its exact input field",
    async (model_id) => {
      const { client, get, request, download } = setup();
      const operation = await client.resolve({ model_id, provider: "fal" });
      expect(Object.isFrozen(operation)).toBe(true);
      expect(operation).toMatchObject({
        model_id,
        binding_id: model_id,
        provider_id: "fal",
      });
      expect(request).not.toHaveBeenCalled();
      const result =
        operation.model_id === TEXT
          ? await operation.generate({ prompt: "  a brass robot  " })
          : await operation.generate({
              image: { data: IMAGE_BYTES, media_type: "image/png" },
            });
      const [url, init] = request.mock.calls[0]!;
      expect(url).toBe(`https://queue.fal.run/${model_id}`);
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Key synthetic-fal-key"
      );
      expect(JSON.parse(String(init?.body))).toEqual(
        model_id === TEXT
          ? { prompt: "a brass robot" }
          : {
              [model_id === IMAGE ? "input_image_url" : "image_url"]:
                "data:image/png;base64,AAEC",
            }
      );
      expect(get.mock.calls).toEqual([["fal"], ["fal"]]);
      expect(result).toEqual({
        glb: { data: GLB, media_type: "model/gltf-binary" },
      });
      expect(download).toHaveBeenCalledOnce();
      expect(String(download.mock.calls[0]![0])).toBe(ASSET);
      expect(
        new Headers(download.mock.calls[0]![1]?.headers).has("authorization")
      ).toBe(false);
    }
  );

  it("does not expose key access or mutable descriptor fields", async () => {
    const { client } = setup();
    expect(Object.keys(client)).toEqual([]);
    expect("key" in client).toBe(false);
    const operation = await client.resolve({ model_id: TEXT, provider: "fal" });
    expect(Object.keys(operation).sort()).toEqual([
      "binding_id",
      "generate",
      "model_id",
      "provider_id",
    ]);
    expect(JSON.stringify(operation)).not.toContain("synthetic");
  });

  it.each([
    "__proto__",
    "toString",
    "constructor",
    "fal-ai/custom",
    "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d/../other",
  ])("rejects unknown endpoint %s before key access", async (model_id) => {
    const { client, get, request } = setup();
    await fail(
      client.resolve({ model_id, provider: "fal" }),
      "model_unavailable"
    );
    expect(get).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    { model_id: TEXT, provider: "auto" },
    { model_id: TEXT, provider: "gg" },
    { model_id: TEXT, provider: "fal", endpoint: ASSET },
    { model_id: TEXT, provider: "fal", [Symbol("hidden")]: true },
  ])("rejects unsupported selection %j before key access", async (input) => {
    const { client, get } = setup();
    await fail(client.resolve(input as never), "invalid_input");
    expect(get).not.toHaveBeenCalled();
  });

  it.each([
    [TEXT, { prompt: "" }],
    [TEXT, { prompt: "   " }],
    [TEXT, { prompt: "x", image: undefined }],
    [TEXT, { prompt: "x", seed: 0 }],
    [TEXT, { prompt: "x".repeat(1025) }],
    [IMAGE, { prompt: "" }],
    [
      IMAGE,
      { image: { data: IMAGE_BYTES, media_type: "image/png" }, prompt: "" },
    ],
    [
      TRELLIS,
      {
        image: { data: IMAGE_BYTES, media_type: "image/png" },
        resolution: "1024",
      },
    ],
    [IMAGE, { image: { data: new Uint8Array(), media_type: "image/png" } }],
    [IMAGE, { image: { data: [0, 1], media_type: "image/png" } }],
    [IMAGE, { image: { data: IMAGE_BYTES, media_type: "image/gif" } }],
    [
      IMAGE,
      { image: { data: IMAGE_BYTES, media_type: "image/png", url: ASSET } },
    ],
    [TEXT, { prompt: "x", signal: {} }],
  ] as const)(
    "rejects incompatible input for %s before generation key access",
    async (model_id, input) => {
      const { client, get, request } = setup();
      const operation = await client.resolve({ model_id, provider: "fal" });
      get.mockClear();
      await fail(operation.generate(input as never), "invalid_input");
      expect(get).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    }
  );

  it("accepts the trimmed 1024 Unicode codepoint prompt without asserting a UTF-8 byte limit", async () => {
    const { client, request } = setup();
    const operation = await client.resolve({ model_id: TEXT, provider: "fal" });
    const prompt = "😀".repeat(1024);
    await operation.generate({ prompt: `  ${prompt}  ` });
    expect(JSON.parse(String(request.mock.calls[0]![1]?.body))).toEqual({
      prompt,
    });
  });

  it.each(["image/png", "image/jpeg", "image/webp"] as const)(
    "accepts one %s image and retains its exact bytes",
    async (media_type) => {
      const { client, request } = setup();
      const operation = await client.resolve({
        model_id: TRELLIS,
        provider: "fal",
      });
      await operation.generate({ image: { data: IMAGE_BYTES, media_type } });
      expect(JSON.parse(String(request.mock.calls[0]![1]?.body))).toEqual({
        image_url: `data:${media_type};base64,AAEC`,
      });
    }
  );

  it("copies image bytes and reads input accessors once before awaiting the current key", async () => {
    const { client, get, request } = setup();
    const operation = await client.resolve({
      model_id: IMAGE,
      provider: "fal",
    });
    let release!: (value: string) => void;
    get.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        })
    );
    const bytes = new Uint8Array(IMAGE_BYTES);
    const data = vi.fn<() => Uint8Array>(() => bytes);
    const image = vi.fn<() => ThreeDClient.Image>(() => ({
      get data() {
        return data();
      },
      media_type: "image/png" as const,
    }));
    const pending = operation.generate({
      get image() {
        return image();
      },
    });
    bytes.fill(255);
    release("rotated-key");
    await pending;
    expect(image).toHaveBeenCalledOnce();
    expect(data).toHaveBeenCalledOnce();
    expect(JSON.parse(String(request.mock.calls[0]![1]?.body))).toEqual({
      input_image_url: "data:image/png;base64,AAEC",
    });
  });

  it("accepts the 8 MiB image ceiling and rejects one extra byte before key lookup", async () => {
    const { client, get, request } = setup();
    const operation = await client.resolve({
      model_id: IMAGE,
      provider: "fal",
    });
    await operation.generate({
      image: { data: new Uint8Array(8 * 1024 * 1024), media_type: "image/png" },
    });
    expect(request.mock.calls[0]![1]?.body).toContain("data:image/png;base64,");
    get.mockClear();
    request.mockClear();
    await fail(
      operation.generate({
        image: {
          data: new Uint8Array(8 * 1024 * 1024 + 1),
          media_type: "image/png",
        },
      }),
      "invalid_input"
    );
    expect(get).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
});

describe("ThreeDClient provider responses", () => {
  it.each([
    "https://fal.media/queue",
    "https://sub.queue.fal.run/job",
    "https://queue.fal.run:444/job",
    "https://user:secret@queue.fal.run/job",
    "https://queue.fal.run/job#fragment",
    "http://queue.fal.run/job",
    "https://queue.fal.run.attacker.example/job",
  ])(
    "refuses key-bearing queue URL %s before the next request",
    async (url) => {
      const { client, request, download } = setup();
      request.mockResolvedValueOnce(
        Response.json({ status_url: url, response_url: RESULT })
      );
      const operation = await client.resolve({
        model_id: TEXT,
        provider: "fal",
      });
      await fail(operation.generate({ prompt: "mesh" }), "invalid_response");
      expect(request).toHaveBeenCalledOnce();
      expect(download).not.toHaveBeenCalled();
    }
  );

  it.each([
    "https://attacker.example/model.glb",
    "https://fal.media.attacker.example/file",
    "https://user:secret@v3.fal.media/file",
    "https://v3.fal.media:444/file",
    "http://v3.fal.media/file",
    "data:model/gltf-binary;base64,AAAA",
  ])("refuses asset URL %s before download", async (url) => {
    const { client, request, download } = setup();
    request
      .mockResolvedValueOnce(
        Response.json({ status_url: STATUS, response_url: RESULT })
      )
      .mockResolvedValueOnce(Response.json({ status: "COMPLETED" }))
      .mockResolvedValueOnce(Response.json({ model_glb: { url } }));
    const operation = await client.resolve({ model_id: TEXT, provider: "fal" });
    await fail(operation.generate({ prompt: "mesh" }), "invalid_response");
    expect(download).not.toHaveBeenCalled();
  });

  it("uses the primary GLB, discarding provider filenames, MIME claims and optional outputs", async () => {
    const { client, request, download } = setup();
    request
      .mockResolvedValueOnce(
        Response.json({ status_url: STATUS, response_url: RESULT })
      )
      .mockResolvedValueOnce(Response.json({ status: "COMPLETED" }))
      .mockResolvedValueOnce(
        Response.json({
          model_glb: {
            url: ASSET,
            content_type: "text/html",
            file_name: "../../secret",
            file_size: 12,
          },
          model_urls: {
            glb: { url: "https://attacker.example" },
            obj: { url: "https://attacker.example" },
          },
          metadata: "synthetic-upstream-secret",
        })
      );
    const operation = await client.resolve({ model_id: TEXT, provider: "fal" });
    expect(await operation.generate({ prompt: "mesh" })).toEqual({
      glb: { data: GLB, media_type: "model/gltf-binary" },
    });
    expect(download).toHaveBeenCalledOnce();
  });

  it("preserves the existing model_urls.glb fallback without downloading other formats", async () => {
    const { client, request } = setup();
    request
      .mockResolvedValueOnce(
        Response.json({ status_url: STATUS, response_url: RESULT })
      )
      .mockResolvedValueOnce(Response.json({ status: "COMPLETED" }))
      .mockResolvedValueOnce(
        Response.json({ model_urls: { glb: { url: ASSET } } })
      );
    const operation = await client.resolve({ model_id: TEXT, provider: "fal" });
    expect((await operation.generate({ prompt: "mesh" })).glb.data).toEqual(
      GLB
    );
  });

  it.each([-1, 1.5, "12", 64 * 1024 * 1024 + 1])(
    "rejects invalid or oversized declared GLB size %s before download",
    async (file_size) => {
      const { client, request, download } = setup();
      request
        .mockResolvedValueOnce(
          Response.json({ status_url: STATUS, response_url: RESULT })
        )
        .mockResolvedValueOnce(Response.json({ status: "COMPLETED" }))
        .mockResolvedValueOnce(
          Response.json({ model_glb: { url: ASSET, file_size } })
        );
      const operation = await client.resolve({
        model_id: TEXT,
        provider: "fal",
      });
      await fail(operation.generate({ prompt: "mesh" }), "invalid_response");
      expect(download).not.toHaveBeenCalled();
    }
  );

  it.each([
    new Uint8Array(11),
    new Uint8Array(12),
    new Uint8Array([...GLB.slice(0, 4), 1, ...GLB.slice(5)]),
    new Uint8Array([...GLB.slice(0, 8), 13, ...GLB.slice(9)]),
  ])("rejects invalid GLB magic, version or total length", async (bytes) => {
    const { client, download } = setup();
    download.mockResolvedValueOnce(new Response(bytes));
    const operation = await client.resolve({ model_id: TEXT, provider: "fal" });
    await fail(operation.generate({ prompt: "mesh" }), "invalid_response");
    expect(download).toHaveBeenCalledOnce();
  });

  it.each(["declared", "streamed"] as const)(
    "bounds the %s GLB download to 64 MiB and cancels its reader",
    async (mode) => {
      const { client, download } = setup();
      const cancel = vi.fn<() => void>();
      const stream = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            controller.enqueue(
              mode === "streamed" ? new Uint8Array(64 * 1024 * 1024 + 1) : GLB
            );
          },
          cancel,
        },
        { highWaterMark: 0 }
      );
      download.mockResolvedValueOnce(
        new Response(stream, {
          headers:
            mode === "declared"
              ? { "content-length": String(64 * 1024 * 1024 + 1) }
              : {},
        })
      );
      const operation = await client.resolve({
        model_id: TEXT,
        provider: "fal",
      });
      await fail(operation.generate({ prompt: "mesh" }), "generation_failed");
      expect(download).toHaveBeenCalledOnce();
      expect(cancel).toHaveBeenCalledOnce();
      expect(stream.locked).toBe(false);
    }
  );

  it.each([
    { status: "COMPLETED", error: "synthetic-upstream-secret" },
    { status: "COMPLETED", error_type: "internal_error" },
    { status: "FAILED" },
  ])(
    "does not mistake a failed completion for an asset result",
    async (status) => {
      const { client, request, download } = setup();
      request
        .mockResolvedValueOnce(
          Response.json({ status_url: STATUS, response_url: RESULT })
        )
        .mockResolvedValueOnce(Response.json(status));
      const operation = await client.resolve({
        model_id: TEXT,
        provider: "fal",
      });
      await fail(operation.generate({ prompt: "mesh" }), "generation_failed");
      expect(request).toHaveBeenCalledTimes(2);
      expect(download).not.toHaveBeenCalled();
    }
  );

  it.each([
    new Response("{invalid"),
    Response.json({}),
    Response.json({ status_url: STATUS }),
    new Response(" ".repeat(1024 * 1024 + 1)),
  ])(
    "rejects malformed or oversized submit JSON without polling",
    async (response) => {
      const { client, request } = setup();
      request.mockResolvedValueOnce(response);
      const operation = await client.resolve({
        model_id: TEXT,
        provider: "fal",
      });
      await fail(operation.generate({ prompt: "mesh" }), "invalid_response");
      expect(request).toHaveBeenCalledOnce();
    }
  );
});
