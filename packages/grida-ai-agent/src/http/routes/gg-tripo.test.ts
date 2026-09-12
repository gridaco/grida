// GRIDA-SEC-004 / GRIDA-SEC-006 / GRIDA-GG: provider — native funding authority.
import { Hono } from "hono";
import { GridaGatewaySessionStore, ProviderHttp } from "@grida/ai";
import type { SecretsStore } from "@grida/daemon/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GeneratedMediaPersistence } from "./generated-media-persistence";
import { registerModelGenerationRoutes } from "./model-generation";
import { registerRiggingRoutes } from "./rigging";

const json = Buffer.from('{"asset":{"version":"2.0"}} ');
const bytes = Buffer.alloc(20 + json.length);
[0x46546c67, 2, bytes.length, json.length, 0x4e4f534a].forEach((value, i) =>
  bytes.writeUInt32LE(value, i * 4)
);
json.copy(bytes, 20);
const glb = {
  base64: bytes.toString("base64"),
  media_type: "model/gltf-binary",
};
const task = { id: "task_hosted", credits_consumed: 25 };
const mesh = { data: glb.base64, media_type: glb.media_type };
const image = { data: "AQID", media_type: "image/png" };
function fixture(token = true) {
  const app = new Hono();
  const gg = new GridaGatewaySessionStore();
  if (token)
    gg.set({
      access_token: "synthetic-scoped-token",
      expires_at: Date.now() + 900_000,
      organization: { id: 1, name: "test" },
    });
  const get = vi.fn<() => Promise<string>>(async () => "synthetic-byok-key");
  const request = vi.fn<typeof fetch>(async (url, init) => {
    expect(new Headers(init?.headers).has("authorization")).toBe(
      init?.method !== "PUT"
    );
    if (init?.method === "PUT") {
      return new Response(null);
    }
    expect(new URL(String(url)).origin).toBe("https://grida.example");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer synthetic-scoped-token"
    );
    const input = JSON.parse(String(init?.body));
    if (String(url).endsWith("/uploads"))
      return Response.json({
        upload: "signed-reference",
        upload_url:
          "https://tripo-data.s3.us-west-2.amazonaws.com/input.glb?signature=synthetic",
      });
    if (String(url).endsWith("/rig-check"))
      return Response.json({
        feature: "rig-check",
        provider_id: "gg",
        riggable: true,
        rig_type: "biped",
        task: { ...task, credits_consumed: 0 },
      });
    return Response.json({
      feature: String(url).endsWith("/rigging")
        ? "rigging"
        : "model-generation",
      provider_id: "gg",
      model_id: input.model_id,
      variant: input.variant,
      glb,
      task,
    });
  });
  const download = vi.fn<typeof fetch>(async () => {
    throw new Error("unexpected download");
  });
  const deps = {
    secrets: { _getKey: get } as unknown as SecretsStore,
    gg,
    gg_base_url: "https://grida.example",
    provider_http: new ProviderHttp({ request, download }),
  };
  registerModelGenerationRoutes(app, deps);
  registerRiggingRoutes(app, deps);
  return { app, gg, get, request, download };
}
function post(app: Hono, route: string, body: unknown) {
  return app.request(route, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const cases = [
  [
    "/model-generation/generate",
    {
      provider: "gg",
      model_id: "tripo/h3.1",
      variant: "text",
      input: { prompt: "robot" },
    },
  ],
  [
    "/model-generation/generate",
    {
      provider: "gg",
      model_id: "tripo/p1",
      variant: "image",
      input: { image },
    },
  ],
  [
    "/model-generation/generate",
    {
      provider: "gg",
      model_id: "tripo/p2",
      variant: "multiview",
      input: { images: { front: image, left: image } },
    },
  ],
  ["/rigging/check", { provider: "gg", input: { mesh } }],
  [
    "/rigging/generate",
    {
      provider: "gg",
      model_id: "tripo/rig-v1.0",
      input: { mesh, rig_type: "biped", spec: "mixamo" },
    },
  ],
  [
    "/rigging/generate",
    {
      provider: "gg",
      model_id: "tripo/rig-v2.5",
      input: { mesh, rig_type: "quadruped", spec: "tripo" },
    },
  ],
] as const;
afterEach(() => vi.restoreAllMocks());

describe("hosted Tripo native adapters", () => {
  it.each(cases)(
    "%s preserves SDK inputs, funding identity and portable output",
    async (route, input) => {
      const state = fixture();
      const response = await post(state.app, route, input);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        provider_id: "gg",
        task: { id: task.id },
      });
      expect(state.get).not.toHaveBeenCalled();
      expect(state.download).not.toHaveBeenCalled();
    }
  );
  it.each(cases)(
    "%s refuses missing GG authority without a BYOK fallback",
    async (route, input) => {
      const state = fixture(false);
      const response = await post(state.app, route, input);
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        provider_id: "gg",
        code: "gg_token_expired",
      });
      expect(state.get).not.toHaveBeenCalled();
      expect(state.request).not.toHaveBeenCalled();
    }
  );
  it("retains the accepted task marker and makes one paid request", async () => {
    const state = fixture();
    state.request.mockResolvedValueOnce(
      Response.json(
        {
          error: {
            code: "usage_unavailable",
            message: "private-server-detail",
            task_id: task.id,
          },
        },
        { status: 502 }
      )
    );
    const response = await post(state.app, ...cases[0]);
    expect(response.status).toBe(502);
    const error = await response.json();
    expect(error).toMatchObject({ task_id: task.id, provider_id: "gg" });
    expect(error.error).toContain(`Tripo task: ${task.id}.`);
    expect(JSON.stringify(error)).not.toContain("private");
    expect(state.request).toHaveBeenCalledTimes(1);
  });
  it.each(cases)(
    "%s preserves provider outages as 503 without leaking details or resubmitting",
    async (route, input) => {
      const state = fixture();
      const normal = state.request.getMockImplementation()!;
      state.request.mockImplementation(async (url, init) => {
        if (/\/(model-generation|rigging|rig-check)$/.test(String(url)))
          return Response.json(
            {
              error: {
                code: "provider_unavailable",
                message: "private-provider-details",
                task_id: task.id,
              },
            },
            { status: 503 }
          );
        return normal(url, init);
      });
      const response = await post(state.app, route, input);
      expect(response.status).toBe(503);
      const error = await response.json();
      expect(error).toEqual({
        provider_id: "gg",
        code: "provider_unavailable",
        task_id: task.id,
        error: `The Tripo service is currently unavailable. Tripo task: ${task.id}.`,
      });
      expect(state.get).not.toHaveBeenCalled();
      expect(
        state.request.mock.calls.filter(([url]) =>
          /\/(model-generation|rigging|rig-check)$/.test(String(url))
        )
      ).toHaveLength(1);
    }
  );
  it.each([cases[0], cases[4]])(
    "%s retains funded task identity after an unexpected persistence-adapter failure",
    async (route, input) => {
      vi.spyOn(GeneratedMediaPersistence, "save").mockRejectedValueOnce(
        new Error("private-store-path-or-key")
      );
      const state = fixture();
      const response = await post(state.app, route, input);
      expect(response.status).toBe(502);
      const error = await response.json();
      expect(error).toMatchObject({
        provider_id: "gg",
        task_id: task.id,
        code: "generation_failed",
      });
      expect(error.error).toContain(`Tripo task: ${task.id}.`);
      expect(JSON.stringify(error)).not.toContain("private-store-path-or-key");
      expect(state.get).not.toHaveBeenCalled();
      expect(
        state.request.mock.calls.filter(([url]) =>
          /\/(model-generation|rigging)$/.test(String(url))
        )
      ).toHaveLength(1);
    }
  );
  it("attributes credit denial to the Grida organization", async () => {
    const state = fixture();
    state.request.mockResolvedValueOnce(new Response(null, { status: 402 }));
    const response = await post(state.app, ...cases[0]);
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({
      provider_id: "gg",
      code: "insufficient_credits",
      error: "The Grida organization has insufficient credits.",
    });
  });
});
