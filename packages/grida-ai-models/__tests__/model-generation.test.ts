import { describe, expect, it } from "vitest";
import { models } from "../src";
const catalogue = models.three_d.model_generation;
describe("models.three_d.model_generation", () => {
  it("keeps feature, model, provider binding and input variants separate", () => {
    expect(catalogue.model_ids).toEqual(["tripo/h3.1", "tripo/p1", "tripo/p2"]);
    for (const [id, card] of Object.entries(catalogue.models)) {
      expect(card.id).toBe(id);
      expect(card.feature).toBe("model-generation");
      expect(card.inputs).toEqual(["text", "image", "multiview"]);
      expect(card.provider).toBe("tripo");
      expect(card.output).toEqual({ primary: "glb", compression: "none" });
      expect(card).not.toHaveProperty("status");
      expect(card).not.toHaveProperty("deprecated");
      expect(Object.isFrozen(card)).toBe(true);
      expect(Object.isFrozen(card.pricing.base_credits)).toBe(true);
    }
    expect(
      Object.values(catalogue.models).map((card) => card.binding_id)
    ).toEqual(["v3.1-20260211", "P1-20260311", "P2-20260801"]);
    expect(catalogue.is_model_id("tripo/p2")).toBe(true);
    expect(catalogue.is_model_id("P2-20260801")).toBe(false);
    expect(catalogue.is_model_id("tripo/remesh")).toBe(false);
  });
  it("records public launch dates rather than API snapshot suffix dates", () => {
    expect(
      Object.values(catalogue.models).map((card) => card.release.date)
    ).toEqual(["2026-03-06", "2026-03-11", "2026-08-19"]);
    expect(catalogue.models["tripo/p2"].preview).toBe(true);
  });
  it("prices each input variant and texture tier in provider credits", () => {
    expect(catalogue.models["tripo/h3.1"].pricing.base_credits).toEqual({
      text: 10,
      image: 20,
      multiview: 20,
    });
    expect(catalogue.models["tripo/p1"].pricing.base_credits).toEqual({
      text: 30,
      image: 40,
      multiview: 40,
    });
    expect(catalogue.models["tripo/p2"].pricing.base_credits).toEqual({
      text: 100,
      image: 100,
      multiview: 100,
    });
    for (const card of Object.values(catalogue.models)) {
      expect(card.pricing.usd_per_credit).toBe(0.01);
      expect(card.pricing.texture_credits).toEqual({
        standard: 10,
        detailed: 20,
        extreme: 30,
      });
      expect(card.pricing.source_url).toBe(
        "https://developers.tripo3d.ai/en/pricing"
      );
    }
  });
  it("restricts geometry quality to H3.1 and preserves distinct face bounds", () => {
    expect(catalogue.models["tripo/h3.1"].geometry_quality).toEqual([
      "standard",
      "detailed",
    ]);
    expect(catalogue.models["tripo/h3.1"].face_limit).toEqual({
      min: 1,
      max: 1_500_000,
      detailed_max: 2_000_000,
    });
    expect(catalogue.models["tripo/p1"].face_limit).toEqual({
      min: 50,
      max: 20_000,
    });
    expect(catalogue.models["tripo/p2"].face_limit).toEqual({
      min: 48,
      max: 50_000,
    });
    for (const id of ["tripo/p1", "tripo/p2"] as const) {
      expect(catalogue.models[id]).not.toHaveProperty("geometry_quality");
      expect(catalogue.models[id].pricing).not.toHaveProperty(
        "detailed_geometry_credits"
      );
    }
  });
});
