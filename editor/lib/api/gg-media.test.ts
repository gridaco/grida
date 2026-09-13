// GRIDA-SEC-006 / GRIDA-SEC-012
// GRIDA-GG: gateway — fixed authentication, upload ownership and bounded streaming contracts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ggMediaApi } from "./gg-media";
import { gg } from "../gg/gg";
import { ggUploads } from "../gg/uploads";
import { GgThreeD } from "../ai/gg-three-d";
import type { allowAiRequest } from "../ai/openai-compat/limits";

const mocks = vi.hoisted(() => ({
  presign: vi.fn<typeof GgThreeD.preparePresign>(),
  generate: vi.fn<typeof GgThreeD.modelGenerate>(),
  check: vi.fn<typeof GgThreeD.check>(),
  rig: vi.fn<typeof GgThreeD.rig>(),
  limit: vi.fn<typeof allowAiRequest>(),
}));
vi.mock("../ai/gg-three-d", () => ({
  GgThreeD: {
    preparePresign: mocks.presign,
    modelGenerate: mocks.generate,
    check: mocks.check,
    rig: mocks.rig,
    Failure: class extends Error {
      constructor(
        readonly code: string,
        readonly task_id?: string
      ) {
        super(code);
      }
    },
  },
}));
vi.mock("../ai/openai-compat/limits", () => ({ allowAiRequest: mocks.limit }));

const owner = { sub: "user-alpha", org: 41 };
const prefix = "https://grida.co/api/v1/ai/3d/";
let bearer: string;
const operations = {
  uploads: ggMediaApi.bind("gg.3d.uploads"),
  "model-generation": ggMediaApi.bind("gg.3d.model-generation"),
  "rig-check": ggMediaApi.bind("gg.3d.rig-check"),
  rigging: ggMediaApi.bind("gg.3d.rigging"),
};
type Feature = keyof typeof operations;
function request(
  feature: Feature,
  input: unknown,
  token: string | null = bearer,
  init: RequestInit = {}
) {
  return new Request(prefix + feature, {
    method: "POST",
    body: JSON.stringify(input),
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      cookie: "organization=999; session=untrusted",
      "x-org-id": "999",
      ...init.headers,
    },
  });
}
async function upload(
  type: ggUploads.MediaType = "image/png",
  forOwner = owner
) {
  return {
    upload: await ggUploads.sign(forOwner, {
      file_token: "file_input",
      media_type: type,
      byte_length: 100,
    }),
  };
}
const result = () => ({
  glb: {
    data: new Uint8Array([1, 2, 3, 4]),
    media_type: "model/gltf-binary" as const,
  },
  task: { id: "task_generated", credits_consumed: 25 },
});

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv(
    "GG_TOKEN_SECRET",
    "synthetic-gateway-media-signing-secret-32-bytes"
  );
  vi.stubEnv("GG_TOKEN_SECRET_PREVIOUS", "");
  bearer = (await gg.sign(owner.sub, owner.org)).token;
  mocks.limit.mockResolvedValue({ success: true });
  mocks.presign.mockResolvedValue({
    file_token: "file_input",
    expires_in: 1800,
    upload_url:
      "https://tripo-data.s3.us-west-2.amazonaws.com/input.glb?X-Amz-Signature=synthetic",
  });
  mocks.generate.mockResolvedValue(result());
  mocks.rig.mockResolvedValue(result());
  mocks.check.mockResolvedValue({
    riggable: true,
    rig_type: "biped",
    task: { id: "task_checked", credits_consumed: 0 },
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("funded 3D bindings", () => {
  it.each(Object.keys(operations) as Feature[])(
    "requires an exclusive live GG bearer before %s execution",
    async (feature) => {
      for (const token of [null, "account-or-provider-credential"]) {
        const response = await operations[feature].POST(
          request(feature, {}, token)
        );
        expect(response.status).toBe(401);
        expect(response.headers.get("cache-control")).toBe("no-store");
      }
      expect(mocks.limit).not.toHaveBeenCalled();
      expect(mocks.presign).not.toHaveBeenCalled();
      expect(mocks.generate).not.toHaveBeenCalled();
      expect(mocks.check).not.toHaveBeenCalled();
      expect(mocks.rig).not.toHaveBeenCalled();
    }
  );

  it("mints owner-bound upload references and never accepts an org selector", async () => {
    const response = await operations.uploads.POST(
      request("uploads", { media_type: "image/png", byte_length: 100 })
    );
    expect(response.status).toBe(200);
    expect(mocks.presign).toHaveBeenCalledExactlyOnceWith(41, "image/png");
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["upload", "upload_url"]);
    await expect(
      ggUploads.verify(owner, { upload: body.upload }, "image")
    ).resolves.toMatchObject({ file_token: "file_input" });
    const rejected = await operations.uploads.POST(
      request("uploads", {
        media_type: "image/png",
        byte_length: 100,
        organization_id: 999,
      })
    );
    expect(rejected.status).toBe(400);
    expect(mocks.presign).toHaveBeenCalledTimes(1);
  });

  it("resolves image and multiview references only for the authenticated owner", async () => {
    const ref = await upload();
    const response = await operations["model-generation"].POST(
      request("model-generation", {
        model_id: "tripo/p2",
        variant: "image",
        input: { image: ref, texture: false },
      })
    );
    expect(response.status).toBe(200);
    expect(mocks.generate).toHaveBeenCalledExactlyOnceWith(
      41,
      "tripo/p2",
      "image",
      {
        image: { file_token: "file_input", media_type: "image/png" },
        texture: false,
      }
    );
    expect(await response.json()).toMatchObject({
      model_id: "tripo/p2",
      feature: "model-generation",
      variant: "image",
      provider_id: "gg",
      glb: { base64: "AQIDBA==" },
    });
    const multi = await operations["model-generation"].POST(
      request("model-generation", {
        model_id: "tripo/h3.1",
        variant: "multiview",
        input: { images: { front: ref, left: ref } },
      })
    );
    expect(multi.status).toBe(200);
    const count = mocks.generate.mock.calls.length;
    for (const bad of [
      await upload("image/png", { ...owner, org: 42 }),
      await upload("image/png", { ...owner, sub: "user-beta" }),
      await upload("model/gltf-binary"),
    ]) {
      const denied = await operations["model-generation"].POST(
        request("model-generation", {
          model_id: "tripo/p2",
          variant: "image",
          input: { image: bad },
        })
      );
      expect(denied.status).toBe(400);
    }
    expect(mocks.generate).toHaveBeenCalledTimes(count);
  });

  it("keeps compatibility checks separate from paid rigging and ignores cookie authority", async () => {
    const mesh = await upload("model/gltf-binary");
    const checked = await operations["rig-check"].POST(
      request("rig-check", { input: { mesh } })
    );
    expect(checked.status).toBe(200);
    expect(await checked.json()).toMatchObject({
      provider_id: "gg",
      feature: "rig-check",
      riggable: true,
    });
    expect(mocks.check).toHaveBeenCalledExactlyOnceWith(41, {
      mesh: { file_token: "file_input", media_type: "model/gltf-binary" },
    });
    expect(mocks.rig).not.toHaveBeenCalled();
    const rigged = await operations.rigging.POST(
      request("rigging", {
        model_id: "tripo/rig-v1.0",
        input: { mesh, rig_type: "biped", spec: "mixamo" },
      })
    );
    expect(rigged.status).toBe(200);
    expect(mocks.rig).toHaveBeenCalledExactlyOnceWith(41, "tripo/rig-v1.0", {
      mesh: { file_token: "file_input", media_type: "model/gltf-binary" },
      rig_type: "biped",
      spec: "mixamo",
    });
  });

  it("streams large output without a Content-Length or whole-response base64 allocation", async () => {
    const bytes = new Uint8Array(5 * 1024 * 1024 + 1).fill(173);
    mocks.generate.mockResolvedValue({
      ...result(),
      glb: { data: bytes, media_type: "model/gltf-binary" },
    });
    const response = await operations["model-generation"].POST(
      request("model-generation", {
        model_id: "tripo/h3.1",
        variant: "text",
        input: { prompt: "a toy" },
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.has("content-length")).toBe(false);
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      expect(chunk.value.length).toBeLessThanOrEqual(256 * 1024);
      chunks.push(chunk.value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString());
    expect(
      Buffer.from(body.glb.base64, "base64").equals(Buffer.from(bytes))
    ).toBe(true);
  });

  it("rejects malformed, oversized, encoded, URL-based and unknown requests before provider work", async () => {
    const invalid = [
      request("uploads", {
        media_type: "image/png",
        byte_length: 20_000_001,
      }),
      request("uploads", {}, bearer, { body: "x".repeat(65_537) }),
      request("uploads", {}, bearer, {
        headers: { "content-encoding": "gzip" },
      }),
      request("uploads", {}, bearer, {
        headers: { "content-type": "text/plain" },
      }),
      request("model-generation", {
        model_id: "unknown",
        variant: "text",
        input: {},
      }),
      request("model-generation", {
        model_id: "tripo/p2",
        variant: "image",
        input: { image: { url: "http://localhost/private" } },
      }),
    ];
    for (const req of invalid) {
      const feature = new URL(req.url).pathname.split("/").at(-1) as Feature;
      expect((await operations[feature].POST(req)).status).toBe(400);
    }
    expect(mocks.presign).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("returns bounded method policy without contacting auth, billing or providers", async () => {
    for (const [feature, handlers] of Object.entries(operations)) {
      for (const method of ["GET", "HEAD", "PUT", "DELETE"] as const) {
        const response = await handlers[method](
          new Request(prefix + feature, { method })
        );
        expect(response.status).toBe(405);
        expect(response.headers.get("allow")).toBe("POST, OPTIONS");
        expect(await response.text()).toBe(
          method === "HEAD"
            ? ""
            : JSON.stringify({
                error: {
                  code: "method_not_allowed",
                  message: "This method is not allowed.",
                },
              })
        );
      }
      const response = await handlers.OPTIONS(
        new Request(prefix + feature, { method: "OPTIONS" })
      );
      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
    }
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.presign).not.toHaveBeenCalled();
  });

  it("maps credit denial, capacity failure and rate limits without provider diagnostics or retries", async () => {
    const input = {
      model_id: "tripo/h3.1",
      variant: "text",
      input: { prompt: "toy" },
    };
    mocks.generate.mockRejectedValue(
      Object.assign(new Error("Not enough credits"), { code: "blocked" })
    );
    expect(
      (
        await operations["model-generation"].POST(
          request("model-generation", input)
        )
      ).status
    ).toBe(402);
    mocks.generate.mockRejectedValue(
      new GgThreeD.Failure("provider_unavailable")
    );
    const failed = await operations["model-generation"].POST(
      request("model-generation", input)
    );
    expect(failed.status).toBe(503);
    expect(await failed.json()).toMatchObject({
      error: { code: "provider_unavailable" },
    });
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    mocks.limit.mockResolvedValue({ success: false, retryAfterSeconds: 5 });
    const limited = await operations["model-generation"].POST(
      request("model-generation", input)
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("5");
    expect(mocks.generate).toHaveBeenCalledTimes(2);
  });
});
