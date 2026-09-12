// GRIDA-SEC-004 — public transport, daemon perimeter and immutable source media.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MediaStore } from "@grida/daemon/server";
import { createMediaDaemon } from "./media-server";
import { createAgentDaemon } from "./server";
import { AgentTransport } from "./transport";
import type {
  RigCheckRequest,
  RigCheckResult,
  RiggingGenerateRequest,
  RiggingGenerateResult,
} from "./protocol/rigging";

it("keeps structured checks and rigged media distinct across the public transport", async () => {
  const check: RigCheckRequest = {
    provider: "tripo",
    input: { mesh: { data: "AQID", media_type: "model/gltf-binary" } },
  };
  const rig: RiggingGenerateRequest = {
    ...check,
    model_id: "tripo/rig-v1.0",
    input: { ...check.input, rig_type: "biped", spec: "mixamo" },
  };
  const findings: RigCheckResult = {
    feature: "rig-check",
    provider_id: "tripo",
    riggable: false,
    rig_type: "biped",
    task: { id: "task_check", credits_consumed: 0 },
  };
  const output: RiggingGenerateResult = {
    feature: "rigging",
    provider_id: "tripo",
    model_id: "tripo/rig-v1.0",
    glb: {
      base64: "AQID",
      media_type: "model/gltf-binary",
      file_name: "rigged-model.glb",
    },
    task: { id: "task_rig", credits_consumed: 25 },
  };
  const fetcher = vi.fn<
    (route: string, init?: RequestInit) => Promise<Response>
  >(async (route, init) => {
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(
      route === "/rigging/check" ? check : rig
    );
    return Response.json(route === "/rigging/check" ? findings : output);
  });
  const client = new AgentTransport.Client({ fetcher });
  expect(await client.rigging.check(check)).toEqual(findings);
  expect(await client.rigging.generate(rig)).toEqual(output);
  expect(fetcher.mock.calls.map(([route]) => route)).toEqual([
    "/rigging/check",
    "/rigging/generate",
  ]);
});

describe.each(["media", "full"] as const)(
  "%s daemon rigging",
  (composition) => {
    it("enforces auth/referer, saves rigged media to recents, and preserves its source", async () => {
      const root = await fs.mkdtemp(
        path.join(os.tmpdir(), "grida-rigging-daemon-")
      );
      const bytes = Buffer.from(
        "Z2xURgIAAAAwAAAAHAAAAEpTT057ImFzc2V0Ijp7InZlcnNpb24iOiIyLjAifX0g",
        "base64"
      );
      const media = new MediaStore(path.join(root, "media"));
      const original = await media.save({
        file_name: "original.glb",
        media_type: "model/gltf-binary",
        bytes,
      });
      let checking = false;
      const request = vi.fn<typeof fetch>(async (url, init) => {
        expect(new Headers(init?.headers).get("authorization")).toBe(
          "Bearer synthetic-tripo-key"
        );
        if (String(url).endsWith("/files"))
          return Response.json({
            code: 0,
            data: { file_token: "file_original" },
          });
        if (String(url).includes("/animations/")) {
          checking = String(url).endsWith("/rig-check");
          return Response.json({
            code: 0,
            data: { task_id: checking ? "task_check" : "task_rig" },
          });
        }
        return Response.json({
          code: 0,
          data: {
            task_id: checking ? "task_check" : "task_rig",
            type: checking ? "rig_check" : "rig",
            status: "success",
            credits_consumed: checking ? 0 : 25,
            output: checking
              ? { riggable: true, rig_type: "biped" }
              : {
                  model_url:
                    "https://tripo-data.rg1.data.tripo3d.com/rigged.glb",
                },
          },
        });
      });
      const options = {
        password: "synthetic-daemon-password",
        user_data_path: path.join(root, "agent"),
        media_root: path.join(root, "media"),
        http_access: {
          allowed_origins: ["https://client.example"],
          allowed_referer_paths: ["/desktop"],
        },
        provider_http: { request, download: async () => new Response(bytes) },
      };
      const daemon =
        composition === "media"
          ? createMediaDaemon(options)
          : createAgentDaemon({
              ...options,
              scratch_base: path.join(root, "scratch"),
              capabilities: { agent: false, sessions: false },
            });
      const headers = {
        authorization: AgentTransport.buildBasicAuthHeader(options.password),
        origin: "https://client.example",
        referer: "https://client.example/desktop/rigging",
        "content-type": "application/json",
      };
      const check: RigCheckRequest = {
        provider: "tripo",
        input: {
          mesh: {
            data: bytes.toString("base64"),
            media_type: "model/gltf-binary",
          },
        },
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
          (await call("/rigging/check", check, { authorization: "" })).status
        ).toBe(401);
        expect(
          (
            await call("/rigging/generate", check, {
              referer: "https://client.example/blog",
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
        const checked = await call("/rigging/check", check);
        expect(checked.status).toBe(200);
        expect(await checked.json()).toMatchObject({
          riggable: true,
          task: { id: "task_check", credits_consumed: 0 },
        });
        expect(await media.list()).toHaveLength(1);
        const rig: RiggingGenerateRequest = {
          ...check,
          model_id: "tripo/rig-v1.0",
          input: { ...check.input, rig_type: "biped", spec: "mixamo" },
        };
        const response = await call("/rigging/generate", rig);
        expect(response.status).toBe(200);
        const result = (await response.json()) as RiggingGenerateResult;
        expect(result.stored_media).toMatchObject({
          file_name: "rigged-model.glb",
          media_type: "model/gltf-binary",
          byte_size: bytes.length,
        });
        expect(result.stored_media!.id).not.toBe(original.id);
        expect(Buffer.from((await media.read(original.id)).bytes)).toEqual(
          bytes
        );
        expect(
          Buffer.from((await media.read(result.stored_media!.id)).bytes)
        ).toEqual(bytes);
        expect(await media.list()).toHaveLength(2);
        expect(JSON.stringify(result)).not.toContain("https:");
        expect(JSON.stringify(result)).not.toContain("synthetic-tripo-key");
      } finally {
        await daemon.stop();
        await fs.rm(root, { recursive: true, force: true });
      }
    });
  }
);
