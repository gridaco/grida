// GRIDA-SEC-004 — exact Tripo inputs, authenticated egress and safe downloaded results.
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { MediaOperations, ProviderHttp, TripoClient } from "./index";
import { ProviderCredentials } from "./providers";
import { catalog } from "@grida/ai-models/grida";

const taskId = "2b6f207d-7cd6-46f1-a110-efc7c27a79df";
const key = "synthetic-tripo-key";
const asset =
  "https://tripo-data.rg1.data.tripo3d.com/model.glb?signature=private";
const image: TripoClient.Image = {
  data: new Uint8Array([1, 2, 3]),
  media_type: "image/png",
};
function glb(
  document: Record<string, unknown> = { asset: { version: "2.0" } }
) {
  const bytes = new TextEncoder().encode(JSON.stringify(document));
  const padded = Math.ceil(bytes.length / 4) * 4;
  const result = new Uint8Array(20 + padded);
  const view = new DataView(result.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, result.length, true);
  view.setUint32(12, padded, true);
  view.setUint32(16, 0x4e4f534a, true);
  result.fill(32, 20);
  result.set(bytes, 20);
  return result;
}
function setup(variant: TripoClient.Variant = "text") {
  const get = vi.fn<TripoClient.Keys["get"]>(() => key);
  const request = vi.fn<typeof fetch>(async (url) =>
    Response.json({
      code: 0,
      data: String(url).endsWith("/files")
        ? { file_token: "file_synthetic" }
        : String(url).includes("/tasks/")
          ? {
              task_id: taskId,
              type: `${variant}_to_model`,
              status: "success",
              progress: 100,
              credits_consumed: 20.5,
              output: { model_url: asset },
            }
          : { task_id: taskId },
    })
  );
  const download = vi.fn<typeof fetch>(async () => new Response(glb()));
  const http = new ProviderHttp({ request, download });
  return {
    get,
    request,
    download,
    http,
    client: new TripoClient({ keys: { get }, http }),
  };
}
const selected = {
  feature: "model-generation",
  provider: "tripo",
  model_id: "tripo/h3.1",
  variant: "text",
} as const;
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Tripo model generation contract", () => {
  it("locks exact model and variant inputs while permitting dynamic model discovery", async () => {
    const { client } = setup();
    const text = await client.resolve(selected);
    expectTypeOf(text.generate)
      .parameter(0)
      .toEqualTypeOf<TripoClient.Input<"tripo/h3.1", "text">>();
    const p1 = await client.resolve({
      ...selected,
      model_id: "tripo/p1",
      variant: "image",
    });
    expectTypeOf(p1.generate)
      .parameter(0)
      .toEqualTypeOf<TripoClient.Input<"tripo/p1", "image">>();
    const dynamic = await client.resolve({
      ...selected,
      model_id: String(selected.model_id),
      variant: "multiview",
    });
    if (dynamic.variant === "multiview" && dynamic.model_id === "tripo/p2") {
      expectTypeOf(dynamic.generate)
        .parameter(0)
        .toEqualTypeOf<TripoClient.Input<"tripo/p2", "multiview">>();
    }
    const compile = () => {
      // @ts-expect-error P-series does not implement geometry quality
      void p1.generate({ image, geometry_quality: "detailed" });
      // @ts-expect-error the text variant cannot take an image
      void text.generate({ image });
      // @ts-expect-error feature is an explicit selector, not inferred from modality
      void client.resolve({
        model_id: "tripo/p1",
        provider: "tripo",
        variant: "text",
      });
    };
    expect(compile).toBeTypeOf("function");
  });
  it.each([
    ["tripo/h3.1", "v3.1-20260211"],
    ["tripo/p1", "P1-20260311"],
    ["tripo/p2", "P2-20260801"],
  ] as const)(
    "resolves %s to its exact version and submits once",
    async (model_id, binding) => {
      const { client, request, download } = setup();
      const operation = await client.resolve({ ...selected, model_id });
      expect(request).not.toHaveBeenCalled();
      expect(Object.isFrozen(operation)).toBe(true);
      const result = await operation.generate({
        prompt: "  a wooden chair  ",
        seed: 0,
        face_limit: 500,
        texture: false,
      });
      expect(JSON.parse(request.mock.calls[0]![1]!.body as string)).toEqual({
        model: binding,
        prompt: "a wooden chair",
        model_seed: 0,
        face_limit: 500,
        texture: false,
        pbr: false,
      });
      expect(
        request.mock.calls.filter(([, init]) => init?.method === "POST")
      ).toHaveLength(1);
      expect(result).toEqual({
        glb: { data: glb(), media_type: "model/gltf-binary" },
        task: { id: taskId, credits_consumed: 20.5 },
      });
      expect(download.mock.calls[0]![1]).not.toHaveProperty("headers");
      expect(
        request.mock.calls.every(
          ([url, init]) =>
            new URL(String(url)).origin === "https://openapi.tripo3d.ai" &&
            init?.redirect === "error" &&
            init.credentials === "omit"
        )
      ).toBe(true);
    }
  );
  it.each(["image", "multiview"] as const)(
    "uploads bounded %s inputs before the sole paid submission",
    async (variant) => {
      const { client, request } = setup(variant);
      const operation = await client.resolve({ ...selected, variant });
      await operation.generate(
        (variant === "image"
          ? { image }
          : { images: { front: image, back: image } }) as never
      );
      const uploads = request.mock.calls.filter(([url]) =>
        String(url).endsWith("/files")
      );
      expect(uploads).toHaveLength(variant === "image" ? 1 : 2);
      for (const [, init] of uploads) {
        expect(init?.body).toBeInstanceOf(Uint8Array);
        expect(new Headers(init?.headers).get("content-type")).toMatch(
          /^multipart\/form-data; boundary=grida-tripo-/
        );
        expect(new TextDecoder().decode(init?.body as Uint8Array)).toContain(
          'name="file"; filename="image.png"'
        );
      }
      const submission = request.mock.calls.find(([url]) =>
        String(url).includes("/generation/")
      )!;
      const body = JSON.parse(submission[1]!.body as string);
      expect(body).toMatchObject(
        variant === "image"
          ? { input: "file_synthetic" }
          : {
              inputs: [{ front: "file_synthetic" }, { back: "file_synthetic" }],
            }
      );
    }
  );
  it("rejects incompatible input before key lookup or upload", async () => {
    const { client, get, request } = setup();
    const operation = await client.resolve({
      ...selected,
      model_id: "tripo/p1",
    });
    const before = get.mock.calls.length;
    for (const value of [
      { prompt: "" },
      { prompt: "chair", geometry_quality: "standard" },
      { prompt: "chair", face_limit: 49 },
      { prompt: "chair", face_limit: 20001 },
      { prompt: "chair", texture: false, pbr: true },
      { prompt: "chair", texture: false, texture_quality: "standard" },
      { prompt: "chair", compress: "geometry" },
      { prompt: "chair", quad: true },
      { prompt: "chair", seed: NaN },
    ]) {
      await expect(operation.generate(value as never)).rejects.toMatchObject({
        code: "invalid_input",
      });
    }
    expect(get).toHaveBeenCalledTimes(before);
    expect(request).not.toHaveBeenCalled();
  });
  it("fails safely without retry after ambiguous submission", async () => {
    const { client, request } = setup();
    request.mockRejectedValueOnce(new Error(`${key} ${asset}`));
    const operation = await client.resolve(selected);
    const error = await operation
      .generate({ prompt: "chair" })
      .catch((value) => value);
    expect(JSON.stringify(error)).toBe(
      '{"code":"generation_failed","message":"generation_failed"}'
    );
    expect(error).not.toHaveProperty("cause");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each(["failed", "banned", "expired", "cancelled"])(
    "retains the accepted task ID for terminal %s without raw errors",
    async (status) => {
      const { client, request, download } = setup();
      request
        .mockResolvedValueOnce(
          Response.json({ code: 0, data: { task_id: taskId } })
        )
        .mockResolvedValueOnce(
          Response.json({
            code: 0,
            data: {
              task_id: taskId,
              type: "text_to_model",
              status,
              error_message: key,
            },
          })
        );
      const error = await (
        await client.resolve(selected)
      )
        .generate({ prompt: "chair" })
        .catch((value) => value);
      expect(error).toMatchObject({
        code: "generation_failed",
        task_id: taskId,
      });
      expect(JSON.stringify(error)).not.toContain(key);
      expect(request).toHaveBeenCalledTimes(2);
      expect(download).not.toHaveBeenCalled();
    }
  );
  it.each([401, 403])(
    "rejects HTTP %s without credentials or raw content in errors",
    async (status) => {
      const { client, request } = setup();
      request.mockResolvedValueOnce(
        Response.json({ code: 1009, message: key }, { status })
      );
      await expect(
        (await client.resolve(selected)).generate({ prompt: "chair" })
      ).rejects.toMatchObject({
        code: status === 401 ? "credential_rejected" : "access_denied",
      });
    }
  );
  it("preserves redirect evidence and rejects changed authenticated destinations", async () => {
    const { client, request, download } = setup();
    const redirected = Response.json({ code: 0, data: { task_id: taskId } });
    Object.defineProperties(redirected, {
      redirected: { value: true },
      url: { value: "https://evil.invalid" },
    });
    request.mockResolvedValueOnce(redirected);
    await expect(
      (await client.resolve(selected)).generate({ prompt: "chair" })
    ).rejects.toMatchObject({ code: "invalid_response" });
    expect(download).not.toHaveBeenCalled();
  });
  it.each([
    { asset: { version: "2.0" }, extensionsUsed: ["EXT_meshopt_compression"] },
    { asset: { version: "2.0" }, images: [{ uri: asset }] },
  ])(
    "rejects compressed or externally linked GLB resources",
    async (document) => {
      const { client, download } = setup();
      download.mockResolvedValueOnce(new Response(glb(document)));
      await expect(
        (await client.resolve(selected)).generate({ prompt: "chair" })
      ).rejects.toMatchObject({ code: "invalid_response" });
    }
  );
  it("aborts a stalled host call and never submits again", async () => {
    const { client, request } = setup();
    request.mockImplementation(() => new Promise(() => {}));
    const signal = new AbortController();
    const operation = await client.resolve(selected);
    const pending = operation.generate({
      prompt: "chair",
      signal: signal.signal,
    });
    await Promise.resolve();
    signal.abort();
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
    expect(request.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe("Tripo discovery and credentials", () => {
  it("retains bundled feature routes when a schema-1 snapshot refreshes other families", () => {
    const snapshot = catalog.snapshot.seed({ version: "updated-media" });
    const refreshed = catalog.snapshot.parse(
      JSON.parse(JSON.stringify(snapshot))
    );
    expect(refreshed).toBeDefined();
    const filter = {
      kind: "three-d",
      provider: "tripo",
      feature: "model-generation",
    } as const;
    const expected = new MediaOperations().list(filter);
    const operations = new MediaOperations({ snapshot: refreshed! });
    expect(operations.list(filter)).toEqual(expected);
    expect(expected).toHaveLength(9);
    expect(
      operations.parseInput(
        { ...selected, kind: "three-d" },
        {
          prompt: "chair",
        }
      )
    ).toMatchObject({ provider_id: "tripo", input: { prompt: "chair" } });
  });
  it("advertises three models with three explicit input variants under one feature", () => {
    const operations = new MediaOperations();
    const descriptions = operations.list({
      kind: "three-d",
      provider: "tripo",
      feature: "model-generation",
    });
    expect(descriptions).toHaveLength(9);
    expect(new Set(descriptions.map((d) => d.model_id))).toEqual(
      new Set(["tripo/h3.1", "tripo/p1", "tripo/p2"])
    );
    for (const descriptor of descriptions)
      expect(descriptor.feature).toBe("model-generation");
    const input = operations.parseInput(
      { ...selected, kind: "three-d" },
      { prompt: " chair ", face_limit: 1_500_001, geometry_quality: "detailed" }
    );
    if (input.kind !== "three-d" || input.provider_id !== "tripo")
      throw new Error("Expected Tripo input");
    expect(input.selection.feature).toBe("model-generation");
    expect(() =>
      operations.parseInput(
        { ...selected, kind: "three-d" },
        { prompt: "chair", face_limit: 1_500_001 }
      )
    ).toThrow("invalid_input");
    expect(() =>
      operations.inspect({
        kind: "three-d",
        provider: "tripo",
        model_id: "tripo/h3.1",
      } as never)
    ).toThrow("invalid_input");
  });
  it("shares JSON and native multiview rejection and copies decoded image data", () => {
    const operations = new MediaOperations();
    const selector = {
      ...selected,
      kind: "three-d",
      variant: "multiview",
    } as const;
    const inline = { data: "AQID", media_type: "image/png" };
    expect(() =>
      operations.parseInput(selector, { images: { front: inline } })
    ).toThrow("invalid_input");
    const parsed = operations.parseInput(selector, {
      images: { front: inline, left: inline },
    });
    if (
      parsed.kind !== "three-d" ||
      parsed.provider_id !== "tripo" ||
      parsed.variant !== "multiview"
    )
      throw new Error("Expected Tripo multiview input");
    expect(parsed.input.images.front.data).toEqual(image.data);
  });
  it("checks only the read-only Tripo balance endpoint and accepts decimal credits", async () => {
    const { http, request, download } = setup();
    request.mockResolvedValueOnce(
      Response.json({ code: 0, data: { balance: 0.25, frozen: 5.75 } })
    );
    expect(
      await new ProviderCredentials({ http }).check({
        provider: "tripo",
        key: ` ${key} `,
      })
    ).toEqual({ status: "accepted" });
    expect(request.mock.calls[0]![0]).toBe(
      "https://openapi.tripo3d.ai/v3/account/balance"
    );
    expect(request.mock.calls[0]![1]?.method).toBe("GET");
    expect(download).not.toHaveBeenCalled();
  });
});

describe("Tripo lifecycle bounds", () => {
  it("polls queued and running states without another paid submission", async () => {
    vi.useFakeTimers();
    const { client, request } = setup();
    request
      .mockResolvedValueOnce(
        Response.json({ code: 0, data: { task_id: taskId } })
      )
      .mockResolvedValueOnce(
        Response.json({
          code: 0,
          data: {
            task_id: taskId,
            type: "text_to_model",
            status: "queued",
            progress: 0,
          },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          code: 0,
          data: {
            task_id: taskId,
            type: "text_to_model",
            status: "running",
            progress: 60,
          },
        })
      );
    const operation = await client.resolve(selected);
    const pending = operation.generate({ prompt: "chair" });
    await vi.advanceTimersByTimeAsync(4_001);
    await expect(pending).resolves.toHaveProperty("task.id", taskId);
    expect(
      request.mock.calls.filter(([, init]) => init?.method === "POST")
    ).toHaveLength(1);
    expect(
      request.mock.calls.filter(([, init]) => init?.method === "GET")
    ).toHaveLength(3);
  });
  it("times out an uncooperative status body and retains the known task", async () => {
    vi.useFakeTimers();
    const { client, request } = setup();
    request
      .mockResolvedValueOnce(
        Response.json({ code: 0, data: { task_id: taskId } })
      )
      .mockResolvedValueOnce(
        new Response(new ReadableStream({ pull: () => new Promise(() => {}) }))
      );
    const operation = await client.resolve(selected);
    const pending = operation
      .generate({ prompt: "chair" })
      .catch((error) => error);
    await vi.advanceTimersByTimeAsync(600_001);
    expect(await pending).toMatchObject({ code: "timeout", task_id: taskId });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("times out an uncooperative credential reader without authority", async () => {
    vi.useFakeTimers();
    const { client, get, request } = setup();
    const operation = await client.resolve(selected);
    get.mockImplementationOnce(() => new Promise(() => {}));
    const pending = operation
      .generate({ prompt: "chair" })
      .catch((error) => error);
    await vi.advanceTimersByTimeAsync(600_001);
    expect(await pending).toMatchObject({ code: "timeout" });
    expect(request).not.toHaveBeenCalled();
  });
  it.each([
    "https://evil.invalid/model.glb",
    "http://cdn.tripo3d.ai/model.glb",
    "https://cdn.tripo3d.ai.evil.invalid/model.glb",
    "https://user:password@cdn.tripo3d.ai/model.glb",
    "https://cdn.tripo3d.ai:8443/model.glb",
  ])(
    "refuses the unapproved result URL %s before download",
    async (model_url) => {
      const { client, request, download } = setup();
      request
        .mockResolvedValueOnce(
          Response.json({ code: 0, data: { task_id: taskId } })
        )
        .mockResolvedValueOnce(
          Response.json({
            code: 0,
            data: {
              task_id: taskId,
              type: "text_to_model",
              status: "success",
              output: { model_url },
            },
          })
        );
      await expect(
        (await client.resolve(selected)).generate({ prompt: "chair" })
      ).rejects.toMatchObject({ code: "invalid_response" });
      expect(download).not.toHaveBeenCalled();
    }
  );
  it("bounds streamed provider JSON and declared GLB bytes before retaining them", async () => {
    const { client, request } = setup();
    request.mockResolvedValueOnce(
      new Response(new Uint8Array(1024 * 1024 + 1))
    );
    await expect(
      (await client.resolve(selected)).generate({ prompt: "chair" })
    ).rejects.toMatchObject({ code: "invalid_response" });
    expect(request).toHaveBeenCalledTimes(1);
    const second = setup();
    second.download.mockResolvedValueOnce(
      new Response(null, {
        headers: { "content-length": String(64 * 1024 * 1024 + 1) },
      })
    );
    await expect(
      (await second.client.resolve(selected)).generate({ prompt: "chair" })
    ).rejects.toMatchObject({ code: "generation_failed", task_id: taskId });
  });
  it("rejects mismatched task identity or operation type before downloading", async () => {
    for (const task of [
      { task_id: "task_different", type: "text_to_model" },
      { task_id: taskId, type: "rig" },
    ]) {
      const { client, request, download } = setup();
      request
        .mockResolvedValueOnce(
          Response.json({ code: 0, data: { task_id: taskId } })
        )
        .mockResolvedValueOnce(
          Response.json({
            code: 0,
            data: { ...task, status: "success", output: { model_url: asset } },
          })
        );
      await expect(
        (await client.resolve(selected)).generate({ prompt: "chair" })
      ).rejects.toMatchObject({ code: "invalid_response", task_id: taskId });
      expect(download).not.toHaveBeenCalled();
    }
  });
  it("reports insufficient credits and never retries rate-limited submissions", async () => {
    for (const [status, code, expected] of [
      [403, 2010, "insufficient_credits"],
      [429, 2000, "generation_failed"],
    ] as const) {
      const { client, request } = setup();
      request.mockResolvedValueOnce(
        Response.json({ code, message: key }, { status })
      );
      await expect(
        (await client.resolve(selected)).generate({ prompt: "chair" })
      ).rejects.toMatchObject({ code: expected });
      expect(request).toHaveBeenCalledTimes(1);
    }
  });
  it("snapshots all image bytes before waiting on the generation credential", async () => {
    // Multipart framing may contain the same bytes as the caller's mutation.
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    );
    const { client, get, request } = setup("image");
    const operation = await client.resolve({ ...selected, variant: "image" });
    const callerBytes = new Uint8Array([11, 22, 33]);
    let resume!: (key: string) => void;
    get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resume = resolve;
        })
    );
    const pending = operation.generate({
      image: { data: callerBytes, media_type: "image/jpeg" },
    });
    callerBytes.fill(99);
    resume(key);
    await pending;
    const upload = request.mock.calls[0]![1]!;
    const bytes = upload.body as Uint8Array;
    const form = await new Response(bytes.slice().buffer, {
      headers: upload.headers,
    }).formData();
    const file = form.get("file");
    expect(file).toBeInstanceOf(File);
    expect(new Uint8Array(await (file as File).arrayBuffer())).toEqual(
      new Uint8Array([11, 22, 33])
    );
  });
  it("refuses a missing key, oversized image and unsupported MIME without network requests", async () => {
    const { client, get, request } = setup("image");
    const operation = await client.resolve({ ...selected, variant: "image" });
    for (const input of [
      { image: { data: new Uint8Array(20_000_001), media_type: "image/png" } },
      { image: { data: image.data, media_type: "image/webp" } },
      { image: { data: new Uint8Array(), media_type: "image/png" } },
    ])
      await expect(operation.generate(input as never)).rejects.toMatchObject({
        code: "invalid_input",
      });
    expect(get).toHaveBeenCalledTimes(1);
    get.mockReturnValue(null);
    await expect(operation.generate({ image })).rejects.toMatchObject({
      code: "provider_key_required",
    });
    expect(request).not.toHaveBeenCalled();
  });
  it("rejects malformed balance schemas without exposing upstream data", async () => {
    for (const data of [
      { balance: "1", frozen: 0 },
      { balance: 1 },
      { balance: -1, frozen: 0 },
    ]) {
      const { http, request } = setup();
      request.mockResolvedValueOnce(
        Response.json({ code: 0, data, message: key })
      );
      await expect(
        new ProviderCredentials({ http }).check({ provider: "tripo", key })
      ).rejects.toMatchObject({ code: "invalid_response" });
    }
  });
});

describe("Tripo error containment", () => {
  it("contains a host error with throwing reflection traps", async () => {
    const { client, request } = setup();
    request.mockRejectedValueOnce(
      new Proxy(
        {},
        {
          getPrototypeOf() {
            throw new Error(key);
          },
        }
      )
    );
    const error = await (
      await client.resolve(selected)
    )
      .generate({ prompt: "chair" })
      .catch((value) => value);
    expect(error).toBeInstanceOf(TripoClient.Failure);
    expect(JSON.stringify(error)).toBe(
      '{"code":"generation_failed","message":"generation_failed"}'
    );
  });
  it("does not reflect a provider credential disguised as a task id", async () => {
    const { client, get, request } = setup();
    get.mockReturnValue("task_synthetic_key");
    request.mockResolvedValueOnce(
      Response.json({ code: 0, data: { task_id: "task_synthetic_key" } })
    );
    const error = await (
      await client.resolve(selected)
    )
      .generate({ prompt: "chair" })
      .catch((value) => value);
    expect(error).toMatchObject({ code: "invalid_response" });
    expect(JSON.stringify(error)).not.toContain("task_synthetic_key");
  });
});
