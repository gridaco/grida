// GRIDA-SEC-004 — producer-only rig eligibility and rigged mesh contracts.
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  MediaOperations,
  ProviderHttp,
  RiggingClient,
  RiggingOperations,
} from "./index";

const taskId = "task_synthetic_rig";
const key = "synthetic-tripo-key";
const asset = "https://cdn.tripo3d.ai/output/rig.glb?signature=private";
function glb(
  document: Record<string, unknown> = { asset: { version: "2.0" } }
) {
  const json = new TextEncoder().encode(JSON.stringify(document));
  const size = Math.ceil(json.length / 4) * 4;
  const data = new Uint8Array(20 + size);
  const view = new DataView(data.buffer);
  [0x46546c67, 2, data.length, size, 0x4e4f534a].forEach((value, index) =>
    view.setUint32(index * 4, value, true)
  );
  data.fill(32, 20);
  data.set(json, 20);
  return data;
}
const mesh = (): RiggingClient.Mesh => ({
  data: glb(),
  media_type: "model/gltf-binary",
});
const checkSelection = { feature: "rig-check", provider: "tripo" } as const;
const rigSelection = {
  feature: "rigging",
  provider: "tripo",
  model_id: "tripo/rig-v1.0",
} as const;
function setup(feature: "rig-check" | "rigging" = "rigging", riggable = true) {
  const get = vi.fn<RiggingClient.Keys["get"]>(() => key);
  const request = vi.fn<typeof fetch>(async (url) =>
    Response.json({
      code: 0,
      data: String(url).endsWith("/files")
        ? { file_token: "file_synthetic" }
        : String(url).includes("/tasks/")
          ? {
              task_id: taskId,
              type: feature === "rig-check" ? "rig_check" : "rig",
              status: "success",
              progress: 100,
              credits_consumed: feature === "rig-check" ? 0 : 25,
              output:
                feature === "rig-check"
                  ? { riggable, rig_type: "biped" }
                  : { model_url: asset },
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
    client: new RiggingClient({ keys: { get }, http }),
  };
}
afterEach(() => vi.useRealTimers());
describe("standalone rigging operation contract", () => {
  it("separates structured checks from model-specific rigging at compile time", async () => {
    const { client } = setup();
    const check = await client.resolve(checkSelection);
    const rig = await client.resolve(rigSelection);
    const creatures = await client.resolve({
      ...rigSelection,
      model_id: "tripo/rig-v2.5",
    });
    expectTypeOf(check.check).returns.toEqualTypeOf<
      Promise<RiggingClient.CheckResult>
    >();
    expectTypeOf(rig.generate)
      .parameter(0)
      .toEqualTypeOf<RiggingClient.Input<"tripo/rig-v1.0">>();
    const compile = () => {
      // @ts-expect-error Eligibility does not invent a model identity.
      void client.resolve({ ...checkSelection, model_id: "rig-check" });
      // @ts-expect-error Humanoid rigging cannot request a creature skeleton.
      void rig.generate({ mesh: mesh(), rig_type: "quadruped", spec: "tripo" });
      void creatures.generate({
        mesh: mesh(),
        // @ts-expect-error Creature model does not support biped.
        rig_type: "biped",
        spec: "mixamo",
      });
      // @ts-expect-error Structured check results are not generated media.
      void check.generate({ mesh: mesh() });
    };
    expect(compile).toBeTypeOf("function");
  });
  it.each([true, false])(
    "returns riggable=%s as structured findings without downloading media",
    async (riggable) => {
      const { client, request, download } = setup("rig-check", riggable);
      const operation = await client.resolve(checkSelection);
      const result = await operation.check({ mesh: mesh() });
      expect(result).toEqual({
        riggable,
        rig_type: "biped",
        task: { id: taskId, credits_consumed: 0 },
      });
      expect(result).not.toHaveProperty("glb");
      expect(download).not.toHaveBeenCalled();
      expect(request.mock.calls.map(([url]) => String(url))).toEqual([
        "https://openapi.tripo3d.ai/v3/files",
        "https://openapi.tripo3d.ai/v3/animations/rig-check",
        `https://openapi.tripo3d.ai/v3/tasks/${taskId}`,
      ]);
      expect(JSON.parse(request.mock.calls[1]![1]!.body as string)).toEqual({
        input: "file_synthetic",
      });
    }
  );
  it.each([
    ["tripo/rig-v1.0", "v1.0-20240301", "biped", "mixamo"],
    ["tripo/rig-v2.5", "v2.5-20260210", "quadruped", "tripo"],
  ] as const)(
    "executes %s independently with explicit skeleton choices",
    async (model_id, binding, rig_type, spec) => {
      const { client, request, download } = setup();
      const operation = await client.resolve({ ...rigSelection, model_id });
      expect(request).not.toHaveBeenCalled();
      const result = await operation.generate({
        mesh: mesh(),
        rig_type,
        spec,
      } as never);
      expect(JSON.parse(request.mock.calls[1]![1]!.body as string)).toEqual({
        input: "file_synthetic",
        model: binding,
        rig_type,
        spec,
        out_format: "glb",
      });
      expect(
        request.mock.calls.filter(([url]) =>
          String(url).includes("/animations/")
        )
      ).toHaveLength(1);
      const upload = request.mock.calls[0]![1]!;
      expect(new TextDecoder().decode(upload.body as Uint8Array)).toContain(
        'name="file"; filename="mesh.glb"'
      );
      expect(new Headers(upload.headers).get("content-type")).toMatch(
        /^multipart\/form-data; boundary=grida-tripo-/
      );
      expect(result).toEqual({
        glb: mesh(),
        task: { id: taskId, credits_consumed: 25 },
      });
      expect(download.mock.calls[0]![1]).not.toHaveProperty("headers");
    }
  );
  it("discovers both result contracts without constructing clients or reading keys", () => {
    const operations = new MediaOperations().rigging;
    expect(operations).toBeInstanceOf(RiggingOperations);
    const all = operations.list({ provider: "tripo" });
    expect(all).toHaveLength(3);
    expect(all[0]).not.toHaveProperty("model_id");
    expect(all[0]!.output.representation).toBe("structured");
    expect(all[1]!.output.representation).toBe("native");
    expect(
      operations.list({ feature: "rigging", provider: "tripo" })
    ).toHaveLength(2);
    expect(Object.isFrozen(all)).toBe(true);
    expect(Object.isFrozen(all[0]!.input_schema)).toBe(true);
    expect(JSON.parse(JSON.stringify(all))).toEqual(all);
    const parsed = operations.parseInput(checkSelection, {
      mesh: {
        data: btoa(String.fromCharCode(...glb())),
        media_type: "model/gltf-binary",
      },
    });
    expect(parsed).toEqual({
      kind: "three-d",
      feature: "rig-check",
      provider_id: "tripo",
      variant: "mesh",
      selection: checkSelection,
      input: { mesh: mesh() },
    });
    const schema = operations.inspect(rigSelection).input_schema;
    expect(schema.properties).toMatchObject({
      rig_type: { enum: ["biped"] },
      spec: { enum: ["tripo", "mixamo"] },
      mesh: {
        properties: {
          data: { "x-grida-decoded-max-bytes": RiggingClient.max_mesh_bytes },
        },
      },
    });
  });
});

describe("rigging admission and bounded failure behavior", () => {
  it("accepts the observed v3 legacy check task kind through polling without resubmission", async () => {
    vi.useFakeTimers();
    const { client, request } = setup("rig-check");
    const base = request.getMockImplementation()!;
    let polls = 0;
    request.mockImplementation(async (url, init) => {
      const response = await base(url, init);
      if (!String(url).includes("/tasks/")) return response;
      const body = await response.json();
      return Response.json({
        ...body,
        data: {
          ...body.data,
          type: "animate_prerigcheck",
          ...(++polls === 1 ? { status: "queued", progress: 0 } : {}),
        },
      });
    });
    const operation = await client.resolve(checkSelection);
    const result = operation.check({ mesh: mesh() });
    await vi.advanceTimersByTimeAsync(2_001);
    await expect(result).resolves.toMatchObject({
      riggable: true,
      rig_type: "biped",
      task: { id: taskId },
    });
    expect(polls).toBe(2);
    expect(
      request.mock.calls.filter(([url]) => String(url).includes("/animations/"))
    ).toHaveLength(1);
  });

  it("accepts the observed v3 legacy rig task kind through polling without resubmission", async () => {
    vi.useFakeTimers();
    const { client, request, download } = setup("rigging");
    const base = request.getMockImplementation()!;
    let polls = 0;
    request.mockImplementation(async (url, init) => {
      const response = await base(url, init);
      if (!String(url).includes("/tasks/")) return response;
      const body = await response.json();
      return Response.json({
        ...body,
        data: {
          ...body.data,
          type: "animate_rig",
          ...(++polls === 1 ? { status: "queued", progress: 0 } : {}),
        },
      });
    });
    const operation = await client.resolve(rigSelection);
    const result = operation.generate({
      mesh: mesh(),
      rig_type: "biped",
      spec: "mixamo",
    });
    await vi.advanceTimersByTimeAsync(2_001);
    await expect(result).resolves.toEqual({
      glb: mesh(),
      task: { id: taskId, credits_consumed: 25 },
    });
    expect(polls).toBe(2);
    expect(download).toHaveBeenCalledOnce();
    expect(
      request.mock.calls.filter(([url]) => String(url).includes("/animations/"))
    ).toHaveLength(1);
  });

  it.each([
    ["rig-check", "animate_rig"],
    ["rigging", "animate_prerigcheck"],
  ] as const)(
    "does not accept another operation's legacy task kind for %s",
    async (feature, type) => {
      const { client, request, download } = setup(feature);
      const base = request.getMockImplementation()!;
      request.mockImplementation(async (url, init) => {
        const response = await base(url, init);
        if (!String(url).includes("/tasks/")) return response;
        const body = await response.json();
        return Response.json({ ...body, data: { ...body.data, type } });
      });
      const operation = await client.resolve(
        feature === "rig-check" ? checkSelection : rigSelection
      );
      const result =
        operation.feature === "rig-check"
          ? operation.check({ mesh: mesh() })
          : operation.generate({
              mesh: mesh(),
              rig_type: "biped",
              spec: "mixamo",
            } as never);
      await expect(result).rejects.toMatchObject({
        code: "invalid_response",
        task_id: taskId,
      });
      expect(download).not.toHaveBeenCalled();
    }
  );

  it("requires BYOK during resolution without submitting or downloading", async () => {
    const { client, get, request, download } = setup();
    get.mockReturnValue(null);
    await expect(client.resolve(checkSelection)).rejects.toMatchObject({
      code: "provider_key_required",
    });
    await expect(client.resolve(rigSelection)).rejects.toMatchObject({
      code: "provider_key_required",
    });
    expect(request).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });
  it.each([
    { ...rigSelection, provider: "fal" },
    { ...checkSelection, model_id: "tripo/h3.1" },
    { ...checkSelection, endpoint: "https://attacker.invalid" },
    { ...rigSelection, model_id: "" },
    { ...rigSelection, feature: "animation" },
  ])(
    "rejects malformed selection before looking up keys",
    async (selection) => {
      const { client, get, request } = setup();
      await expect(client.resolve(selection as never)).rejects.toMatchObject({
        code: "invalid_input",
      });
      expect(get).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    }
  );
  it("refuses unknown models without substituting a recommendation", async () => {
    const { client, get } = setup();
    await expect(
      client.resolve({ ...rigSelection, model_id: "tripo/h3.1" })
    ).rejects.toMatchObject({ code: "model_unavailable" });
    expect(get).not.toHaveBeenCalled();
  });
  it.each([
    { rig_type: "quadruped", spec: "tripo" },
    { rig_type: "biped", spec: "unknown" },
    { rig_type: "biped" },
    { spec: "mixamo" },
    { rig_type: "biped", spec: "mixamo", out_format: "fbx" },
    { rig_type: "biped", spec: "mixamo", model: "v2.5-20260210" },
    { rig_type: "biped", spec: "mixamo", signal: {} },
  ])(
    "rejects unsupported controls before generation key lookup",
    async (controls) => {
      const { client, get, request } = setup();
      const operation = await client.resolve(rigSelection);
      get.mockClear();
      await expect(
        operation.generate({ mesh: mesh(), ...controls } as never)
      ).rejects.toMatchObject({ code: "invalid_input" });
      expect(get).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    }
  );
  it.each([
    { data: new Uint8Array(), media_type: "model/gltf-binary" },
    { data: new Uint8Array([1, 2, 3]), media_type: "model/gltf-binary" },
    { data: glb(), media_type: "application/octet-stream" },
    { data: glb(), media_type: "model/gltf-binary", path: "/tmp/model.glb" },
    { url: "https://cdn.tripo3d.ai/model.glb" },
    { task_id: "task_input" },
    {
      data: glb({
        asset: { version: "2.0" },
        buffers: [{ uri: "https://secret.invalid/file" }],
      }),
      media_type: "model/gltf-binary",
    },
    {
      data: glb({
        asset: { version: "2.0" },
        extensionsRequired: ["KHR_draco_mesh_compression"],
      }),
      media_type: "model/gltf-binary",
    },
  ])(
    "rejects malformed or nonportable mesh before upload",
    async (inputMesh) => {
      const { client, get, request } = setup("rig-check");
      const operation = await client.resolve(checkSelection);
      get.mockClear();
      await expect(
        operation.check({ mesh: inputMesh } as never)
      ).rejects.toMatchObject({ code: "invalid_input" });
      expect(get).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    }
  );
  it("bounds native input before copying, key access or upload", async () => {
    const { client, get, request } = setup("rig-check");
    const operation = await client.resolve(checkSelection);
    get.mockClear();
    await expect(
      operation.check({
        mesh: {
          data: new Uint8Array(RiggingClient.max_mesh_bytes + 1),
          media_type: "model/gltf-binary",
        },
      })
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(get).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
  it("owns input bytes before waiting for execution credentials", async () => {
    const { client, get, request } = setup("rig-check");
    const operation = await client.resolve(checkSelection);
    let release!: (key: string) => void;
    get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const input = mesh();
    const original = new Uint8Array(input.data);
    const executing = operation.check({ mesh: input });
    input.data.fill(0);
    release(key);
    await executing;
    const body = request.mock.calls[0]![1]!.body as Uint8Array;
    const binary = String.fromCharCode(...body);
    expect(binary).toContain(String.fromCharCode(...original));
  });
  it("reads the same provider credential again and refuses credential loss", async () => {
    const { client, get, request } = setup();
    const operation = await client.resolve(rigSelection);
    get.mockReturnValue(null);
    await expect(
      operation.generate({ mesh: mesh(), rig_type: "biped", spec: "mixamo" })
    ).rejects.toMatchObject({ code: "provider_key_required" });
    expect(request).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500])(
    "does not retry a rejected submission (%i)",
    async (status) => {
      const { client, request } = setup();
      const operation = await client.resolve(rigSelection);
      request.mockImplementation(async (url) =>
        String(url).endsWith("/files")
          ? Response.json({ code: 0, data: { file_token: "file_synthetic" } })
          : Response.json(
              { code: 1, message: `${key}: private message` },
              { status }
            )
      );
      const failure = await operation
        .generate({ mesh: mesh(), rig_type: "biped", spec: "tripo" })
        .catch((error) => error);
      expect(failure.code).toBe(
        status === 401
          ? "credential_rejected"
          : status === 403
            ? "access_denied"
            : "generation_failed"
      );
      expect(JSON.stringify(failure)).not.toContain(key);
      expect(request.mock.calls).toHaveLength(2);
    }
  );
  it("maps provider credit refusal without copying provider error details", async () => {
    const { client, request } = setup();
    const operation = await client.resolve(rigSelection);
    request.mockImplementation(async (url) =>
      String(url).endsWith("/files")
        ? Response.json({ code: 0, data: { file_token: "file_synthetic" } })
        : Response.json({ code: 2010, message: key }, { status: 403 })
    );
    await expect(
      operation.generate({ mesh: mesh(), rig_type: "biped", spec: "tripo" })
    ).rejects.toMatchObject({
      code: "insufficient_credits",
      message: "insufficient_credits",
    });
    expect(request.mock.calls).toHaveLength(2);
  });
  it("retains an accepted task id on polling failure without resubmission", async () => {
    const { client, request } = setup();
    const base = request.getMockImplementation()!;
    request.mockImplementation(async (url, init) => {
      if (String(url).includes("/tasks/"))
        throw new Error(`private provider failure ${key}`);
      return base(url, init);
    });
    const operation = await client.resolve(rigSelection);
    const error = await operation
      .generate({ mesh: mesh(), rig_type: "biped", spec: "tripo" })
      .catch((error) => error);
    expect(error.toJSON()).toEqual({
      code: "generation_failed",
      message: "generation_failed",
      task_id: taskId,
    });
    expect(
      request.mock.calls.filter(([url]) =>
        String(url).includes("/animations/rig")
      )
    ).toHaveLength(1);
  });
  it("does not resubmit when transport loses the initial response", async () => {
    const { client, request } = setup();
    const base = request.getMockImplementation()!;
    request.mockImplementation(async (url, init) => {
      if (String(url).endsWith("/animations/rig"))
        throw new Error("ambiguous accepted POST");
      return base(url, init);
    });
    const operation = await client.resolve(rigSelection);
    const error = await operation
      .generate({ mesh: mesh(), rig_type: "biped", spec: "tripo" })
      .catch((error) => error);
    expect(error.toJSON()).toEqual({
      code: "generation_failed",
      message: "generation_failed",
    });
    expect(request.mock.calls).toHaveLength(2);
  });
  it.each([
    { riggable: true },
    { riggable: false, rig_type: null },
    { riggable: "yes", rig_type: "biped" },
    { riggable: true, rig_type: "unknown" },
  ])(
    "rejects malformed check findings without treating them as media",
    async (output) => {
      const { client, request, download } = setup("rig-check");
      const base = request.getMockImplementation()!;
      request.mockImplementation(async (url, init) =>
        String(url).includes("/tasks/")
          ? Response.json({
              code: 0,
              data: {
                task_id: taskId,
                type: "rig_check",
                status: "success",
                output,
              },
            })
          : base(url, init)
      );
      const operation = await client.resolve(checkSelection);
      await expect(operation.check({ mesh: mesh() })).rejects.toMatchObject({
        code: "invalid_response",
        task_id: taskId,
      });
      expect(download).not.toHaveBeenCalled();
    }
  );
  it.each([
    { task_id: "task_other" },
    { type: "text_to_model" },
    { status: "unknown" },
    { status: "running", progress: -1 },
    { credits_consumed: -1 },
  ])(
    "rejects invalid task identity, state or usage receipt",
    async (override) => {
      const { client, request } = setup("rig-check");
      const base = request.getMockImplementation()!;
      request.mockImplementation(async (url, init) => {
        const response = await base(url, init);
        if (!String(url).includes("/tasks/")) return response;
        const body = await response.json();
        return Response.json({ ...body, data: { ...body.data, ...override } });
      });
      const operation = await client.resolve(checkSelection);
      await expect(operation.check({ mesh: mesh() })).rejects.toMatchObject({
        code: "invalid_response",
        task_id: taskId,
      });
    }
  );
  it("preserves accepted task id on cancellation and cancels active transport", async () => {
    const { client, request } = setup();
    const base = request.getMockImplementation()!;
    let polling!: () => void;
    const began = new Promise<void>((resolve) => {
      polling = resolve;
    });
    request.mockImplementation(async (url, init) => {
      if (!String(url).includes("/tasks/")) return base(url, init);
      polling();
      return new Promise(() => {});
    });
    const operation = await client.resolve(rigSelection);
    const controller = new AbortController();
    const result = operation.generate({
      mesh: mesh(),
      rig_type: "biped",
      spec: "tripo",
      signal: controller.signal,
    });
    await began;
    controller.abort();
    await expect(result).rejects.toMatchObject({
      code: "aborted",
      task_id: taskId,
    });
    expect(request.mock.calls.at(-1)![1]!.signal!.aborted).toBe(true);
  });
  it("polls queued and running states without another operation POST", async () => {
    vi.useFakeTimers();
    const { client, request } = setup("rig-check");
    const base = request.getMockImplementation()!;
    let polls = 0;
    request.mockImplementation(async (url, init) => {
      if (!String(url).includes("/tasks/") || ++polls > 2)
        return base(url, init);
      return Response.json({
        code: 0,
        data: {
          task_id: taskId,
          type: "rig_check",
          status: polls === 1 ? "queued" : "running",
          progress: 10,
        },
      });
    });
    const operation = await client.resolve(checkSelection);
    const result = operation.check({ mesh: mesh() });
    await vi.advanceTimersByTimeAsync(4_001);
    await expect(result).resolves.toMatchObject({ riggable: true });
    expect(
      request.mock.calls.filter(([url]) => String(url).includes("/animations/"))
    ).toHaveLength(1);
    expect(polls).toBe(3);
  });
  it("rejects unapproved output URL hosts before downloading", async () => {
    const { client, request, download } = setup();
    const base = request.getMockImplementation()!;
    request.mockImplementation(async (url, init) =>
      String(url).includes("/tasks/")
        ? Response.json({
            code: 0,
            data: {
              task_id: taskId,
              type: "rig",
              status: "success",
              output: { model_url: "https://attacker.invalid/private.glb" },
            },
          })
        : base(url, init)
    );
    const operation = await client.resolve(rigSelection);
    await expect(
      operation.generate({ mesh: mesh(), rig_type: "biped", spec: "tripo" })
    ).rejects.toMatchObject({ code: "invalid_response", task_id: taskId });
    expect(download).not.toHaveBeenCalled();
  });
  it("enforces output length bounds before retaining a downloaded body", async () => {
    const { client, download } = setup();
    download.mockResolvedValue(
      new Response("oversized", {
        headers: { "content-length": String(RiggingClient.max_glb_bytes + 1) },
      })
    );
    const operation = await client.resolve(rigSelection);
    await expect(
      operation.generate({ mesh: mesh(), rig_type: "biped", spec: "tripo" })
    ).rejects.toMatchObject({ code: "generation_failed", task_id: taskId });
  });
  it.each([
    glb({ asset: { version: "2.0" }, images: [{ uri: "texture.png" }] }),
    glb({
      asset: { version: "2.0" },
      extensionsUsed: ["EXT_meshopt_compression"],
    }),
    new Uint8Array([1, 2, 3]),
  ])("rejects nonportable or malformed returned GLB", async (data) => {
    const { client, download } = setup();
    download.mockResolvedValue(new Response(data));
    const operation = await client.resolve(rigSelection);
    await expect(
      operation.generate({ mesh: mesh(), rig_type: "biped", spec: "tripo" })
    ).rejects.toMatchObject({ code: "invalid_response", task_id: taskId });
  });
});

describe("rigging JSON discovery refusals", () => {
  const operations = new RiggingOperations();
  const jsonMesh = {
    data: btoa(String.fromCharCode(...glb())),
    media_type: "model/gltf-binary",
  };
  it.each([
    { ...checkSelection, model_id: "rig-check" },
    { ...checkSelection, variant: "image" },
    { ...checkSelection, provider: "fal" },
    { ...rigSelection, kind: "image" },
  ])("rejects unsupported selector fields", (selector) => {
    expect(() => operations.inspect(selector as never)).toThrow(
      "invalid_input"
    );
  });
  it("distinguishes valid unknown models from malformed selectors", () => {
    expect(() =>
      operations.inspect({ ...rigSelection, model_id: "not/a/model" })
    ).toThrow("operation_unavailable");
    expect(() => operations.list({ model_id: "" })).toThrow("invalid_input");
  });
  it.each([
    { mesh: jsonMesh, rig_type: "quadruped", spec: "tripo" },
    { mesh: jsonMesh, rig_type: "biped", spec: "tripo", signal: null },
    { mesh: jsonMesh, rig_type: "biped", spec: undefined },
    { mesh: { ...jsonMesh, data: "AQI" }, rig_type: "biped", spec: "tripo" },
    { mesh: { ...jsonMesh, data: "A A==" }, rig_type: "biped", spec: "tripo" },
  ])("matches native admission and rejects JSON-only ambiguity", (input) => {
    expect(() => operations.parseInput(rigSelection, input)).toThrow(
      "invalid_input"
    );
  });
  it("bounds encoded input before decoding", () => {
    const data = "A".repeat(
      Math.ceil(RiggingClient.max_mesh_bytes / 3) * 4 + 4
    );
    expect(() =>
      operations.parseInput(checkSelection, { mesh: { ...jsonMesh, data } })
    ).toThrow("invalid_input");
  });
});
