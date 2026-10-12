// Free paired contract proof. The caller starts a real local GG server backed
// by PostgreSQL; only upstream providers and source observations are fixtures.
import { describe, it, expect } from "vitest";
import { catalog } from "@grida/ai-models/grida";
import { generateText, streamText, generateImage } from "ai";
import {
  gatewayLanguageModel,
  gatewayImageModel,
  gatewayFetch,
  gatewayWait,
  gatewayCostMills,
} from "./gateway-product";

const context = {
  organizationId: Number(process.env.GRIDA_AI_GATEWAY_FIXTURE_ORG),
  feature: "m2/paired-client",
};
const providerOptions = { grida: context };
describe("Grida SDK → local GG → PostgreSQL execution and credit", () => {
  it("offers every currently listed Grida text, image and video model", async () => {
    const response = await gatewayFetch(context, "/v1/models");
    const value = await response.json();
    const ids = new Set(value.data.map((x: { id: string }) => x.id));
    for (const id of [
      ...Object.values(catalog.text.catalog).map((x) => x.id),
      ...catalog.image.listed_models().map((x) => x.id),
      ...catalog.video.listed_models().map((x) => x.id),
    ])
      expect(ids).toContain(id);
  });
  it("delivers text and streaming with authoritative settled charge metadata", async () => {
    const text = await generateText({
      model: gatewayLanguageModel("openai/gpt-5.6-luna"),
      prompt: "hello",
      maxOutputTokens: 32,
      providerOptions,
    });
    expect(text.text).toBe("Fixture response.");
    expect(gatewayCostMills(text.providerMetadata)).toBeGreaterThan(0);
    const stream = streamText({
      model: gatewayLanguageModel("openai/gpt-5.6-luna"),
      prompt: "hello",
      maxOutputTokens: 32,
      providerOptions,
    });
    expect(await stream.text).toBe("Fixture response.");
    expect(gatewayCostMills(await stream.providerMetadata)).toBeGreaterThan(0);
  });
  it("delivers images through the actual AI SDK image model", async () => {
    const result = await generateImage({
      model: gatewayImageModel("bfl/flux-2-pro"),
      prompt: "a red square",
      n: 1,
      size: "1024x1024",
      providerOptions,
    });
    expect(result.image.uint8Array.slice(0, 8)).toEqual(
      Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)
    );
    expect(gatewayCostMills(result.providerMetadata)).toBeGreaterThan(0);
  });
  it.each([
    [
      "/v1/videos",
      {
        model: "google/veo-3.1-lite",
        prompt: "a cube",
        duration: 4,
        resolution: "1280x720",
      },
      "videos",
    ],
    ["/v1/endpoints/three-d.tripo.h3.1.text", { prompt: "a cube" }, "glb"],
    [
      "/v1/endpoints/three-d.tripo.h3.1.image",
      {
        image: {
          url: "https://grida-upload.invalid/file_paired",
          media_type: "image/png",
        },
      },
      "glb",
    ],
    [
      "/v1/endpoints/three-d.tripo.rig-check",
      {
        mesh: {
          url: "https://grida-upload.invalid/file_mesh",
          media_type: "model/gltf-binary",
        },
      },
      "riggable",
    ],
    [
      "/v1/endpoints/three-d.tripo.rig-v1.0.mesh",
      {
        mesh: {
          url: "https://grida-upload.invalid/file_mesh",
          media_type: "model/gltf-binary",
        },
        rig_type: "biped",
        spec: "tripo",
      },
      "glb",
    ],
  ] as const)(
    "observes the original %s job and settles once",
    async (path, input, resultKey) => {
      const submitted = await gatewayFetch(
        context,
        path,
        { method: "POST", body: JSON.stringify(input) },
        crypto.randomUUID()
      );
      const { id } = await submitted.json();
      const job = await gatewayWait(context, id);
      expect(job.id).toBe(id);
      expect(job.result).toHaveProperty(resultKey);
      expect(job.billing.status).toBe("settled");
      expect(Number(job.billing.charged_mills)).toBeGreaterThanOrEqual(
        resultKey === "riggable" ? 0 : Number.MIN_VALUE
      );
    }
  );
});
