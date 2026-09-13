import { describe, expect, it } from "vitest";
import { models } from "../../src";
import { catalog } from "../../src/grida";

describe("Grida model-generation service policy", () => {
  it("lists direct models with an explicit default and independent order", () => {
    const generation = catalog.three_d.model_generation;
    expect(generation.default_id).toBe("tripo/h3.1");
    expect(generation.ordered_models().map((card) => card.id)).toEqual([
      "tripo/h3.1",
      "tripo/p1",
      "tripo/p2",
    ]);
    expect(generation.listed_models()).toEqual(generation.ordered_models());
    expect(generation.staged_models()).toEqual([]);
    expect(generation.is_model_id("tripo/h3.1")).toBe(true);
    expect(generation.is_model_id("P1-20260311")).toBe(false);
    for (const card of generation.listed_models()) {
      expect(card.status).toBe("listed");
      expect(card.deprecated).toBe(false);
      expect(card.pricing).toEqual(
        models.three_d.model_generation.models[card.id].pricing
      );
      expect(Object.isFrozen(card)).toBe(true);
    }
  });

  it("does not make a factual model a member of an independently defined service", () => {
    const view = catalog.policy.resolve(
      models.three_d.model_generation.models,
      {
        members: { "tripo/p1": { status: "listed" } },
        default_id: "tripo/p1",
      }
    );
    expect(view.all().map((card) => card.id)).toEqual(["tripo/p1"]);
    expect(view.models).not.toHaveProperty("tripo/h3.1");
    expect(models.three_d.model_generation.models["tripo/h3.1"]).toBeDefined();
    expect(models.three_d.model_generation).not.toHaveProperty("default_id");
  });
});
