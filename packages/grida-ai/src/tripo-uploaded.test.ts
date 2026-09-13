// GRIDA-SEC-004 — authorized uploaded tokens and observed-completion receipts.
import { describe, expect, it, vi } from "vitest";
import { ProviderHttp, RiggingClient, TripoClient } from "./index";

const task = { id: "task_completed", credits_consumed: 25 };
const file_token = "file_authorized";
const image = { file_token, media_type: "image/png" } as const;
const mesh = { file_token, media_type: "model/gltf-binary" } as const;
const selected = {
  feature: "model-generation",
  model_id: "tripo/h3.1",
  variant: "image",
  provider: "tripo",
} as const;
const rig = {
  feature: "rigging",
  model_id: "tripo/rig-v1.0",
  provider: "tripo",
} as const;

function setup(
  type = "image_to_model",
  output: unknown = { model_url: "https://cdn.tripo3d.ai/mesh.glb" }
) {
  const get = vi.fn<() => string>(() => "synthetic-key");
  const request = vi.fn<typeof fetch>(async (url) =>
    Response.json({
      code: 0,
      data: String(url).includes("/tasks/")
        ? {
            task_id: task.id,
            type,
            status: "success",
            credits_consumed: task.credits_consumed,
            output,
          }
        : { task_id: task.id },
    })
  );
  const download = vi.fn<typeof fetch>(async () => {
    throw new Error("private download failure");
  });
  const http = new ProviderHttp({ request, download });
  return {
    get,
    request,
    download,
    http,
    client: new TripoClient({ keys: { get }, http }),
    rigging: new RiggingClient({ keys: { get }, http }),
  };
}

describe("authorized uploaded Tripo inputs", () => {
  it("submits a validated uploaded image once without uploading it again", async () => {
    const { client, request } = setup();
    const result = await (
      await client.resolve(selected)
    )
      .generateUploaded({ image, texture: false, seed: 0 })
      .catch((error) => error);
    expect(JSON.parse(request.mock.calls[0]![1]!.body as string)).toMatchObject(
      { input: file_token, texture: false, pbr: false, model_seed: 0 }
    );
    expect(
      request.mock.calls.filter(([, init]) => init?.method === "POST")
    ).toHaveLength(1);
    expect(result).toMatchObject({
      code: "generation_failed",
      task_id: task.id,
      completed_task: task,
    });
    expect(Object.isFrozen(result.completed_task)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("preserves explicit multiview labels", async () => {
    const { client, request } = setup("multiview_to_model");
    await (
      await client.resolve({ ...selected, variant: "multiview" })
    )
      .generateUploaded({ images: { front: image, right: image } })
      .catch(() => undefined);
    expect(
      JSON.parse(request.mock.calls[0]![1]!.body as string).inputs
    ).toEqual([{ front: file_token }, { right: file_token }]);
  });
  it.each([
    { image: { ...image, file_token: "https://attacker.invalid/file" } },
    { image: { ...image, file_token: "../file" } },
    { image: { ...image, media_type: "image/webp" } },
    { image, texture: false, pbr: true },
    { image, face_limit: 1_500_001 },
  ])(
    "refuses unsupported uploaded inputs before reading authority",
    async (input) => {
      const { client, get, request } = setup();
      const operation = await client.resolve(selected);
      get.mockClear();
      await expect(
        operation.generateUploaded(input as never)
      ).rejects.toMatchObject({ code: "invalid_input" });
      expect(get).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    }
  );
  it("does not admit upload references through the normal byte-input method", async () => {
    const { client, request } = setup();
    await expect(
      (await client.resolve(selected)).generate({ image } as never)
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(request).not.toHaveBeenCalled();
  });
  it("uses uploaded meshes for separate eligibility and rigging operations", async () => {
    const check = setup("rig_check", { riggable: true, rig_type: "biped" });
    expect(
      await (
        await check.rigging.resolve({ feature: "rig-check", provider: "tripo" })
      ).checkUploaded({ mesh })
    ).toEqual({ riggable: true, rig_type: "biped", task });
    expect(check.request.mock.calls).toHaveLength(2);
    const generated = setup("rig");
    await expect(
      (await generated.rigging.resolve(rig)).generateUploaded({
        mesh,
        rig_type: "biped",
        spec: "mixamo",
      })
    ).rejects.toMatchObject({ task_id: task.id, completed_task: task });
    expect(generated.request.mock.calls).toHaveLength(2);
  });
});

describe("observed provider completion", () => {
  it.each(["generation", "rigging", "rig-check"])(
    "retains completion when %s output validation fails",
    async (feature) => {
      const { client, rigging } = setup(
        feature === "generation"
          ? "image_to_model"
          : feature === "rigging"
            ? "rig"
            : "rig_check",
        null
      );
      const operation =
        feature === "generation"
          ? (await client.resolve(selected)).generateUploaded({ image })
          : feature === "rigging"
            ? (await rigging.resolve(rig)).generateUploaded({
                mesh,
                rig_type: "biped",
                spec: "tripo",
              })
            : (
                await rigging.resolve({
                  feature: "rig-check",
                  provider: "tripo",
                })
              ).checkUploaded({ mesh });
      await expect(operation).rejects.toMatchObject({
        code: "invalid_response",
        completed_task: task,
      });
    }
  );
  it("does not turn mere task acceptance into observed paid completion", async () => {
    const { client, request } = setup();
    request
      .mockResolvedValueOnce(
        Response.json({ code: 0, data: { task_id: task.id } })
      )
      .mockRejectedValueOnce(new Error("poll failed"));
    const error = await (
      await client.resolve(selected)
    )
      .generateUploaded({ image })
      .catch((error) => error);
    expect(error.task_id).toBe(task.id);
    expect(error.completed_task).toBeUndefined();
  });
  it("retains completion when cancellation interrupts the result download", async () => {
    const { client, download } = setup();
    const cancellation = new AbortController();
    download.mockImplementation(async () => {
      cancellation.abort();
      return new Promise(() => {});
    });
    await expect(
      (await client.resolve(selected)).generateUploaded({
        image,
        signal: cancellation.signal,
      })
    ).rejects.toMatchObject({ code: "aborted", completed_task: task });
  });
});
