import { describe, expect, it } from "vitest";
import { models } from "../src";
import { catalog } from "../src/grida";

describe("rigging facts and service admission", () => {
  it("keeps model-less eligibility separate from rigging model identities", () => {
    const check = models.three_d.rig_check.operation;
    expect(check.feature).toBe("rig-check");
    expect(check).not.toHaveProperty("id");
    expect(check).not.toHaveProperty("model_id");
    expect(check).not.toHaveProperty("status");
    expect(check.pricing.credits).toBe(0);
    expect(check.input).toEqual({ formats: ["glb"], max_bytes: 150_000_000 });
    expect(catalog.three_d.rig_check.operation.status).toBe("listed");
    expect(Object.isFrozen(check.rig_types)).toBe(true);
  });
  it("binds independent humanoid and creature models to the documented compatibility table", () => {
    const rigs = models.three_d.rigging;
    expect(rigs.model_ids).toEqual(["tripo/rig-v1.0", "tripo/rig-v2.5"]);
    expect(rigs.models["tripo/rig-v1.0"].binding_id).toBe("v1.0-20240301");
    expect(rigs.models["tripo/rig-v1.0"].rig_types).toEqual(["biped"]);
    expect(rigs.models["tripo/rig-v2.5"].binding_id).toBe("v2.5-20260210");
    expect(rigs.models["tripo/rig-v2.5"].rig_types).toEqual([
      "quadruped",
      "hexapod",
      "octopod",
      "avian",
      "serpentine",
      "aquatic",
    ]);
    expect(rigs.is_model_id("tripo/h3.1")).toBe(false);
    expect(rigs.is_model_id("v1.0-20240301")).toBe(false);
    for (const card of Object.values(rigs.models)) {
      expect(card.feature).toBe("rigging");
      expect(card.specs).toEqual(["tripo", "mixamo"]);
      expect(card).not.toHaveProperty("status");
      expect(card).not.toHaveProperty("default_id");
      expect(Object.isFrozen(card.rig_types)).toBe(true);
    }
  });
  it("uses the published 25-credit rate and does not infer release days from snapshot suffixes", () => {
    for (const card of Object.values(models.three_d.rigging.models)) {
      expect(card.pricing).toEqual({
        type: "per_operation_credits",
        credits: 25,
        usd_per_credit: 0.01,
        source_url: "https://developers.tripo3d.ai/en/pricing",
      });
      expect(card.release).toEqual({
        date: null,
        basis: "provider_endpoint",
        source_url: "https://developers.tripo3d.ai/en/docs/animations-rig",
      });
    }
  });
  it("lists implemented rigging models without choosing a skeleton for the caller", () => {
    const rigs = catalog.three_d.rigging;
    expect(rigs.default_id).toBeUndefined();
    expect(rigs.ordered_models().map((card) => card.id)).toEqual([
      "tripo/rig-v1.0",
      "tripo/rig-v2.5",
    ]);
    expect(rigs.listed_models()).toEqual(rigs.ordered_models());
    expect(rigs.staged_models()).toEqual([]);
    for (const card of rigs.listed_models()) {
      expect(card.status).toBe("listed");
      expect(card.deprecated).toBe(false);
      expect(card.pricing).toEqual(
        models.three_d.rigging.models[card.id].pricing
      );
    }
    const independent = catalog.policy.resolve(models.three_d.rigging.models, {
      members: { "tripo/rig-v2.5": { status: "listed" } },
    });
    expect(independent.all().map((card) => card.id)).toEqual([
      "tripo/rig-v2.5",
    ]);
    expect(independent.models).not.toHaveProperty("tripo/rig-v1.0");
  });
});
