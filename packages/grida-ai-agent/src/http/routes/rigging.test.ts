// GRIDA-SEC-004 — bounded wire admission and synthetic provider execution.
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderHttp, RiggingClient } from "@grida/ai";
import type { MediaPersistence, SecretsStore } from "@grida/daemon/server";
import { GeneratedMediaPersistence } from "./generated-media-persistence";
import { registerRiggingRoutes } from "./rigging";

const json = Buffer.from('{"asset":{"version":"2.0"}} ');
const GLB = Buffer.alloc(20 + json.length);
GLB.write("glTF");
GLB.writeUInt32LE(2, 4);
GLB.writeUInt32LE(GLB.length, 8);
GLB.writeUInt32LE(json.length, 12);
GLB.writeUInt32LE(0x4e4f534a, 16);
json.copy(GLB, 20);
const mesh = { data: GLB.toString("base64"), media_type: "model/gltf-binary" };
const checkInput = { provider: "tripo", input: { mesh } };
const rigInput = {
  provider: "tripo",
  model_id: "tripo/rig-v1.0",
  input: { mesh, rig_type: "biped", spec: "mixamo" },
};
function setup(
  options: {
    key?: string | null;
    riggable?: boolean;
    download?: () => Promise<Response>;
    media?: MediaPersistence;
  } = {}
) {
  let check = false;
  const get = vi.fn<() => Promise<string | null>>(async () =>
    options.key === undefined ? "synthetic-tripo-key" : options.key
  );
  const request = vi.fn<typeof fetch>(async (url, init) => {
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer synthetic-tripo-key"
    );
    if (String(url).endsWith("/files"))
      return Response.json({ code: 0, data: { file_token: "file_mesh" } });
    if (String(url).includes("/animations/")) {
      check = String(url).endsWith("/rig-check");
      return Response.json({ code: 0, data: { task_id: "task_mesh" } });
    }
    return Response.json({
      code: 0,
      data: {
        task_id: "task_mesh",
        type: check ? "rig_check" : "rig",
        status: "success",
        credits_consumed: check ? 0 : 25,
        output: check
          ? {
              riggable: options.riggable ?? true,
              rig_type: "biped",
              private_metadata: "hidden",
            }
          : {
              model_url:
                "https://tripo-data.rg1.data.tripo3d.com/rig.glb?private=secret",
            },
      },
    });
  });
  const download = vi.fn<typeof fetch>(async (_url, init) => {
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    return options.download ? options.download() : new Response(GLB);
  });
  const app = new Hono();
  registerRiggingRoutes(app, {
    secrets: { _getKey: get } as unknown as SecretsStore,
    media: options.media,
    provider_http: new ProviderHttp({ request, download }),
  });
  return { app, get, request, download };
}
const post = (app: Hono, body: unknown, route = "/rigging/generate") =>
  app.request(route, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
afterEach(() => vi.restoreAllMocks());

describe("rigging host adapter", () => {
  it.each([true, false])(
    "returns %s eligibility as structured findings without media or model identity",
    async (riggable) => {
      const save = vi.fn<MediaPersistence["save"]>();
      const { app, download } = setup({
        riggable,
        media: { save } as unknown as MediaPersistence,
      });
      const response = await post(app, checkInput, "/rigging/check");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        feature: "rig-check",
        provider_id: "tripo",
        riggable,
        rig_type: "biped",
        task: { id: "task_mesh", credits_consumed: 0 },
      });
      expect(save).not.toHaveBeenCalled();
      expect(download).not.toHaveBeenCalled();
    }
  );
  it("returns portable rigged bytes and the safe accepted task receipt", async () => {
    const { app, request } = setup();
    const response = await post(app, rigInput);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      feature: "rigging",
      provider_id: "tripo",
      model_id: "tripo/rig-v1.0",
      glb: {
        base64: mesh.data,
        media_type: mesh.media_type,
        file_name: "rigged-model.glb",
      },
      task: { id: "task_mesh", credits_consumed: 25 },
    });
    expect(
      request.mock.calls.filter(([url]) => String(url).includes("/animations/"))
    ).toHaveLength(1);
  });
  it.each([
    { ...rigInput, unexpected: true },
    { ...rigInput, provider: "fal" },
    { ...rigInput, model_id: "tripo/h3.1" },
    { ...rigInput, input: { mesh, rig_type: "quadruped", spec: "mixamo" } },
    { ...rigInput, input: { mesh, rig_type: "biped", spec: "unknown" } },
    {
      ...rigInput,
      input: {
        mesh: { ...mesh, data: "https://example.com/model.glb" },
        rig_type: "biped",
        spec: "mixamo",
      },
    },
    {
      ...rigInput,
      input: {
        mesh: { ...mesh, data: "AQID" },
        rig_type: "biped",
        spec: "mixamo",
      },
    },
  ])(
    "rejects invalid mesh/options before reading credentials",
    async (input) => {
      const { app, get, request } = setup();
      expect((await post(app, input)).status).toBe(400);
      expect(get).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    }
  );
  it("refuses invented model identity on an eligibility check", async () => {
    const { app, get } = setup();
    expect(
      (
        await post(
          app,
          { ...checkInput, model_id: "tripo/rig-check" },
          "/rigging/check"
        )
      ).status
    ).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });
  it("reports missing keys without fallback", async () => {
    const { app, request } = setup({ key: null });
    const response = await post(app, rigInput);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "provider_key_required",
      provider_id: "tripo",
    });
    expect(request).not.toHaveBeenCalled();
  });
  it("preserves accepted task identity on sanitized download failure without resubmission", async () => {
    const { app, request } = setup({
      download: async () => {
        throw new Error("private-path-or-key");
      },
    });
    const response = await post(app, rigInput);
    expect(response.status).toBe(502);
    const failure = await response.json();
    expect(failure.task_id).toBe("task_mesh");
    expect(failure.error).toContain("Tripo task: task_mesh.");
    expect(JSON.stringify(failure)).not.toContain("private");
    expect(
      request.mock.calls.filter(([url]) => String(url).includes("/animations/"))
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
    const response = await post(app, rigInput);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({
      glb: { base64: GLB.toString("base64") },
      task: { id: "task_mesh" },
    });
    expect(result).not.toHaveProperty("stored_media");
    expect(JSON.stringify(result)).not.toContain("private-store-path-or-key");
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      "[grida-agent] generated media could not be saved"
    );
    expect(save).toHaveBeenCalledOnce();
    expect(
      request.mock.calls.filter(([url]) => String(url).includes("/animations/"))
    ).toHaveLength(1);
  });
  it("retains the paid task if the post-generation persistence adapter unexpectedly rejects", async () => {
    const save = vi
      .spyOn(GeneratedMediaPersistence, "save")
      .mockRejectedValueOnce(new Error("private-store-path-or-key"));
    const { app, request } = setup();
    const response = await post(app, rigInput);
    expect(response.status).toBe(502);
    const failure = await response.json();
    expect(failure).toMatchObject({
      code: "generation_failed",
      task_id: "task_mesh",
    });
    expect(failure.error).toContain("Tripo task: task_mesh.");
    expect(JSON.stringify(failure)).not.toContain("private-store-path-or-key");
    expect(save).toHaveBeenCalledOnce();
    expect(
      request.mock.calls.filter(([url]) => String(url).includes("/animations/"))
    ).toHaveLength(1);
  });
  it("holds one shared check/rig memory reservation through persistence", async () => {
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { app } = setup({
      media: {
        save: async () => {
          entered();
          await held;
          return undefined;
        },
      } as unknown as MediaPersistence,
    });
    const first = post(app, rigInput);
    await started;
    expect((await post(app, checkInput, "/rigging/check")).status).toBe(429);
    release();
    expect((await first).status).toBe(200);
    expect((await post(app, checkInput, "/rigging/check")).status).toBe(200);
  });
  it("refuses oversized wire bodies before keys and releases the reservation", async () => {
    const { app, get } = setup();
    const response = await app.request("/rigging/check", {
      method: "POST",
      headers: {
        "content-length": String(
          Math.ceil(RiggingClient.max_mesh_bytes / 3) * 4 + 4097
        ),
      },
      body: "{}",
    });
    expect(response.status).toBe(413);
    expect(get).not.toHaveBeenCalled();
    expect((await post(app, checkInput, "/rigging/check")).status).toBe(200);
  });
});
