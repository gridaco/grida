// GRIDA-GG: gateway — synthetic provider responses through the real SDK and billing seam.
// GRIDA-SEC-003 / GRIDA-SEC-006 — no live credentials, requests, or billing calls.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderHttp } from "@grida/ai";

const transport = vi.hoisted(() => ({
  create: vi.fn<(key: string) => ProviderHttp>(),
  request: vi.fn<typeof fetch>(),
  download: vi.fn<typeof fetch>(),
}));
vi.mock("../gg-three-d-http", () => ({
  GgThreeDHttp: { create: transport.create },
}));
vi.mock("replicate", () => ({ default: class {} }));
vi.mock("@/lib/billing/metronome", () => ({
  getEntitlement: vi.fn<(...args: never[]) => unknown>(),
  ingestUsageEvent: vi.fn<(...args: never[]) => unknown>(),
  refreshBalance: vi.fn<(...args: never[]) => unknown>(),
  BillingMetronomeError: class extends Error {
    constructor(
      message: string,
      readonly code: string,
      readonly status = 500
    ) {
      super(message);
    }
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createLibraryClient: vi.fn<(...args: never[]) => unknown>(),
}));
vi.mock("@/lib/auth/organization", () => ({
  requireOrganizationId: vi.fn<(...args: never[]) => unknown>(),
}));
import { getEntitlement, ingestUsageEvent } from "@/lib/billing/metronome";
import { requireOrganizationId } from "@/lib/auth/organization";
import { GgThreeD } from "../gg-three-d";

const task_id = "task_synthetic";
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
function task(
  type: string,
  credits: number | undefined = 25,
  output: unknown = {
    model_url: "https://cdn.tripo3d.ai/model.glb?signature=synthetic",
  }
) {
  transport.request.mockImplementation(async (url) =>
    Response.json({
      code: 0,
      data: String(url).includes("/tasks/")
        ? {
            task_id,
            type,
            status: "success",
            ...(credits === undefined ? {} : { credits_consumed: credits }),
            output,
          }
        : { task_id },
    })
  );
}
function charged(mills: number) {
  expect(ingestUsageEvent).toHaveBeenCalledExactlyOnceWith(7, mills, {
    transactionId: expect.any(String),
  });
  expect(requireOrganizationId).not.toHaveBeenCalled();
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
  vi.mocked(ingestUsageEvent).mockResolvedValue({
    transactionId: "synthetic-ingest",
  });
  transport.create.mockImplementation(
    () =>
      new ProviderHttp({
        request: transport.request,
        download: transport.download,
      })
  );
  transport.download.mockImplementation(async () => new Response(glb()));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GgThreeD metered execution", () => {
  it("requires the verified organization gate before provider work, regardless of BYOK", async () => {
    vi.mocked(getEntitlement).mockResolvedValue({
      allowed: false,
      reason: "no_balance",
      cachedBalanceCents: 0,
      cachedAt: null,
    });
    await expect(
      GgThreeD.modelGenerate(7, "tripo/h3.1", "text", { prompt: "chair" })
    ).rejects.toMatchObject({ status: 402 });
    expect(transport.create).not.toHaveBeenCalled();
    expect(ingestUsageEvent).not.toHaveBeenCalled();
    await expect(GgThreeD.check(0, { mesh })).rejects.toMatchObject({
      code: "missing_organization_id",
    });
    expect(transport.request).not.toHaveBeenCalled();
  });
  it.each([undefined, "", "   "])(
    "fails closed when the GG key is %s despite unprefixed and BYOK keys",
    async (key) => {
      vi.stubEnv("GG_TRIPO_API_KEY", key);
      await expect(GgThreeD.check(7, { mesh })).rejects.toMatchObject({
        code: "provider_unavailable",
        status: 503,
      });
      expect(getEntitlement).toHaveBeenCalledWith(7);
      expect(transport.create).not.toHaveBeenCalled();
      expect(ingestUsageEvent).not.toHaveBeenCalled();
    }
  );
  it.each(["text", "image", "multiview"] as const)(
    "bills actual %s generation usage and submits exactly once with the GG key",
    async (variant) => {
      task(`${variant}_to_model`, 20.5);
      const input =
        variant === "text"
          ? { prompt: "chair" }
          : variant === "image"
            ? { image }
            : { images: { front: image, back: image } };
      const result = await GgThreeD.modelGenerate(
        7,
        "tripo/h3.1",
        variant,
        input
      );
      expect(result.glb.data).toEqual(glb());
      charged(205);
      expect(transport.create).toHaveBeenCalledExactlyOnceWith(
        "synthetic-gg-key"
      );
      expect(
        transport.request.mock.calls.filter(
          ([, init]) => init?.method === "POST"
        )
      ).toHaveLength(1);
      expect(
        transport.request.mock.calls.every(
          ([url]) => !String(url).endsWith("/files")
        )
      ).toBe(true);
      expect(
        transport.request.mock.calls.every(
          ([, init]) =>
            new Headers(init?.headers).get("authorization") ===
            "Bearer synthetic-gg-key"
        )
      ).toBe(true);
    }
  );
  it("meters an actual zero-credit eligibility receipt without starting rigging", async () => {
    task("animate_prerigcheck", 0, { riggable: true, rig_type: "biped" });
    await expect(GgThreeD.check(7, { mesh })).resolves.toMatchObject({
      riggable: true,
      rig_type: "biped",
    });
    charged(0);
    expect(transport.download).not.toHaveBeenCalled();
    expect(String(transport.request.mock.calls[0]![0])).toMatch(
      /\/animations\/rig-check$/
    );
  });
  it("bills rigging from the actual receipt instead of the estimate", async () => {
    task("animate_rig", 30);
    await GgThreeD.rig(7, "tripo/rig-v1.0", {
      mesh,
      rig_type: "biped",
      spec: "tripo",
    });
    charged(300);
    expect(
      JSON.parse(transport.request.mock.calls[0]![1]!.body as string)
    ).toEqual({
      input: mesh.file_token,
      model: "v1.0-20240301",
      rig_type: "biped",
      spec: "tripo",
      out_format: "glb",
    });
  });
  it.each(["download", "invalid_glb", "untrusted_url"] as const)(
    "bills completed usage before surfacing %s failure; never resubmits",
    async (failure) => {
      task("animate_rig", 25, {
        model_url:
          failure === "untrusted_url"
            ? "https://localhost/private"
            : "https://cdn.tripo3d.ai/model.glb",
      });
      if (failure === "download")
        transport.download.mockRejectedValue(
          new Error("secret signed URL and provider error")
        );
      if (failure === "invalid_glb")
        transport.download.mockResolvedValue(new Response("not a glb"));
      const caught = await GgThreeD.rig(7, "tripo/rig-v1.0", {
        mesh,
        rig_type: "biped",
        spec: "mixamo",
      }).catch((error: GgThreeD.Failure) => error);
      expect(caught).toBeInstanceOf(GgThreeD.Failure);
      expect(JSON.stringify(caught)).not.toContain("secret");
      expect(caught).toMatchObject({ task_id });
      charged(250);
      expect(
        transport.request.mock.calls.filter(
          ([, init]) => init?.method === "POST"
        )
      ).toHaveLength(1);
    }
  );
  it("rejects missing completion usage and logs only reconciliation identifiers", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    task("text_to_model");
    transport.request.mockImplementation(async (url) =>
      Response.json({
        code: 0,
        data: String(url).includes("/tasks/")
          ? {
              task_id,
              type: "text_to_model",
              status: "success",
              output: { model_url: "https://cdn.tripo3d.ai/model.glb" },
            }
          : { task_id },
      })
    );
    await expect(
      GgThreeD.modelGenerate(7, "tripo/h3.1", "text", {
        prompt: "sensitive prompt",
      })
    ).rejects.toMatchObject({ code: "usage_unavailable", task_id });
    expect(ingestUsageEvent).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledExactlyOnceWith(
      "[gg-three-d] usage_reconciliation_required",
      {
        organizationId: 7,
        model_id: "tripo/h3.1",
        feature: "v1/ai/3d/model-generation",
        transactionId: expect.any(String),
        task_id,
      }
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("sensitive");
  });
  it("bills an observed paid completion even when cancellation interrupts its download", async () => {
    task("text_to_model", 20);
    const controller = new AbortController();
    transport.download.mockImplementation(async () => {
      controller.abort();
      return new Response(glb());
    });
    await expect(
      GgThreeD.modelGenerate(7, "tripo/h3.1", "text", {
        prompt: "chair",
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ code: "aborted", task_id });
    charged(200);
    expect(
      transport.request.mock.calls.filter(([, init]) => init?.method === "POST")
    ).toHaveLength(1);
  });
  it("does not invent a charge or resubmit an accepted task without observed success", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    transport.request.mockImplementation(async (url) =>
      Response.json({
        code: 0,
        data: String(url).includes("/tasks/")
          ? { task_id, type: "text_to_model", status: "failed" }
          : { task_id },
      })
    );
    await expect(
      GgThreeD.modelGenerate(7, "tripo/h3.1", "text", { prompt: "chair" })
    ).rejects.toMatchObject({ code: "generation_failed", task_id });
    expect(ingestUsageEvent).not.toHaveBeenCalled();
    expect(
      transport.request.mock.calls.filter(([, init]) => init?.method === "POST")
    ).toHaveLength(1);
    expect(log).toHaveBeenCalledOnce();
  });
  it("maps production credential rejection without charging or leaking a BYOK instruction", async () => {
    transport.request.mockResolvedValue(
      new Response("private upstream response", { status: 401 })
    );
    await expect(GgThreeD.check(7, { mesh })).rejects.toMatchObject({
      code: "provider_unavailable",
    });
    expect(ingestUsageEvent).not.toHaveBeenCalled();
  });
  it("rejects unknown models, incompatible controls and unsigned URL inputs without submission", async () => {
    await expect(
      GgThreeD.rig(7, "tripo/unknown", { mesh })
    ).rejects.toMatchObject({ code: "model_unavailable" });
    await expect(
      GgThreeD.rig(7, "tripo/rig-v2.5", {
        mesh,
        rig_type: "biped",
        spec: "tripo",
      })
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      GgThreeD.modelGenerate(7, "tripo/p1", "image", {
        image: { url: "https://private.example/asset" },
      })
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(transport.request).not.toHaveBeenCalled();
    expect(ingestUsageEvent).not.toHaveBeenCalled();
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
    expect(ingestUsageEvent).not.toHaveBeenCalled();
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
