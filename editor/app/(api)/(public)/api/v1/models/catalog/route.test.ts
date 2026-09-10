// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
/**
 * GET /api/v1/models/catalog — credential-free, CDN-cacheable snapshot of
 * the model catalogue, parseable by every client that consumes it.
 */
import { describe, it, expect } from "vitest";
import { catalog as models, TIER_MODEL_IDS } from "@grida/ai-models/grida";
import { GET } from "./route";
import { isHostedTextModel } from "@/lib/ai/openai-compat/hosted-models";

async function body(): Promise<unknown> {
  const res = await GET();
  expect(res.status).toBe(200);
  return res.json();
}

describe("GET /api/v1/models/catalog", () => {
  it("serves without any credential", async () => {
    // The whole point: a sidecar fetches this at boot, before the
    // renderer can push a session token. No Authorization header here.
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("is CDN-cacheable rather than no-store", async () => {
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=300, s-maxage=300, stale-while-revalidate=3600"
    );
  });

  it("round-trips through the client parser", async () => {
    // The cross-side contract. If this fails, every client rejects the
    // payload and silently stays on its bundled seed.
    const parsed = models.snapshot.parse(await body());
    expect(parsed).not.toBeNull();
    expect(parsed!.schema).toBe(models.snapshot.SCHEMA);
    expect(parsed!.schema).toBe(1);
    expect(parsed!.version.length).toBeGreaterThan(0);
  });

  it("keeps the legacy image fields consumed by installed version-one clients", async () => {
    const parsed = models.snapshot.parse(await body())!;
    expect(parsed.image?.models["openai/gpt-image-2"]).toMatchObject({
      id: "openai/gpt-image-2",
      listed: true,
      deprecated: true,
      provider: "vercel",
    });
    expect(parsed.image?.models["openai/gpt-image-2.5-flare"]).toMatchObject({
      id: "openai/gpt-image-2.5-flare",
      listed: true,
      deprecated: false,
      provider: "vercel",
    });
  });

  it("publishes the same table the server-side gate enforces", async () => {
    // `isHostedTextModel` and this payload are the same static import in
    // the same deploy artifact — a client converging here converges on
    // the exact allowlist chat/completions will apply.
    const parsed = models.snapshot.parse(await body())!;
    for (const id of Object.keys(parsed.text.catalog)) {
      expect(isHostedTextModel(id)).toBe(true);
    }
    for (const id of Object.keys(models.text.catalog)) {
      expect(parsed.text.catalog[id]).toBeDefined();
    }
  });

  it("publishes tiers that resolve within the published catalogue", async () => {
    const parsed = models.snapshot.parse(await body())!;
    expect(parsed.text.tier_model_ids).toEqual(TIER_MODEL_IDS);
    for (const id of Object.values(parsed.text.tier_model_ids)) {
      expect(parsed.text.catalog[id]).toBeDefined();
    }
  });

  it("publishes the shared image recommendation without replacing an explicit legacy choice", async () => {
    const parsed = models.snapshot.parse(await body())!;
    expect(parsed.preferences?.image?.default_id).toBe(models.image.default_id);
    const view = models.snapshot.view(parsed).image;
    expect(view.default_id).toBe("openai/gpt-image-2.5-flare");
    expect(view.cardById("openai/gpt-image-2")?.deprecated).toBe(true);
    expect(view.listed().at(-1)?.id).toBe("openai/gpt-image-2");
  });

  it("carries the pricing and limits a client needs to estimate cost", async () => {
    // Deliberate, unlike /api/v1/ai/models — this is the source that
    // feeds the desktop's local cost estimate and compaction limits.
    const parsed = models.snapshot.parse(await body())!;
    const spec = parsed.text.catalog[TIER_MODEL_IDS.pro]!;
    expect(spec.cost.input).toBeGreaterThan(0);
    expect(spec.cost.output).toBeGreaterThan(0);
    expect(spec.contextWindow).toBeGreaterThan(0);
    expect(spec.outputLimit).toBeGreaterThan(0);
  });
});
