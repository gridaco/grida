import models, { TIER_MODEL_IDS } from "..";

describe("models.image.findImageModelCard", () => {
  it("resolves a full gateway id", () => {
    const card = models.image.findImageModelCard("bfl/flux-pro-1.1");
    expect(card?.id).toBe("bfl/flux-pro-1.1");
    expect(card?.label).toBe("Flux Pro 1.1");
  });

  it("resolves the deprecated ProviderModel wrapper", () => {
    const card = models.image.findImageModelCard({
      provider: "gateway",
      modelId: "bfl/flux-2-pro",
    });
    expect(card?.id).toBe("bfl/flux-2-pro");
  });

  it("resolves a bare name (the part after the vendor prefix)", () => {
    // Same rule as `models.text.modelSpecById`: bare = post-slash segment.
    const card = models.image.findImageModelCard("gpt-image-2");
    expect(card?.id).toBe("openai/gpt-image-2");
  });

  it("returns null when the bare name matches no card", () => {
    // "gpt-image" is a prefix of three OpenAI ids but is not the
    // bare name of any of them — must refuse rather than guess.
    expect(models.image.findImageModelCard("gpt-image")).toBeNull();
  });

  it("returns null for an unknown full id", () => {
    expect(
      models.image.findImageModelCard("unknown-vendor/imaginary-model")
    ).toBeNull();
  });

  it("returns null for an empty input", () => {
    expect(models.image.findImageModelCard("")).toBeNull();
  });
});

describe("models.image catalogue invariants", () => {
  it("every dict key resolves to a defined card", () => {
    for (const id of Object.keys(models.image.models)) {
      expect(models.image.models[id]).toBeDefined();
    }
  });

  it("toCompact preserves id, label, pricing, speed_label, deprecated", () => {
    const card = models.image.models["bfl/flux-pro-1.1"]!;
    const compact = models.image.toCompact(card);
    expect(compact).toEqual({
      id: card.id,
      label: card.label,
      deprecated: card.deprecated,
      short_description: card.short_description,
      speed_label: card.speed_label,
      pricing: card.pricing,
    });
  });
});

describe("models.text.byTier", () => {
  it("exposes a spec for every tier", () => {
    expect(models.text.byTier.nano).toBeDefined();
    expect(models.text.byTier.mini).toBeDefined();
    expect(models.text.byTier.pro).toBeDefined();
    expect(models.text.byTier.max).toBeDefined();
  });

  it("each byTier spec has the matching id from TIER_MODEL_IDS", () => {
    for (const tier of ["nano", "mini", "pro", "max"] as const) {
      expect(models.text.byTier[tier].id).toBe(TIER_MODEL_IDS[tier]);
    }
  });
});
