// GRIDA-SEC-004 / GRIDA-SEC-006 — scoped GG routing never grants upload credentials or retries.
// GRIDA-GG: provider — independent funded 3D operation contract.
import { describe, expect, it, vi } from "vitest";
import {
  MediaOperations,
  ProviderHttp,
  RiggingClient,
  RiggingOperations,
  TripoClient,
} from "./index";

const origin = "https://gg.example";
const uploadUrl =
  "https://tripo-data.s3.us-west-2.amazonaws.com/authorized/mesh.glb?X-Amz-Signature=signed";
const task = { id: "task_funded", credits_consumed: 25 };
function glb() {
  const json = new TextEncoder().encode('{"asset":{"version":"2.0"}} ');
  const data = new Uint8Array(20 + json.length);
  const view = new DataView(data.buffer);
  [0x46546c67, 2, data.length, json.length, 0x4e4f534a].forEach((n, i) =>
    view.setUint32(i * 4, n, true)
  );
  data.set(json, 20);
  return data;
}
const image = {
  data: new Uint8Array([1, 2, 3]),
  media_type: "image/png",
} as const;
const mesh = { data: glb(), media_type: "model/gltf-binary" } as const;
const selection = {
  feature: "model-generation",
  model_id: "tripo/h3.1",
  provider: "gg",
  variant: "text",
} as const;
function setup() {
  let token: string | null = "scoped-gg-token";
  const get = vi.fn<() => string>(() => "synthetic-tripo-key");
  const gg = { getAccessToken: vi.fn<() => string | null>(() => token) };
  const request = vi.fn<typeof fetch>(async (url, init) => {
    if (init?.method === "PUT") return new Response(null, { status: 200 });
    const input = JSON.parse(init?.body as string);
    if (String(url).endsWith("/uploads"))
      return Response.json({
        upload_url: uploadUrl,
        upload: "signed-upload-reference",
      });
    if (String(url).endsWith("/rig-check"))
      return Response.json({
        feature: "rig-check",
        provider_id: "gg",
        riggable: true,
        rig_type: "biped",
        task,
      });
    return Response.json({
      feature: String(url).endsWith("/rigging")
        ? "rigging"
        : "model-generation",
      provider_id: "gg",
      model_id: input.model_id,
      variant: input.variant,
      glb: {
        base64: btoa(String.fromCharCode(...glb())),
        media_type: "model/gltf-binary",
      },
      task,
    });
  });
  const download = vi.fn<typeof fetch>(async () => {
    throw new Error("No result downloads");
  });
  const options = {
    keys: { get },
    http: new ProviderHttp({ request, download }),
    gg,
    gg_base_url: origin,
  };
  return {
    request,
    download,
    get,
    gg,
    setToken: (value: string | null) => {
      token = value;
    },
    tripo: new TripoClient(options),
    rigging: new RiggingClient(options),
  };
}

describe("funded Tripo model generation", () => {
  for (const model_id of ["tripo/h3.1", "tripo/p1", "tripo/p2"] as const) {
    it.each(["text", "image", "multiview"] as const)(
      `${model_id} supports %s without BYOK authority`,
      async (variant) => {
        const { tripo, request, get, download } = setup();
        const operation = await tripo.resolve({
          ...selection,
          model_id,
          variant,
        });
        expect(operation.provider_id).toBe("gg");
        const input =
          variant === "text"
            ? { prompt: " robot " }
            : variant === "image"
              ? { image }
              : { images: { front: image, back: image } };
        const result = await operation.generate(input as never);
        expect(result).toEqual({ glb: mesh, task });
        expect(get).not.toHaveBeenCalled();
        expect(download).not.toHaveBeenCalled();
        const paid = request.mock.calls.filter(([url]) =>
          String(url).endsWith("/model-generation")
        );
        expect(paid).toHaveLength(1);
        expect(JSON.parse(paid[0]![1]!.body as string).input).toEqual(
          variant === "text"
            ? { prompt: "robot" }
            : variant === "image"
              ? { image: { upload: "signed-upload-reference" } }
              : {
                  images: {
                    front: { upload: "signed-upload-reference" },
                    back: { upload: "signed-upload-reference" },
                  },
                }
        );
        for (const [url, init] of request.mock.calls) {
          const headers = new Headers(init?.headers);
          expect(init?.credentials).toBe("omit");
          expect(init?.redirect).toBe("error");
          const hosted = String(url).startsWith(origin);
          expect(headers.get("authorization")).toBe(
            hosted ? "Bearer scoped-gg-token" : null
          );
        }
        for (const [url, init] of request.mock.calls.filter(
          ([url]) => !String(url).startsWith(origin)
        )) {
          const headers = new Headers(init?.headers);
          expect(String(url)).toBe(uploadUrl);
          expect(init?.method).toBe("PUT");
          expect(headers.has("authorization")).toBe(false);
          expect(headers.get("content-type")).toBe("application/octet-stream");
          expect(init?.body).toEqual(image.data);
        }
      }
    );
  }
  it("re-reads the scoped token after upload and refuses a cleared session before paid work", async () => {
    const state = setup();
    const original = state.request.getMockImplementation()!;
    state.request.mockImplementation(async (...args) => {
      const response = await original(...args);
      if (args[1]?.method === "PUT") state.setToken(null);
      return response;
    });
    const operation = await state.tripo.resolve({
      ...selection,
      variant: "image",
    });
    await expect(operation.generate({ image })).rejects.toMatchObject({
      code: "gg_token_expired",
    });
    expect(
      state.request.mock.calls.some(([url]) =>
        String(url).endsWith("/model-generation")
      )
    ).toBe(false);
    expect(state.get).not.toHaveBeenCalled();
  });
  it.each([
    "https://evil.invalid/file",
    "https://tripo-data.s3.us-west-2.amazonaws.com.evil.invalid/file",
    "http://tripo-data.s3.us-west-2.amazonaws.com/file",
    "https://user:secret@tripo-data.s3.us-west-2.amazonaws.com/file",
  ])("rejects a changed upload destination: %s", async (upload_url) => {
    const { tripo, request } = setup();
    request.mockResolvedValueOnce(
      Response.json({ upload_url, upload: "signed" })
    );
    await expect(
      (await tripo.resolve({ ...selection, variant: "image" })).generate({
        image,
      })
    ).rejects.toMatchObject({ code: "invalid_response" });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([
    [401, "gg_token_expired"],
    [402, "insufficient_credits"],
  ] as const)(
    "maps HTTP %s without retry or raw body exposure",
    async (status, code) => {
      const { tripo, request } = setup();
      request.mockResolvedValueOnce(
        new Response("private-provider-data", { status })
      );
      const error = await (
        await tripo.resolve(selection)
      )
        .generate({ prompt: "robot" })
        .catch((error) => error);
      expect(error.code).toBe(code);
      expect(JSON.stringify(error)).not.toContain("private");
      expect(request).toHaveBeenCalledTimes(1);
    }
  );
  it.each(["generation_failed", "usage_unavailable", "unknown_failure"])(
    "preserves accepted task identity for %s",
    async (code) => {
      const { tripo, request } = setup();
      request.mockResolvedValueOnce(
        Response.json(
          { error: { code, message: "private-details", task_id: task.id } },
          { status: 502 }
        )
      );
      const error = await (
        await tripo.resolve(selection)
      )
        .generate({ prompt: "robot" })
        .catch((error) => error);
      expect(error).toMatchObject({
        code: "generation_failed",
        task_id: task.id,
      });
      expect(JSON.stringify(error)).not.toContain("private");
      expect(request).toHaveBeenCalledTimes(1);
    }
  );
  it.each([undefined, -1, null])(
    "preserves accepted identity when GG usage is invalid: %s",
    async (credits) => {
      const state = setup();
      state.request.mockResolvedValueOnce(
        Response.json({
          feature: "model-generation",
          provider_id: "gg",
          model_id: selection.model_id,
          variant: selection.variant,
          task: { id: task.id, credits_consumed: credits },
          glb: { base64: "invalid", media_type: "model/gltf-binary" },
        })
      );
      const error = await (
        await state.tripo.resolve(selection)
      )
        .generate({ prompt: "robot" })
        .catch((error) => error);
      expect(error).toMatchObject({
        code: "invalid_response",
        task_id: task.id,
      });
      expect(error.completed_task).toBeUndefined();
      expect(state.request).toHaveBeenCalledTimes(1);
    }
  );
  it("keeps explicit BYOK independent from a connected GG session", async () => {
    const state = setup();
    await state.tripo.resolve({ ...selection, provider: "tripo" });
    expect(state.get).toHaveBeenCalledWith("tripo");
    expect(state.gg.getAccessToken).not.toHaveBeenCalled();
  });
  it("rejects uploaded-token authority on the GG lane", async () => {
    const state = setup();
    await expect(
      (
        await state.tripo.resolve({ ...selection, variant: "image" })
      ).generateUploaded({
        image: { file_token: "file_unsafe", media_type: "image/png" },
      })
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(state.request).not.toHaveBeenCalled();
  });
});

describe("funded mesh operations and discovery", () => {
  it("returns structured eligibility and portable rigged output separately", async () => {
    const { rigging, get } = setup();
    expect(
      await (
        await rigging.resolve({ feature: "rig-check", provider: "gg" })
      ).check({ mesh })
    ).toEqual({ riggable: true, rig_type: "biped", task });
    expect(
      await (
        await rigging.resolve({
          feature: "rigging",
          provider: "gg",
          model_id: "tripo/rig-v1.0",
        })
      ).generate({ mesh, rig_type: "biped", spec: "mixamo" })
    ).toEqual({ glb: mesh, task });
    expect(get).not.toHaveBeenCalled();
  });
  it("discovers funded routes with unchanged byte schemas and exact selectors", () => {
    const operations = new MediaOperations();
    expect(operations.list({ kind: "three-d", provider: "gg" })).toHaveLength(
      9
    );
    expect(
      operations.parseInput(
        { kind: "three-d", ...selection },
        { prompt: "robot" }
      )
    ).toMatchObject({ provider_id: "gg", selection: { provider: "gg" } });
    const rigging = new RiggingOperations();
    expect(rigging.list({ provider: "gg" })).toHaveLength(3);
    const selector = { feature: "rig-check", provider: "gg" } as const;
    expect(
      rigging.parseInput(selector, {
        mesh: {
          data: btoa(String.fromCharCode(...glb())),
          media_type: mesh.media_type,
        },
      })
    ).toMatchObject({ provider_id: "gg", selection: selector });
  });
});
