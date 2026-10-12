// GRIDA-GG: gateway — synthetic provider responses through the real SDK and billing seam.
// GRIDA-SEC-003 / GRIDA-SEC-006 — no live credentials, requests, or billing calls.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderHttp } from "@grida/ai";

const transport = vi.hoisted(() => ({
  create: vi.fn<(key: string) => ProviderHttp>(),
  request: vi.fn<typeof fetch>(),
  download: vi.fn<typeof fetch>(),
  asset: vi.fn<(...args: unknown[]) => Promise<{ data: Uint8Array }>>(),
  submit: vi.fn<typeof import("../gateway-product").gatewayFetch>(),
  wait: vi.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>(),
}));
vi.mock("../gg-three-d-http", () => ({
  GgThreeDHttp: {
    create: transport.create,
    productAssets: () => ({ downloadProviderAsset: transport.asset }),
  },
}));
vi.mock("../gateway-product", async (original) => ({
  ...(await original<typeof import("../gateway-product")>()),
  gatewayFetch: transport.submit,
  gatewayWait: transport.wait,
}));
vi.mock("replicate", () => ({ default: class {} }));
const billing = vi.hoisted(() => ({
  entitlement: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  begin: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  complete: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock("@/lib/platform/product-consumer", () => ({
  platformProductBilling: () => billing,
}));
vi.mock("@/lib/supabase/server", () => ({
  createLibraryClient: vi.fn<(...args: never[]) => unknown>(),
}));
vi.mock("@/lib/auth/organization", () => ({
  requireOrganizationId: vi.fn<(...args: never[]) => unknown>(),
}));
import { ProductBillingError } from "@/lib/platform/product-billing";
const getEntitlement = billing.entitlement;
const completion = billing.complete;
import { GgThreeD } from "../gg-three-d";

const image = { file_token: "file_synthetic_image", media_type: "image/png" };
const mesh = {
  file_token: "file_synthetic_mesh",
  media_type: "model/gltf-binary",
};
// Minimal synthetic self-contained GLB, no external asset or provider fixture.
function glb() {
  const json = '{"asset":{"version":"2.0"}}';
  const document = new TextEncoder().encode(
    json.padEnd(Math.ceil(json.length / 4) * 4, " ")
  );
  const buffer = new Uint8Array(20 + document.length);
  const view = new DataView(buffer.buffer);
  [0x46546c67, 2, buffer.length, document.length, 0x4e4f534a].forEach(
    (value, index) => view.setUint32(index * 4, value, true)
  );
  buffer.set(document, 20);
  return buffer;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("GG_TRIPO_API_KEY", "synthetic-gg-key");
  vi.stubEnv("BYOK_TRIPO_API_KEY", "synthetic-byok-key-never-used");
  vi.stubEnv("TRIPO_API_KEY", "synthetic-unprefixed-key-never-used");
  vi.mocked(getEntitlement).mockResolvedValue({
    allowed: true,
    cachedBalanceCents: 10000,
    cachedAt: null,
  });
  billing.begin.mockImplementation(async (context) => {
    const decision = (await billing.entitlement(
      (context as { organizationId: number }).organizationId
    )) as { allowed: boolean };
    if (!decision.allowed) throw new ProductBillingError("blocked");
    return { id: "execution-synthetic", claim: {} };
  });
  billing.complete.mockResolvedValue(undefined);
  transport.create.mockImplementation(
    () =>
      new ProviderHttp({
        request: transport.request,
        download: transport.download,
      })
  );
  transport.submit.mockResolvedValue(Response.json({ id: "req_synthetic" }));
  transport.wait.mockResolvedValue({
    id: "req_synthetic",
    result: { glb: { url: "https://cdn.tripo3d.ai/result.glb" } },
  });
  transport.asset.mockResolvedValue({ data: glb() });
  transport.download.mockImplementation(async () => new Response(glb()));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GgThreeD GG execution", () => {
  it.each(["text", "image", "multiview"] as const)(
    "routes %s to GG with product-owned upload references",
    async (variant) => {
      const input =
        variant === "text"
          ? { prompt: "chair" }
          : variant === "image"
            ? { image }
            : { images: { front: image, left: image } };
      const value = await GgThreeD.modelGenerate(
        7,
        "tripo/h3.1",
        variant,
        input
      );
      expect(value.glb.data).toEqual(glb());
      expect(value.task.id).toBe("task_synthetic");
      const [ctx, path, init] = transport.submit.mock.calls[0];
      expect(ctx.organizationId).toBe(7);
      expect(path).toBe(`/v1/endpoints/three-d.tripo.h3.1.${variant}`);
      const body = JSON.parse(String(init?.body));
      if (variant === "image")
        expect(body.image).toEqual({
          url: "https://grida-upload.invalid/file_synthetic_image",
          media_type: "image/png",
        });
      expect(billing.begin).not.toHaveBeenCalled();
      expect(completion).not.toHaveBeenCalled();
      expect(transport.request).not.toHaveBeenCalled();
    }
  );
  it("returns structured rig-check without an asset download", async () => {
    transport.wait.mockResolvedValue({
      id: "req_check",
      result: { riggable: true, rig_type: "biped" },
    });
    expect(await GgThreeD.check(7, { mesh })).toEqual({
      riggable: true,
      rig_type: "biped",
      task: { id: "task_check" },
    });
    expect(transport.asset).not.toHaveBeenCalled();
    expect(completion).not.toHaveBeenCalled();
  });
  it.each(["tripo/rig-v1.0", "tripo/rig-v2.5"])(
    "routes %s rigging through GG",
    async (model) => {
      await GgThreeD.rig(7, model, {
        mesh,
        rig_type: model.endsWith("1.0") ? "biped" : "quadruped",
        spec: "tripo",
      });
      expect(transport.submit.mock.calls[0][1]).toBe(
        `/v1/endpoints/three-d.${model.replace("/", ".")}.mesh`
      );
      expect(completion).not.toHaveBeenCalled();
    }
  );
  it("rejects malformed upload tokens before any execution", async () => {
    await expect(
      GgThreeD.modelGenerate(7, "tripo/h3.1", "image", {
        image: { file_token: "file_bad?query=1", media_type: "image/png" },
      })
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(transport.submit).not.toHaveBeenCalled();
  });
  it("preserves shared-credit denial, without native admission or redispatch", async () => {
    transport.submit.mockRejectedValue(new ProductBillingError("blocked"));
    await expect(
      GgThreeD.modelGenerate(7, "tripo/h3.1", "text", { prompt: "chair" })
    ).rejects.toMatchObject({ status: 402 });
    expect(transport.wait).not.toHaveBeenCalled();
    expect(completion).not.toHaveBeenCalled();
  });
  it("download failure retains the original GG identity without redispatch", async () => {
    transport.asset.mockRejectedValue(new Error("download failed"));
    await expect(
      GgThreeD.modelGenerate(7, "tripo/h3.1", "text", { prompt: "chair" })
    ).rejects.toMatchObject({
      code: "invalid_response",
      task_id: "req_synthetic",
    });
    expect(transport.submit).toHaveBeenCalledTimes(1);
    expect(completion).not.toHaveBeenCalled();
  });
});

describe("GgThreeD.preparePresign", () => {
  it("gates the free fixed upload preparation and returns only the verified reference", async () => {
    transport.request.mockResolvedValue(
      Response.json({
        code: 0,
        data: {
          presigned_url:
            "https://tripo-data.s3.us-west-2.amazonaws.com/synthetic?signature=synthetic",
          file_token: "file_synthetic",
          expires_in: 1800,
        },
      })
    );
    await expect(
      GgThreeD.preparePresign(7, "model/gltf-binary")
    ).resolves.toEqual({
      upload_url:
        "https://tripo-data.s3.us-west-2.amazonaws.com/synthetic?signature=synthetic",
      file_token: "file_synthetic",
      expires_in: 1800,
    });
    expect(transport.request).toHaveBeenCalledWith(
      "https://openapi.tripo3d.ai/v3/files/presign",
      expect.objectContaining({
        body: '{"format":"glb"}',
        method: "POST",
        redirect: "error",
      })
    );
    expect(getEntitlement).toHaveBeenCalledWith(7);
    expect(completion).not.toHaveBeenCalled();
  });
  it.each([
    "https://private.example/file",
    "https://tripo-data.s3.us-west-2.amazonaws.com.evil.example/file",
    "http://tripo-data.s3.us-west-2.amazonaws.com/file",
  ])("rejects presign host %s", async (url) => {
    transport.request.mockResolvedValue(
      Response.json({
        code: 0,
        data: {
          presigned_url: url,
          file_token: "file_synthetic",
          expires_in: 1800,
        },
      })
    );
    await expect(GgThreeD.preparePresign(7, "image/png")).rejects.toMatchObject(
      { code: "invalid_response" }
    );
  });
  it("rejects oversized upload-preparation responses", async () => {
    transport.request.mockResolvedValue(new Response("x".repeat(70_000)));
    await expect(
      GgThreeD.preparePresign(7, "image/jpeg")
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});
