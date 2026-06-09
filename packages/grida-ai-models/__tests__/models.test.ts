import models, { TIER_MODEL_IDS } from "..";

describe("models.image.findImageModelCard", () => {
  it("resolves a full vercel id", () => {
    const card = models.image.findImageModelCard("bfl/flux-pro-1.1");
    expect(card?.id).toBe("bfl/flux-pro-1.1");
    expect(card?.label).toBe("Flux Pro 1.1");
  });

  it("resolves the deprecated ProviderModel wrapper", () => {
    const card = models.image.findImageModelCard({
      provider: "vercel",
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

describe("models.video catalogue invariants", () => {
  it("every dict key resolves to a defined card", () => {
    for (const id of Object.keys(models.video.models)) {
      expect(models.video.models[id]).toBeDefined();
    }
  });

  it("every card has at least one provider binding", () => {
    for (const card of Object.values(models.video.models)) {
      if (!card) continue;
      expect(Object.keys(card.providers).length).toBeGreaterThan(0);
    }
  });

  it("each binding's provider field matches its key", () => {
    for (const card of Object.values(models.video.models)) {
      if (!card) continue;
      for (const [key, b] of Object.entries(card.providers)) {
        if (!b) continue;
        expect(b.provider).toBe(key);
      }
    }
  });

  it("every binding prices the model's default (resolution, audio mode)", () => {
    // Provider-selection is deferred, so the contract is route-agnostic: any
    // provider the runtime later picks must be able to serve the default
    // config. Every binding therefore prices `default.resolution` at the
    // default audio mode.
    for (const card of Object.values(models.video.models)) {
      if (!card) continue;
      const mode = card.default.audio ? "audio" : "silent";
      for (const b of Object.values(card.providers)) {
        if (!b) continue;
        expect(
          b.pricing.usd_per_second[card.default.resolution]?.[mode]
        ).toBeGreaterThan(0);
      }
    }
  });

  it("binding() resolves a present provider and nulls an absent one", () => {
    const veo = models.video.models["google/veo-3.1"]!;
    // fal keys the capability into the id — this is the image-to-video endpoint.
    expect(models.video.binding(veo, "fal")?.id).toBe(
      "fal-ai/veo3.1/image-to-video"
    );
    expect(models.video.binding(veo, "vercel")?.id).toBe(
      "google/veo-3.1-generate-001"
    );
    // OpenRouter has no verified per-second meter yet → no binding.
    expect(models.video.binding(veo, "openrouter")).toBeNull();

    const grok = models.video.models["xai/grok-imagine-video-1.5"]!;
    expect(models.video.binding(grok, "fal")?.id).toBe(
      "xai/grok-imagine-video/v1.5/image-to-video"
    );
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

describe("models.text.displayLabel", () => {
  it("returns the curated short name when present", () => {
    const spec = models.text.catalog["anthropic/claude-opus-4.8"];
    expect(spec.short_label).toBe("Opus 4.8");
    expect(models.text.displayLabel(spec)).toBe("Opus 4.8");
  });

  it("falls back to the full label when short_label is unset", () => {
    const spec = models.text.catalog["openai/gpt-5.4-nano"];
    expect(spec.short_label).toBeUndefined();
    expect(models.text.displayLabel(spec)).toBe(spec.label);
  });

  it("drops the 'Preview' suffix for the Gemini 3.1 Pro preview", () => {
    const spec = models.text.catalog["google/gemini-3.1-pro-preview"];
    expect(spec.label).toBe("Gemini 3.1 Pro Preview");
    expect(models.text.displayLabel(spec)).toBe("Gemini 3.1 Pro");
  });
});
