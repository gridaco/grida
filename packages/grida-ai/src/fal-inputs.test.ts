// GRIDA-SEC-004 — documented controls, batch counts, and native/JSON preflight parity.
import { describe, expect, it, vi } from "vitest";
import {
  ImageClient,
  MediaOperations,
  ProviderHttp,
  GridaGatewaySessionStore,
  VideoClient,
} from "./index";
import { catalog } from "@grida/ai-models/grida";
import { FalInputs } from "./fal-inputs";
const prompt = "A quiet alpine forest";
describe("fal endpoint input contracts", () => {
  it.each([
    [
      "fal-ai/gpt-image-2",
      { size: "1024x1024", quality: "high" },
      {
        image_size: { width: 1024, height: 1024 },
        quality: "high",
        num_images: 1,
      },
    ],
    [
      "openai/gpt-image-2.5/flare/text-to-image",
      { quality: "xhigh", background: "transparent" },
      {
        image_size: "auto",
        quality: "xhigh",
        background: "transparent",
        output_format: "png",
        num_images: 1,
      },
    ],
    [
      "openai/gpt-image-2.5/sunburst/text-to-image",
      { quality: "max" },
      { image_size: "auto", quality: "max", num_images: 1 },
    ],
    [
      "fal-ai/nano-banana-2",
      { size: "512x512", seed: 0 },
      { resolution: "0.5K", aspect_ratio: "1:1", seed: 0, num_images: 1 },
    ],
    [
      "fal-ai/nano-banana-pro",
      { size: "2048x2048" },
      { resolution: "2K", aspect_ratio: "1:1", num_images: 1 },
    ],
    [
      "fal-ai/flux-2-pro",
      { aspect_ratio: "16:9", seed: 0 },
      { image_size: "landscape_16_9", seed: 0 },
    ],
    [
      "fal-ai/flux-2-max",
      { size: "1024x1024" },
      { image_size: { width: 1024, height: 1024 } },
    ],
    [
      "bytedance/seedream/v5/pro/text-to-image",
      { size: "2048x2048" },
      { image_size: { width: 2048, height: 2048 }, num_images: 1 },
    ],
    [
      "bytedance/seedream/v5/lite/text-to-image",
      { aspect_ratio: "9:16" },
      { image_size: "portrait_16_9", num_images: 1 },
    ],
    [
      "xai/grok-imagine-image/v2.0/text-to-image",
      { size: "2048x2048", quality: "low" },
      { resolution: "2k", aspect_ratio: "1:1", quality: "low", num_images: 1 },
    ],
    [
      "fal-ai/recraft/v4.1/text-to-image",
      { aspect_ratio: "4:3" },
      { image_size: "landscape_4_3" },
    ],
  ] as const)(
    "serializes only documented image fields for %s",
    (id, input, wire) => {
      expect(FalInputs.image(id, { prompt, ...input })).toEqual({
        prompt,
        ...wire,
      });
    }
  );
  it.each([
    ["fal-ai/gpt-image-2", { size: "256x256" }],
    ["openai/gpt-image-2.5/flare/text-to-image", { size: "1025x1024" }],
    ["openai/gpt-image-2.5/sunburst/text-to-image", { size: "4096x1024" }],
    ["fal-ai/nano-banana-pro", { size: "1536x1024" }],
    ["fal-ai/nano-banana-2", { quality: "high" }],
    ["fal-ai/flux-2-pro", { size: "4096x4096" }],
    ["fal-ai/flux-2-max", { size: "2048x2048", aspect_ratio: "16:9" }],
    ["bytedance/seedream/v5/pro/text-to-image", { seed: 0 }],
    ["bytedance/seedream/v5/lite/text-to-image", { size: "1024x1024" }],
    ["xai/grok-imagine-image/v2.0/text-to-image", { quality: "high" }],
    ["fal-ai/recraft/v4.1/text-to-image", { seed: 0 }],
  ] as const)(
    "refuses unsupported or out-of-envelope input on %s before I/O",
    async (id, input) => {
      const operations = new MediaOperations();
      const descriptor = operations
        .list({ kind: "image", provider: "fal" })
        .find((d) => d.binding_id === id)!;
      expect(descriptor).toBeDefined();
      expect(() =>
        operations.parseInput(
          { kind: "image", provider: "fal", model_id: descriptor.model_id },
          { prompt, ...input }
        )
      ).toThrow(MediaOperations.Failure);
      const request = vi.fn<typeof fetch>();
      const client = new ImageClient({
        keys: { get: () => "synthetic" },
        http: new ProviderHttp({ request, download: request }),
      });
      const op = await client.resolve({
        model_id: descriptor.model_id,
        provider: "fal",
      });
      await expect(op.generate({ prompt, ...input })).rejects.toHaveProperty(
        "code",
        "invalid_input"
      );
      expect(request).not.toHaveBeenCalled();
    }
  );
  it.each([
    "openai/gpt-image-2",
    "openai/gpt-image-2.5-flare",
    "openai/gpt-image-2.5-sunburst",
  ])(
    "enforces the GPT image size envelope before a Vercel request: %s",
    (model_id) => {
      const ops = new MediaOperations();
      expect(() =>
        ops.parseInput(
          { kind: "image", model_id, provider: "vercel" },
          { prompt, size: "256x256" }
        )
      ).toThrow(MediaOperations.Failure);
      expect(
        ops.parseInput(
          { kind: "image", model_id, provider: "vercel" },
          { prompt, size: "1536x1024" }
        )
      ).toMatchObject({ input: { size: "1536x1024" } });
    }
  );
});
describe("GG route admission", () => {
  it.each([
    "google/gemini-omni-1.1-flash",
    "bytedance/seedance-2.0",
    "bytedance/seedance-2.5",
  ])(
    "admits %s via GG without a Vercel binding and keeps the canonical wire ID",
    async (model_id) => {
      const gg = new GridaGatewaySessionStore();
      gg.set({
        access_token: "synthetic-scoped",
        expires_at: Date.now() + 60_000,
      });
      const request = vi.fn<typeof fetch>(async () =>
        Response.json({ videos: [{ base64: "AQID", media_type: "video/mp4" }] })
      );
      const client = new VideoClient({
        keys: { get: () => null },
        http: new ProviderHttp({ request, download: request }),
        gg,
        gg_base_url: "https://gg.example",
      });
      const op = await client.resolve({ model_id, provider: "gg" });
      expect(op.binding_id).toBe(model_id);
      await op.generate({ prompt });
      expect(JSON.parse(String(request.mock.calls[0]![1]!.body)).model_id).toBe(
        model_id
      );
    }
  );
  it("retains legacy Vercel-only GG admission for snapshots without hosted metadata", () => {
    const snapshot = catalog.snapshot.seed();
    for (const card of Object.values(snapshot.video!.models))
      delete card.hosted;
    const operations = new MediaOperations({ snapshot });
    expect(
      operations.list({
        kind: "video",
        model_id: "google/gemini-omni-1.1-flash",
        provider: "gg",
      })
    ).toEqual([]);
    expect(
      operations.list({
        kind: "video",
        model_id: "google/veo-3.1",
        provider: "gg",
      })
    ).toHaveLength(1);
  });
});
