// GRIDA-SEC-004 — real public 3D operations with synthetic host capabilities.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { ProviderHttp } from "@grida/ai";
import type { MediaItem } from "@grida/daemon";
import type { MediaPersistence, SecretsStore } from "@grida/daemon/server";
import { registerThreeDRoutes } from "./three-d";

const TEXT = "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d";
const HUNYUAN_IMAGE = "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d";
const TRELLIS = "fal-ai/trellis-2";
const KEY = "synthetic-fal-key";
const STATUS_URL = "https://queue.fal.run/requests/one/status";
const RESULT_URL = "https://queue.fal.run/requests/one";
const GLB_URL = "https://v3.fal.media/model.glb";
const GLB_BYTES = new Uint8Array([
  0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0,
]);
const GLB = {
  base64: Buffer.from(GLB_BYTES).toString("base64"),
  media_type: "model/gltf-binary",
  file_name: "model.glb",
};
const IMAGE = { base64: "AQID", media_type: "image/png" };
const INPUT = { model_id: TEXT, prompt: "a brass robot" };
const STORED: MediaItem = {
  id: "7ccb8e68-a201-40d9-a793-44de9e6c6fc6",
  file_name: "model.glb",
  media_type: "model/gltf-binary",
  byte_size: GLB_BYTES.byteLength,
  created_at: 1,
};
type ReadKey = (provider: string) => Promise<string | null>;

const queueRequest: typeof globalThis.fetch = async (input, init) => {
  if (init?.method === "POST") {
    return Response.json({
      request_id: "one",
      status_url: STATUS_URL,
      response_url: RESULT_URL,
    });
  }
  if (String(input) === STATUS_URL) {
    return Response.json({ status: "COMPLETED" });
  }
  if (String(input) === RESULT_URL) {
    return Response.json({
      model_glb: {
        url: GLB_URL,
        file_size: GLB_BYTES.byteLength,
        file_name: "private-provider-name.glb",
        private_metadata: "private-provider-metadata",
      },
      texture_url: "https://private.example/texture",
    });
  }
  throw new Error("unexpected synthetic queue request");
};

function glbResponse() {
  return new Response(GLB_BYTES, {
    headers: {
      "content-type": "model/gltf-binary",
      "content-length": String(GLB_BYTES.byteLength),
    },
  });
}

function appWith(
  options: {
    key?: string | null;
    get?: ReadKey;
    request?: typeof globalThis.fetch;
    download?: typeof globalThis.fetch;
    media?: MediaPersistence;
  } = {}
) {
  const get = vi.fn<ReadKey>(
    options.get ?? (async () => (options.key === undefined ? KEY : options.key))
  );
  const request = vi.fn<typeof globalThis.fetch>(
    options.request ?? queueRequest
  );
  const download = vi.fn<typeof globalThis.fetch>(
    options.download ?? (async () => glbResponse())
  );
  const app = new Hono();
  registerThreeDRoutes(app, {
    secrets: { _getKey: get } as unknown as SecretsStore,
    media: options.media,
    provider_http: new ProviderHttp({ request, download }),
  });
  return { app, get, request, download };
}

function post(app: Hono, payload: unknown, signal?: AbortSignal) {
  return app.request("/three-d/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
}

describe("POST /three-d/generate", () => {
  it.each([
    {
      payload: { model_id: TEXT, prompt: "  a brass robot  " },
      providerBody: { prompt: "a brass robot" },
    },
    {
      payload: { model_id: HUNYUAN_IMAGE, image: IMAGE },
      providerBody: { input_image_url: "data:image/png;base64,AQID" },
    },
    {
      payload: { model_id: TRELLIS, image: IMAGE },
      providerBody: { image_url: "data:image/png;base64,AQID" },
    },
  ])(
    "adapts the exact $payload.model_id operation and returns only GLB wire data",
    async ({ payload, providerBody }) => {
      const { app, get, request, download } = appWith();
      const res = await post(app, payload);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        model_id: payload.model_id,
        provider_id: "fal",
        glb: GLB,
      });
      expect(get.mock.calls).toEqual([["fal"], ["fal"]]);
      expect(request).toHaveBeenCalledTimes(3);
      const [url, init] = request.mock.calls[0];
      expect(String(url)).toBe(`https://queue.fal.run/${payload.model_id}`);
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual(providerBody);
      expect(
        request.mock.calls.map(([, options]) =>
          new Headers(options?.headers).get("authorization")
        )
      ).toEqual([`Key ${KEY}`, `Key ${KEY}`, `Key ${KEY}`]);
      expect(download).toHaveBeenCalledOnce();
      const [asset, options] = download.mock.calls[0];
      expect(String(asset)).toBe(GLB_URL);
      expect(new Headers(options?.headers).get("authorization")).toBeNull();
    }
  );

  it("persists only fixed-name bytes and places the receipt at the root", async () => {
    const save = vi.fn<MediaPersistence["save"]>().mockResolvedValue(STORED);
    const { app } = appWith({ media: { save } });
    const res = await post(app, INPUT);
    expect(await res.json()).toEqual({
      model_id: TEXT,
      provider_id: "fal",
      glb: GLB,
      stored_media: STORED,
    });
    expect(save).toHaveBeenCalledWith({
      file_name: "model.glb",
      media_type: "model/gltf-binary",
      bytes: Buffer.from(GLB_BYTES),
    });
    expect(JSON.stringify(save.mock.calls)).not.toContain(INPUT.prompt);
    expect(JSON.stringify(save.mock.calls)).not.toContain(KEY);
  });

  it("keeps generated bytes when optional persistence fails and hides its detail", async () => {
    const save = vi.fn<MediaPersistence["save"]>();
    save.mockRejectedValue(new Error("private-storage-path"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { app } = appWith({ media: { save } });
      const res = await post(app, INPUT);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        model_id: TEXT,
        provider_id: "fal",
        glb: GLB,
      });
      expect(warning).toHaveBeenCalledOnce();
      expect(JSON.stringify(warning.mock.calls)).not.toContain(
        "private-storage-path"
      );
    } finally {
      warning.mockRestore();
    }
  });

  it.each([null, "", "  "])(
    "preserves the missing-key 400 without adding a wire code for %j",
    async (key) => {
      const { app, request, download } = appWith({ key });
      const res = await post(app, INPUT);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "no fal key is connected",
        provider_id: "fal",
      });
      expect(request).not.toHaveBeenCalled();
      expect(download).not.toHaveBeenCalled();
    }
  );

  it("uses the SDK's live invocation key and fails when resolution's key disappears", async () => {
    const get = vi.fn<ReadKey>();
    get.mockResolvedValueOnce(KEY).mockResolvedValueOnce(null);
    const { app, request } = appWith({ get });
    const res = await post(app, INPUT);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "no fal key is connected",
      provider_id: "fal",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("sanitizes key-reader failures without provider I/O", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { app, request } = appWith({
        get: async () => {
          throw new Error("private-key-reader");
        },
      });
      const res = await post(app, INPUT);
      expect(res.status).toBe(502);
      expect(await res.text()).not.toContain("private-key-reader");
      expect(JSON.stringify(logged.mock.calls)).not.toContain(
        "private-key-reader"
      );
      expect(request).not.toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  it.each([
    { model_id: TEXT },
    { model_id: TEXT, prompt: 1 },
    { model_id: TEXT, prompt: "robot", image: IMAGE },
    { model_id: HUNYUAN_IMAGE },
    { model_id: HUNYUAN_IMAGE, image: IMAGE, prompt: "robot" },
    { model_id: TRELLIS, image: IMAGE, prompt: "" },
    { model_id: TRELLIS, image: IMAGE, prompt: "  " },
    { model_id: TRELLIS, image: [] },
    { model_id: TRELLIS, image: { base64: "AQID", media_type: 1 } },
  ])(
    "rejects missing or incompatible structural fields without paid submission: %j",
    async (payload) => {
      const { app, request } = appWith();
      expect((await post(app, payload)).status).toBe(400);
      expect(request).not.toHaveBeenCalled();
    }
  );

  it.each(["", "not base64", "AAAA=", "A===", "!!!!"])(
    "rejects malformed base64 %j before key access",
    async (base64) => {
      const { app, get, request } = appWith();
      expect(
        (await post(app, { model_id: TRELLIS, image: { ...IMAGE, base64 } }))
          .status
      ).toBe(400);
      expect(get).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    }
  );

  it("delegates the model boundary to the SDK before reading keys", async () => {
    const { app, get, request } = appWith();
    const res = await post(app, { ...INPUT, model_id: "fal-ai/not-real" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "3D model is unavailable",
      model_id: "fal-ai/not-real",
    });
    expect(get).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("uses the SDK's trimmed codepoint limit rather than UTF-16 or byte length", async () => {
    const { app, request } = appWith();
    const prompt = "🤖".repeat(1024);
    expect(
      (await post(app, { ...INPUT, prompt: ` \n${prompt}\t ` })).status
    ).toBe(200);
    for (const invalid of ["  ", `${prompt}🤖`]) {
      const res = await post(app, { ...INPUT, prompt: invalid });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "invalid 3D input",
        code: "invalid_input",
      });
    }
    expect(request).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({
      prompt,
    });
  });

  it("leaves decoded MIME policy to the SDK and maps its failure without submitting", async () => {
    const { app, get, request } = appWith();
    const res = await post(app, {
      model_id: TRELLIS,
      image: { ...IMAGE, media_type: "image/svg+xml" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "invalid 3D input",
      code: "invalid_input",
    });
    expect(get).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
  });

  it("bounds encoded allocation while the SDK enforces the exact decoded 8-MiB boundary", async () => {
    const { app, get, request } = appWith();
    const boundary = Buffer.alloc(8 * 1024 * 1024).toString("base64");
    const beyond = Buffer.alloc(8 * 1024 * 1024 + 1).toString("base64");
    expect(boundary.length).toBe(beyond.length);
    expect(
      (
        await post(app, {
          model_id: TRELLIS,
          image: { ...IMAGE, base64: boundary },
        })
      ).status
    ).toBe(200);
    const invalid = await post(app, {
      model_id: TRELLIS,
      image: { ...IMAGE, base64: beyond },
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      error: "invalid 3D input",
      code: "invalid_input",
    });
    expect(get).toHaveBeenCalledTimes(3);
    const oversized = await post(app, {
      model_id: TRELLIS,
      image: { ...IMAGE, base64: `${boundary}AAAA` },
    });
    expect(oversized.status).toBe(400);
    expect(get).toHaveBeenCalledTimes(3);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("keeps its slot through download and does not let rejected requests release it", async () => {
    let started!: () => void;
    let finish!: (value: Response) => void;
    const downloading = new Promise<void>((resolve) => {
      started = resolve;
    });
    const download = vi.fn<typeof globalThis.fetch>();
    download
      .mockImplementationOnce(async () => {
        started();
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      })
      .mockImplementation(async () => glbResponse());
    const { app, request } = appWith({ download });
    const first = post(app, INPUT);
    await downloading;
    for (let i = 0; i < 2; i++) {
      const busy = await post(app, INPUT);
      expect(busy.status).toBe(429);
      expect(await busy.json()).toEqual({
        error: "another 3D generation is already in progress",
        code: "three_d_generation_busy",
      });
    }
    expect((await post(app, { ...INPUT, model_id: "unknown" })).status).toBe(
      400
    );
    expect((await post(app, INPUT)).status).toBe(429);
    expect(request).toHaveBeenCalledTimes(3);
    finish(glbResponse());
    expect((await first).status).toBe(200);
    expect((await post(app, INPUT)).status).toBe(200);
    expect(download).toHaveBeenCalledTimes(2);
  });

  it("holds admission through persistence and releases it after the receipt is formed", async () => {
    let started!: () => void;
    let finish!: (value: MediaItem) => void;
    const storing = new Promise<void>((resolve) => {
      started = resolve;
    });
    const save = vi.fn<MediaPersistence["save"]>();
    save
      .mockImplementationOnce(async () => {
        started();
        return new Promise<MediaItem>((resolve) => {
          finish = resolve;
        });
      })
      .mockResolvedValue(STORED);
    const { app, request } = appWith({ media: { save } });
    const first = post(app, INPUT);
    await storing;
    expect((await post(app, INPUT)).status).toBe(429);
    expect(request).toHaveBeenCalledTimes(3);
    finish(STORED);
    expect(await (await first).json()).toMatchObject({ stored_media: STORED });
    expect((await post(app, INPUT)).status).toBe(200);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 500])(
    "keeps provider HTTP %s generic and releases admission after failure",
    async (status) => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      const upstream = vi.fn<typeof globalThis.fetch>();
      upstream
        .mockResolvedValueOnce(
          new Response("private-provider-detail", { status })
        )
        .mockImplementation(queueRequest);
      try {
        const { app, request, download } = appWith({ request: upstream });
        const failed = await post(app, INPUT);
        expect(failed.status).toBe(502);
        expect(await failed.json()).toEqual({
          error: "3D generation failed",
          model_id: TEXT,
          provider_id: "fal",
        });
        expect(request).toHaveBeenCalledOnce();
        expect(download).not.toHaveBeenCalled();
        expect(JSON.stringify(logged.mock.calls)).not.toContain(
          "private-provider-detail"
        );
        expect((await post(app, INPUT)).status).toBe(200);
      } finally {
        logged.mockRestore();
      }
    }
  );

  it("sanitizes transport errors and cannot mistake arbitrary codes for GG authority", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const save = vi.fn<MediaPersistence["save"]>();
    try {
      const { app, request, download } = appWith({
        media: { save },
        request: async () => {
          throw Object.assign(new Error("private-provider-detail"), {
            code: "gg_token_expired",
            responseBody: KEY,
          });
        },
      });
      const res = await post(app, INPUT);
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({
        error: "3D generation failed",
        model_id: TEXT,
        provider_id: "fal",
      });
      expect(JSON.stringify(logged.mock.calls)).not.toContain(
        "private-provider-detail"
      );
      expect(JSON.stringify(logged.mock.calls)).not.toContain(KEY);
      expect(request).toHaveBeenCalledOnce();
      expect(download).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  it("never publishes or persists invalid downloaded GLB data", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const save = vi.fn<MediaPersistence["save"]>();
    try {
      const { app, download } = appWith({
        media: { save },
        download: async () => new Response("private-not-glb"),
      });
      const res = await post(app, INPUT);
      expect(res.status).toBe(502);
      expect(await res.text()).not.toContain("private-not-glb");
      expect(JSON.stringify(logged.mock.calls)).not.toContain(
        "private-not-glb"
      );
      expect(download).toHaveBeenCalledOnce();
      expect(save).not.toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  it("propagates cancellation and releases admission without retrying accepted work", async () => {
    let started!: () => void;
    const submitted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const controller = new AbortController();
    let providerSignal: AbortSignal | null | undefined;
    const upstream = vi.fn<typeof globalThis.fetch>();
    upstream
      .mockImplementationOnce(async (_input, init) => {
        providerSignal = init?.signal;
        started();
        return new Promise<Response>((_resolve, reject) => {
          providerSignal!.addEventListener(
            "abort",
            () => reject(providerSignal!.reason),
            { once: true }
          );
        });
      })
      .mockImplementation(queueRequest);
    const save = vi.fn<MediaPersistence["save"]>().mockResolvedValue(STORED);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { app, request, download } = appWith({
        request: upstream,
        media: { save },
      });
      const first = post(app, INPUT, controller.signal);
      await submitted;
      controller.abort(new Error("private-abort-reason"));
      const failed = await first;
      expect(failed.status).toBe(502);
      expect(providerSignal?.aborted).toBe(true);
      expect(await failed.text()).not.toContain("private-abort-reason");
      expect(JSON.stringify(logged.mock.calls)).not.toContain(
        "private-abort-reason"
      );
      expect(request).toHaveBeenCalledOnce();
      expect(download).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
      expect((await post(app, INPUT)).status).toBe(200);
      expect(request).toHaveBeenCalledTimes(4);
      expect(save).toHaveBeenCalledOnce();
    } finally {
      logged.mockRestore();
    }
  });
});

describe("3D route ownership", () => {
  it("keeps provider execution and semantic policy in the public SDK", () => {
    const source = readFileSync(
      new URL("./three-d.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain("ThreeDClient");
    expect(source).not.toMatch(
      /@grida\/ai-models|\.trim\(|max_utf8_characters|IMAGE_MEDIA_TYPES|queue\.fal\.run|pollQueue|downloadProviderAsset|assertGlb/
    );
    expect(source).not.toMatch(/(from|require\()\s*["'][^"']*editor\/lib\/ai/);
  });
});
