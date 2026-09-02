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

describe("models.image provider-binding invariants", () => {
  it("every card has at least one provider binding", () => {
    for (const card of Object.values(models.image.models)) {
      if (!card) continue;
      expect(Object.keys(card.providers).length).toBeGreaterThan(0);
    }
  });

  it("each binding's provider field matches its key", () => {
    for (const card of Object.values(models.image.models)) {
      if (!card) continue;
      for (const [key, b] of Object.entries(card.providers)) {
        if (!b) continue;
        expect(b.provider).toBe(key);
      }
    }
  });

  it("the card's primary provider has a matching binding", () => {
    for (const card of Object.values(models.image.models)) {
      if (!card) continue;
      expect(card.providers[card.provider]).toBeDefined();
    }
  });

  it("listed cards are universal (served by every supported provider)", () => {
    // The one-key promise: a single connected provider serves every listed
    // card. If a listed card loses a binding, this fails loudly.
    const ALL: models.image.ImageProvider[] = ["vercel", "fal", "openrouter"];
    for (const card of models.image.listed_models()) {
      for (const p of ALL) {
        expect(models.image.binding(card, p)).not.toBeNull();
      }
    }
  });

  it("binding() resolves a present provider and nulls an absent one", () => {
    const kontext = models.image.models["bfl/flux-kontext-max"]!;
    expect(models.image.binding(kontext, "fal")?.id).toBe(
      "fal-ai/flux-pro/kontext/max"
    );
    // Not on OpenRouter → no binding (why it is not listed).
    expect(models.image.binding(kontext, "openrouter")).toBeNull();
  });

  it("listed_models returns only listed cards", () => {
    for (const card of models.image.listed_models()) {
      expect(card.listed).toBe(true);
    }
  });
});

describe("models.audio.music catalogue invariants", () => {
  it("lists only the Replicate-backed music ids", () => {
    expect(models.audio.music.model_ids).toEqual([
      "google/lyria-3",
      "google/lyria-3-pro",
    ]);
    expect(models.audio.music.is_model_id("google/lyria-3")).toBe(true);
    expect(models.audio.music.is_model_id("eleven_text_to_sound_v2")).toBe(
      false
    );
  });

  it("lists the integrated music models", () => {
    expect(models.audio.music.listed_models().map((card) => card.id)).toEqual([
      "google/lyria-3",
      "google/lyria-3-pro",
    ]);
  });

  it("grounds Lyria as image-conditioned music with Replicate's flat meter", () => {
    for (const card of Object.values(models.audio.music.models)) {
      expect(card.provider).toBe("replicate");
      expect(card.input).toEqual({
        modalities: ["text", "image"],
        max_images: 10,
      });
      expect(card.output.default_format).toBe("mp3");
      expect(card.output.sample_rate_hz).toBe(48_000);
      expect(card.output.channels).toBe(2);
      expect(card.pricing.type).toBe("per_run_flat");
      expect(card.pricing.usd).toBeGreaterThan(0);
      expect(card.avg_cost_usd).toBe(card.pricing.usd);
    }
  });
});

describe("models.audio.sound_effects catalogue invariants", () => {
  it("keeps the exact ElevenLabs model staged", () => {
    expect(models.audio.sound_effects.model_ids).toEqual([
      "eleven_text_to_sound_v2",
    ]);
    expect(
      models.audio.sound_effects.staged_models().map((card) => card.id)
    ).toEqual(["eleven_text_to_sound_v2"]);
  });

  it("stores ElevenLabs' exact SFX id, IO limits, and provider-credit meter", () => {
    const card = models.audio.sound_effects.models.eleven_text_to_sound_v2;
    expect(card).toMatchObject({
      id: "eleven_text_to_sound_v2",
      vendor: "elevenlabs",
      provider: "elevenlabs",
      status: "staged",
      input: { type: "text" },
      output: {
        default_format: "mp3",
        formats: ["mp3"],
        sample_rate_hz: 44_100,
        duration: {
          mode: "automatic_or_fixed",
          min_seconds: 0.5,
          max_seconds: 30,
        },
      },
      pricing: {
        type: "provider_credits",
        automatic_duration_credits: 100,
        specified_duration_credits_per_second: 11,
      },
      avg_cost_usd: null,
    });
  });
});

describe("models.three_d catalogue invariants", () => {
  const expectedIds = [
    "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
    "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d",
    "fal-ai/trellis-2",
  ] as const;

  it("uses exact fal endpoint ids and keeps every route staged", () => {
    expect(models.three_d.three_d_model_ids).toEqual(expectedIds);
    expect(models.three_d.text_to_three_d_model_ids).toEqual([
      "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
    ]);
    expect(models.three_d.image_to_three_d_model_ids).toEqual([
      "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d",
      "fal-ai/trellis-2",
    ]);
    expect(models.three_d.listed_models()).toEqual([]);
    expect(models.three_d.staged_models().map((card) => card.id)).toEqual(
      expectedIds
    );

    for (const [id, card] of Object.entries(models.three_d.models)) {
      expect(card.id).toBe(id);
      expect(card.provider).toBe("fal");
      expect(card.status).toBe("staged");
    }
  });

  it("keeps category, required input, and guaranteed output aligned", () => {
    for (const card of Object.values(models.three_d.models)) {
      expect(card.category).toBe(`3d/${card.input.type}-to-3d`);
      expect(card.output.primary).toBe("glb");
      expect(card.output.optional).not.toContain("glb");
    }

    const text = models.three_d.models["fal-ai/hunyuan-3d/v3.1/pro/text-to-3d"];
    expect(text.input).toEqual({
      type: "text",
      max_utf8_characters: 1024,
    });

    const image =
      models.three_d.models["fal-ai/hunyuan-3d/v3.1/pro/image-to-3d"];
    expect(image.input).toEqual({
      type: "image",
      min_images: 1,
      max_images: 8,
    });
    expect(image.output.optional).toEqual(["fbx", "obj", "usdz"]);

    expect(models.three_d.models["fal-ai/trellis-2"].output.optional).toEqual(
      []
    );
  });

  it("does not flatten Hunyuan surcharges or TRELLIS.2 resolution tiers", () => {
    const text = models.three_d.models["fal-ai/hunyuan-3d/v3.1/pro/text-to-3d"];
    expect(text.pricing).toEqual({
      type: "per_generation_base_plus_surcharges",
      base_usd: 0.375,
      surcharges_usd: { pbr: 0.15, custom_face_count: 0.15 },
    });

    const image =
      models.three_d.models["fal-ai/hunyuan-3d/v3.1/pro/image-to-3d"];
    expect(image.pricing).toEqual({
      type: "per_generation_base_plus_surcharges",
      base_usd: 0.375,
      surcharges_usd: {
        pbr: 0.15,
        multi_view: 0.15,
        custom_face_count: 0.15,
      },
    });

    const trellis = models.three_d.models["fal-ai/trellis-2"];
    expect(trellis.pricing).toEqual({
      type: "per_generation_by_resolution",
      default_resolution: "1024",
      usd_by_resolution: { "512": 0.25, "1024": 0.3, "1536": 0.35 },
    });
    expect(trellis.avg_cost_usd).toBe(
      trellis.pricing.usd_by_resolution[trellis.pricing.default_resolution]
    );
  });
});

describe("models.video catalogue invariants", () => {
  it("every dict key resolves to a defined card", () => {
    for (const id of Object.keys(models.video.models)) {
      expect(models.video.models[id]).toBeDefined();
    }
  });

  it("only catalogues selectable video models with a supported provider binding", () => {
    for (const card of Object.values(models.video.models)) {
      if (!card) continue;
      expect(card.listed).toBe(true);
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
    // OpenRouter serves Veo + Seedance (verified rates).
    expect(models.video.binding(veo, "openrouter")?.id).toBe("google/veo-3.1");

    const grok = models.video.models["xai/grok-imagine-video-1.5"]!;
    expect(grok).toMatchObject({ min_duration: 1, max_duration: 15 });
    // Vercel serves every xAI model under `spacexai/`, so the call id is not
    // this card's canonical `xai/` id. Reusing the canonical id here is a 404
    // at call time — which is how the binding was first shipped.
    // https://vercel.com/ai-gateway/models/grok-imagine-video-1.5
    expect(models.video.binding(grok, "vercel")).toMatchObject({
      id: "spacexai/grok-imagine-video-1.5",
      pricing: {
        usd_per_second: {
          "480p": { audio: 0.08 },
          "720p": { audio: 0.14 },
          "1080p": { audio: 0.25 },
        },
        usd_per_input_image: 0.01,
      },
    });
    expect(models.video.binding(grok, "fal")?.id).toBe(
      "xai/grok-imagine-video/v1.5/image-to-video"
    );
    expect(models.video.binding(grok, "fal")?.pricing).toMatchObject({
      usd_per_second: {
        "480p": { audio: 0.08 },
        "720p": { audio: 0.14 },
        "1080p": { audio: 0.25 },
      },
      usd_per_input_image: 0.01,
    });
    expect(models.video.binding(grok, "fal")?.avg_cost_usd).toBe(0.71);
    // Grok 1.5 is NOT on OpenRouter (only 1.0) — correctly absent.
    expect(models.video.binding(grok, "openrouter")).toBeNull();
  });

  it("listed video models are enabled and each has at least one binding", () => {
    const listed = models.video.listed_models();
    expect(listed.length).toBeGreaterThan(0);
    for (const card of listed) {
      expect(card.listed).toBe(true);
      // Video is fragmented (no universality guarantee) — only require that a
      // listed model is servable by SOME provider.
      expect(Object.keys(card.providers).length).toBeGreaterThan(0);
    }
  });
});

describe("models.text.byTier", () => {
  it("pins the accepted capability and cost topology", () => {
    expect(TIER_MODEL_IDS).toEqual({
      nano: "openai/gpt-5.6-luna",
      mini: "openai/gpt-5.6-luna",
      pro: "openai/gpt-5.6-terra",
      max: "openai/gpt-5.6-sol",
    });
  });

  // `nano` is the cheapest model still good enough for background work,
  // so it may equal `mini` (it does today — see TIER_MODEL_IDS in
  // ../src/tiers.ts) but must never cost more. Guards the tier order
  // against a repoint that quietly makes cheap work expensive.
  it("keeps nano at or below mini on every cost bucket", () => {
    const nano = models.text.byTier.nano.cost;
    const mini = models.text.byTier.mini.cost;

    // Cache buckets are optional per card. An absent bucket bills
    // nothing, so it normalises to 0 — which keeps the comparison
    // unconditional and still catches a nano card that bills for a
    // bucket mini does not.
    const buckets = [
      ["input", nano.input, mini.input],
      ["output", nano.output, mini.output],
      ["cacheRead", nano.cacheRead ?? 0, mini.cacheRead ?? 0],
      ["cacheWrite", nano.cacheWrite ?? 0, mini.cacheWrite ?? 0],
    ] as const;

    const violations = buckets
      .filter(([, nanoRate, miniRate]) => nanoRate > miniRate)
      .map(
        ([bucket, nanoRate, miniRate]) =>
          `${bucket}: nano ${nanoRate} > mini ${miniRate}`
      );

    expect(violations).toEqual([]);
  });

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

describe("models.text current catalogue", () => {
  const longContext = {
    inputTokensAbove: 272_000,
    inputMultiplier: 2,
    outputMultiplier: 1.5,
  } as const;

  const newModels = [
    {
      id: "openai/gpt-5.6-sol",
      contextWindow: 1_050_000,
      outputLimit: 128_000,
      // Deliberately below GPT-5.5's $5/$30 — Sol is the cheaper successor,
      // and this card once carried 5.5's rates by mistake.
      cost: {
        input: 4,
        output: 20,
        cacheRead: 0.4,
        cacheWrite: 5,
        longContext,
      },
    },
    {
      id: "openai/gpt-5.6-terra",
      contextWindow: 1_050_000,
      outputLimit: 128_000,
      cost: {
        input: 2,
        output: 12,
        cacheRead: 0.2,
        cacheWrite: 2.5,
        longContext,
      },
    },
    {
      id: "openai/gpt-5.6-luna",
      contextWindow: 1_050_000,
      outputLimit: 128_000,
      cost: {
        input: 0.2,
        output: 1.2,
        cacheRead: 0.02,
        cacheWrite: 0.25,
        longContext,
      },
    },
    {
      id: "anthropic/claude-fable-5.1",
      contextWindow: 1_000_000,
      outputLimit: 128_000,
      // Same card as Fable 5 apart from the cache read, which is the whole
      // reason this entry is pinned separately.
      cost: { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
    },
    {
      id: "anthropic/claude-fable-5",
      contextWindow: 1_000_000,
      outputLimit: 128_000,
      cost: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
    },
    {
      id: "anthropic/claude-opus-5",
      contextWindow: 1_000_000,
      outputLimit: 128_000,
      cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
    },
    {
      id: "anthropic/claude-sonnet-5",
      contextWindow: 1_000_000,
      outputLimit: 128_000,
      cost: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
    },
    {
      id: "google/gemini-3.7-flash",
      contextWindow: 1_048_576,
      outputLimit: 65_536,
      // Steady state, not Google's promotional rate through 2026-12-31.
      cost: { input: 1.5, output: 7.5, cacheRead: 0.15 },
    },
    {
      id: "google/gemini-3.1-pro-preview",
      contextWindow: 1_048_576,
      outputLimit: 65_536,
      cost: {
        input: 2,
        output: 12,
        cacheRead: 0.2,
        longContext: {
          inputTokensAbove: 200_000,
          inputMultiplier: 2,
          outputMultiplier: 1.5,
        },
      },
    },
  ] as const;

  it.each(newModels)("stores the published $id rate card", (expected) => {
    const spec = models.text.catalog[expected.id];
    expect(spec.contextWindow).toBe(expected.contextWindow);
    expect(spec.outputLimit).toBe(expected.outputLimit);
    expect(spec.cost).toEqual(expected.cost);
  });

  it("keeps the published long-context rule on every affected OpenAI card", () => {
    for (const id of [
      "openai/gpt-5.5",
      "openai/gpt-5.6-sol",
      "openai/gpt-5.6-terra",
      "openai/gpt-5.6-luna",
    ] as const) {
      expect(models.text.catalog[id].cost.longContext).toEqual(longContext);
    }
    expect(
      models.text.catalog["openai/gpt-5.5-pro"].cost.longContext
    ).toBeUndefined();
  });

  it("multiplies Gemini 3.1 Pro out to Google's published banded rates", () => {
    // The catalogue stores base rates plus multipliers; Google publishes the
    // banded rates directly. This is where the two are held to agree — the
    // cost function's own tests assert totals, not rates.
    const { input, output, cacheRead, longContext } =
      models.text.catalog["google/gemini-3.1-pro-preview"].cost;
    expect(longContext).toBeDefined();
    expect(input * longContext!.inputMultiplier).toBe(4);
    expect(cacheRead! * longContext!.inputMultiplier).toBeCloseTo(0.4);
    expect(output * longContext!.outputMultiplier).toBe(18);
  });

  it("keeps catalogue lifecycle markers scoped to the requested models", () => {
    expect(models.text.catalog["openai/gpt-5.5"].deprecated).toBe(true);
    expect(
      models.text.catalog["openai/gpt-5.5-pro"].deprecated
    ).toBeUndefined();
    expect(
      models.text.catalog["anthropic/claude-fable-5.1"].deprecated
    ).toBeUndefined();
    expect(models.text.catalog["anthropic/claude-fable-5"].deprecated).toBe(
      true
    );
    expect(
      models.text.catalog["anthropic/claude-opus-5"].deprecated
    ).toBeUndefined();
    expect(models.text.catalog["anthropic/claude-opus-4.8"].deprecated).toBe(
      true
    );
  });
});

describe("models.text image-input MIME capabilities", () => {
  const expectedByCreator = {
    openai: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    anthropic: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    google: [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/heic",
      "image/heif",
    ],
  } as const;

  it("keeps every static entry explicit and consistent with broad support", () => {
    for (const spec of Object.values(models.text.catalog)) {
      expect(Array.isArray(spec.imageInputMimes)).toBe(true);
      expect(spec.imageInputMimes.length === 0 || spec.multimodal).toBe(true);
    }
  });

  it("preserves source-backed format differences between creators", () => {
    for (const spec of Object.values(models.text.catalog)) {
      const creator = spec.id.split(
        "/",
        1
      )[0] as keyof typeof expectedByCreator;
      expect(spec.imageInputMimes).toEqual(expectedByCreator[creator]);
    }

    expect(
      models.text.catalog["google/gemini-3.7-flash"].imageInputMimes
    ).toContain("image/heic");
    expect(
      models.text.catalog["openai/gpt-5.4-mini"].imageInputMimes
    ).not.toContain("image/heic");
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
