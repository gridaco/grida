// GRIDA-SEC-004 — typed feature wire, real SDK validation, synthetic provider authority.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { ProviderHttp } from "@grida/ai";
import type { MediaPersistence, SecretsStore } from "@grida/daemon/server";
import { GeneratedMediaPersistence } from "./generated-media-persistence";
import { registerModelGenerationRoutes } from "./model-generation";

const TASK = "task_test123";
const URL =
  "https://tripo-data.rg1.data.tripo3d.com/model.glb?signature=private";
const IMAGE = { data: "AQID", media_type: "image/png" };
const json = Buffer.from('{"asset":{"version":"2.0"}} ');
const GLB = Buffer.alloc(20 + json.length);
GLB.write("glTF");
GLB.writeUInt32LE(2, 4);
GLB.writeUInt32LE(GLB.length, 8);
GLB.writeUInt32LE(json.length, 12);
GLB.writeUInt32LE(0x4e4f534a, 16);
json.copy(GLB, 20);
const textInput = {
  model_id: "tripo/h3.1",
  provider: "tripo",
  variant: "text",
  input: { prompt: "a teapot" },
};

function setup(
  options: {
    key?: string | null;
    result?: () => Promise<Response>;
    media?: MediaPersistence;
    submit?: Response;
  } = {}
) {
  let variant = "text";
  const get = vi.fn<() => Promise<string | null>>(async () =>
    options.key === undefined ? "synthetic-tripo-key" : options.key
  );
  const request = vi.fn<typeof fetch>(async (url, init) => {
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer synthetic-tripo-key"
    );
    if (String(url).endsWith("/files"))
      return Response.json({ code: 0, data: { file_token: "file_uploaded" } });
    if (String(url).includes("/generation/")) {
      variant = String(url).split("/generation/")[1]!.split("-to-model")[0]!;
      return (
        options.submit ?? Response.json({ code: 0, data: { task_id: TASK } })
      );
    }
    return Response.json({
      code: 0,
      data: {
        task_id: TASK,
        type: `${variant}_to_model`,
        status: "success",
        credits_consumed: 30.5,
        output: { model_url: URL, private_metadata: "never-return" },
      },
    });
  });
  const download = vi.fn<typeof fetch>(async (_url, init) => {
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    return options.result ? options.result() : new Response(GLB);
  });
  const app = new Hono();
  registerModelGenerationRoutes(app, {
    secrets: { _getKey: get } as unknown as SecretsStore,
    provider_http: new ProviderHttp({ request, download }),
    media: options.media,
  });
  return { app, get, request, download };
}
const post = (app: Hono, body: unknown) =>
  app.request("/model-generation/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

afterEach(() => vi.restoreAllMocks());

describe("model-generation host adapter", () => {
  for (const model of ["tripo/h3.1", "tripo/p1", "tripo/p2"]) {
    it.each(["text", "image", "multiview"])(
      `${model} %s uses exact feature inputs and returns portable bytes`,
      async (variant) => {
        const { app, request } = setup();
        const input =
          variant === "text"
            ? { prompt: "a teapot" }
            : variant === "image"
              ? { image: IMAGE }
              : { images: { front: IMAGE, left: IMAGE } };
        const response = await post(app, {
          model_id: model,
          provider: "tripo",
          variant,
          input,
        });
        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result).toEqual({
          feature: "model-generation",
          model_id: model,
          provider_id: "tripo",
          variant,
          glb: {
            base64: GLB.toString("base64"),
            media_type: "model/gltf-binary",
            file_name: "model.glb",
          },
          task: { id: TASK, credits_consumed: 30.5 },
        });
        expect(JSON.stringify(result)).not.toContain("private");
        expect(
          request.mock.calls.filter(([url]) =>
            String(url).includes("/generation/")
          )
        ).toHaveLength(1);
      }
    );
  }
  it.each([
    { ...textInput, provider: "fal" },
    { ...textInput, unexpected: "ignored?" },
    { ...textInput, input: { prompt: "a teapot", image: IMAGE } },
    {
      ...textInput,
      model_id: "tripo/p1",
      input: { prompt: "a teapot", geometry_quality: "detailed" },
    },
    {
      ...textInput,
      variant: "multiview",
      input: { images: { left: IMAGE, back: IMAGE } },
    },
    { ...textInput, variant: "multiview", input: { images: { front: IMAGE } } },
    {
      ...textInput,
      variant: "image",
      input: { image: { ...IMAGE, data: "invalid" } },
    },
    {
      ...textInput,
      variant: "image",
      input: { image: { ...IMAGE, media_type: "image/webp" } },
    },
  ])(
    "rejects malformed/incompatible wire input before reading a key",
    async (input) => {
      const { app, get, request } = setup();
      expect((await post(app, input)).status).toBe(400);
      expect(get).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    }
  );
  it("reports missing Tripo keys without falling back to fal or GG", async () => {
    const { app, request } = setup({ key: null });
    const response = await post(app, textInput);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "provider_key_required",
      provider_id: "tripo",
    });
    expect(request).not.toHaveBeenCalled();
  });
  it("attributes insufficient credits to Tripo without returning upstream bodies", async () => {
    const { app } = setup({
      submit: Response.json({ code: 2010, message: "private-provider-body" }),
    });
    const response = await post(app, textInput);
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({
      code: "insufficient_credits",
      provider_id: "tripo",
      error: "The Tripo account has insufficient API credits.",
    });
  });
  it("keeps accepted task identity on result failure and never resubmits", async () => {
    const { app, request } = setup({
      result: async () => {
        throw new Error("private-download-detail");
      },
    });
    const response = await post(app, textInput);
    expect(response.status).toBe(502);
    const result = await response.json();
    expect(result.task_id).toBe(TASK);
    expect(result.error).toContain(`Tripo task: ${TASK}.`);
    expect(JSON.stringify(result)).not.toContain("private");
    expect(
      request.mock.calls.filter(([url]) => String(url).includes("/generation/"))
    ).toHaveLength(1);
  });
  it("returns generated bytes and task when the optional media store rejects", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const save = vi.fn<MediaPersistence["save"]>(async () => {
      throw new Error("private-store-path-or-key");
    });
    const { app, request } = setup({
      media: { save } as unknown as MediaPersistence,
    });
    const response = await post(app, textInput);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({
      glb: { base64: GLB.toString("base64") },
      task: { id: TASK },
    });
    expect(result).not.toHaveProperty("stored_media");
    expect(JSON.stringify(result)).not.toContain("private-store-path-or-key");
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      "[grida-agent] generated media could not be saved"
    );
    expect(save).toHaveBeenCalledOnce();
    expect(
      request.mock.calls.filter(([url]) => String(url).includes("/generation/"))
    ).toHaveLength(1);
  });
  it("retains the paid task if the post-generation persistence adapter unexpectedly rejects", async () => {
    const save = vi
      .spyOn(GeneratedMediaPersistence, "save")
      .mockRejectedValueOnce(new Error("private-store-path-or-key"));
    const { app, request } = setup();
    const response = await post(app, textInput);
    expect(response.status).toBe(502);
    const failure = await response.json();
    expect(failure).toMatchObject({ code: "generation_failed", task_id: TASK });
    expect(failure.error).toContain(`Tripo task: ${TASK}.`);
    expect(JSON.stringify(failure)).not.toContain("private-store-path-or-key");
    expect(save).toHaveBeenCalledOnce();
    expect(
      request.mock.calls.filter(([url]) => String(url).includes("/generation/"))
    ).toHaveLength(1);
  });
  it("holds one generation until result encoding and persistence complete", async () => {
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { app } = setup({
      result: async () => {
        entered();
        await pending;
        return new Response(GLB);
      },
    });
    const first = post(app, textInput);
    await started;
    expect((await post(app, textInput)).status).toBe(429);
    release();
    expect((await first).status).toBe(200);
    expect((await post(app, textInput)).status).toBe(200);
  });
  it("reserves before decoding and refuses a busy request without reading its body", async () => {
    const { app, get, request } = setup();
    let firstBody!: ReadableStreamDefaultController<Uint8Array>;
    let reading!: () => void;
    const started = new Promise<void>((resolve) => {
      reading = resolve;
    });
    const bytes = new TextEncoder().encode(JSON.stringify(textInput));
    const firstInput = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          firstBody = controller;
        },
        pull() {
          reading();
          return new Promise(() => {});
        },
      },
      { highWaterMark: 0 }
    );
    const init: RequestInit & { duplex: "half" } = {
      method: "POST",
      body: firstInput,
      duplex: "half",
      headers: { "content-type": "application/json" },
    };
    const first = app.fetch(
      new Request("http://localhost/model-generation/generate", init)
    );
    await started;
    const pull = vi.fn<
      (controller: ReadableStreamDefaultController<Uint8Array>) => void
    >((controller) => {
      controller.enqueue(bytes);
      controller.close();
    });
    const secondBody = new ReadableStream<Uint8Array>(
      { pull },
      { highWaterMark: 0 }
    );
    const second = new Request("http://localhost/model-generation/generate", {
      ...init,
      body: secondBody,
    });
    try {
      const response = await app.fetch(second);
      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({
        code: "model_generation_busy",
        error: "Another model generation is in progress.",
      });
      expect(second.bodyUsed).toBe(false);
      expect(pull).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    } finally {
      firstBody.enqueue(bytes);
      firstBody.close();
      await first;
    }
    expect((await post(app, textInput)).status).toBe(200);
  });

  it("refuses oversized wire bodies before key lookup and releases admission", async () => {
    const { app, get } = setup();
    const response = await app.request("/model-generation/generate", {
      method: "POST",
      headers: { "content-length": String(49 * 1024 * 1024) },
      body: "{}",
    });
    expect(response.status).toBe(413);
    expect(get).not.toHaveBeenCalled();
    expect((await post(app, textInput)).status).toBe(200);
  });
});
