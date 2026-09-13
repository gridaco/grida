// GRIDA-SEC-004 — authenticated media composition persists the exact generated model.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MediaStore } from "@grida/daemon/server";
import { createMediaDaemon } from "./media-server";
import { AgentTransport } from "./transport";
import type {
  ModelGenerationGenerateRequest,
  ModelGenerationGenerateResult,
} from "./protocol/model-generation";

it("transports the explicit feature request and safe task receipt unchanged", async () => {
  const request: ModelGenerationGenerateRequest = {
    provider: "tripo",
    model_id: "tripo/p2",
    variant: "multiview",
    input: {
      images: {
        front: { data: "AQID", media_type: "image/png" },
        back: { data: "BAUG", media_type: "image/jpeg" },
      },
      texture: false,
      pbr: false,
    },
  };
  const result: ModelGenerationGenerateResult = {
    feature: "model-generation",
    model_id: "tripo/p2",
    provider_id: "tripo",
    variant: "multiview",
    glb: {
      base64: "AQID",
      media_type: "model/gltf-binary",
      file_name: "model.glb",
    },
    task: { id: "task_complete", credits_consumed: 100 },
  };
  const client = new AgentTransport.Client({
    fetcher: async (route, init) => {
      expect(route).toBe("/model-generation/generate");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual(request);
      return Response.json(result);
    },
  });
  expect(await client.modelGeneration.generate(request)).toEqual(result);
});

describe("model-generation media daemon", () => {
  it("requires the existing auth/referer perimeter and saves primary GLB into recents", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "grida-tripo-daemon-")
    );
    const password = "synthetic-daemon-password";
    const origin = "https://client.example";
    const json = Buffer.from('{"asset":{"version":"2.0"}} ');
    const bytes = Buffer.alloc(20 + json.length);
    bytes.write("glTF");
    bytes.writeUInt32LE(2, 4);
    bytes.writeUInt32LE(bytes.length, 8);
    bytes.writeUInt32LE(json.length, 12);
    bytes.writeUInt32LE(0x4e4f534a, 16);
    json.copy(bytes, 20);
    const request = vi.fn<typeof fetch>(async (url, init) => {
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer synthetic-tripo-key"
      );
      return Response.json({
        code: 0,
        data: String(url).includes("/tasks/")
          ? {
              task_id: "task_one",
              type: "text_to_model",
              status: "success",
              credits_consumed: 20,
              output: {
                model_url: "https://tripo-data.rg1.data.tripo3d.com/one.glb",
              },
            }
          : { task_id: "task_one" },
      });
    });
    const daemon = createMediaDaemon({
      password,
      user_data_path: path.join(root, "agent"),
      media_root: path.join(root, "media"),
      http_access: {
        allowed_origins: [origin],
        allowed_referer_paths: ["/desktop"],
      },
      provider_http: { request, download: async () => new Response(bytes) },
    });
    const headers = {
      authorization: AgentTransport.buildBasicAuthHeader(password),
      origin,
      referer: origin + "/desktop/tools",
      "content-type": "application/json",
    };
    const payload: ModelGenerationGenerateRequest = {
      model_id: "tripo/h3.1",
      provider: "tripo",
      variant: "text",
      input: { prompt: "a teapot" },
    };
    const call = (route: string, body: unknown, overrides = {}) =>
      daemon.fetch(
        new Request(`http://127.0.0.1${route}`, {
          method: "POST",
          headers: { ...headers, ...overrides },
          body: JSON.stringify(body),
        })
      );
    try {
      await daemon.start({ listen: false });
      expect(
        (
          await call("/model-generation/generate", payload, {
            authorization: "",
          })
        ).status
      ).toBe(401);
      expect(
        (
          await call("/model-generation/generate", payload, {
            referer: origin + "/blog",
          })
        ).status
      ).toBe(403);
      expect(request).not.toHaveBeenCalled();
      expect(
        (
          await call("/secrets/set", {
            provider_id: "tripo",
            key: "synthetic-tripo-key",
          })
        ).status
      ).toBe(200);
      const response = await call("/model-generation/generate", payload);
      expect(response.status).toBe(200);
      const result = (await response.json()) as ModelGenerationGenerateResult;
      expect(result.task).toEqual({ id: "task_one", credits_consumed: 20 });
      expect(result.stored_media).toMatchObject({
        file_name: "model.glb",
        media_type: "model/gltf-binary",
        byte_size: bytes.length,
      });
      const saved = await new MediaStore(path.join(root, "media")).read(
        result.stored_media!.id
      );
      expect(Buffer.from(saved.bytes)).toEqual(bytes);
      expect(JSON.stringify(result)).not.toContain("https:");
      expect(JSON.stringify(result)).not.toContain("synthetic-tripo-key");
    } finally {
      await daemon.stop();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
