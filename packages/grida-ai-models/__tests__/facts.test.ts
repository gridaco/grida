import { models } from "../src";

const tables = [
  models.text.catalog,
  models.image.models,
  models.video.models,
  models.audio.music.models,
  models.audio.sound_effects.models,
  models.audio.text_to_speech.models,
  models.three_d.models,
  models.three_d.model_generation.models,
  models.image_tools.models,
];

describe("model facts independent of service policy", () => {
  it("keeps IDs, release provenance, and provider declarations without membership policy", () => {
    for (const table of tables)
      for (const [id, card] of Object.entries(table)) {
        expect(card.id).toBe(id);
        expect(card.label.length).toBeGreaterThan(0);
        expect(card.release!.source_url).toMatch(/^https:\/\//);
        const validRelease =
          card.release!.date === null
            ? card.release!.basis === "provider_endpoint"
            : new Date(card.release!.date).toISOString().slice(0, 10) ===
              card.release!.date;
        expect(validRelease).toBe(true);
        for (const key of [
          "listed",
          "listed_reason",
          "status",
          "legacy",
          "deprecated",
          "default",
        ]) {
          expect(card).not.toHaveProperty(key);
        }
      }
    expect(models).not.toHaveProperty("snapshot");
    expect(models.text).not.toHaveProperty("byTier");
    for (const card of Object.values(models.image.models))
      expect(card).not.toHaveProperty("provider");
  });

  it("freezes factual tables and nested cards without a service dependency", () => {
    expect(() => {
      models.text.catalog["openai/gpt-5.6-luna"].cost.input = 999;
    }).toThrow(TypeError);
    expect(() => {
      models.image.models["openai/gpt-image-2"]!.providers.fal!.id = "other";
    }).toThrow(TypeError);
    expect(Object.isFrozen(models)).toBe(true);
    expect(Object.isFrozen(models.image.models)).toBe(true);
    expect(
      Object.isFrozen(
        models.text.catalog["openai/gpt-5.6-luna"].imageInputMimes
      )
    ).toBe(true);
  });

  it("keeps provider bindings self-consistent without selecting a primary route", () => {
    const media: readonly (
      | models.image.ImageModelCard
      | models.video.VideoModelCard
    )[] = [
      ...Object.values(models.image.models),
      ...Object.values(models.video.models),
    ].filter((card) => card !== undefined);
    for (const card of media) {
      expect(Object.keys(card.providers).length).toBeGreaterThan(0);
      for (const [provider, binding] of Object.entries(card.providers)) {
        expect(binding.provider).toBe(provider);
        expect(binding.id.length).toBeGreaterThan(0);
      }
    }
  });

  it("retains exact 3D discriminants and image capabilities independently of service status", () => {
    const text = models.three_d.models["fal-ai/hunyuan-3d/v3.1/pro/text-to-3d"];
    expect(text.input.max_utf8_characters).toBe(1024);
    const image = models.image.models["openai/gpt-image-2.5-flare"]!;
    expect(models.image.supportsTransparentBackground(image, "fal")).toBe(true);
    expect(
      models.image.supportsTransparentBackground(image, "openrouter")
    ).toBe(false);
  });

  it("resolves an explicit factual subset without silently using the bundled table", () => {
    const one = models.text.catalog["openai/gpt-5.6-luna"];
    expect(models.text.modelSpecById(one.id, [one])).toEqual(one);
    expect(
      models.text.modelSpecById("openai/gpt-6-astra", [one])
    ).toBeUndefined();
    expect(
      models.text.registry.resolve("openai/gpt-6-astra", undefined, [one])
    ).toBeUndefined();
  });

  it("does not alias a custom host's nested cost inputs", () => {
    const custom = {
      id: "local/model",
      cost: {
        input: 1,
        output: 2,
        longContext: {
          inputTokensAbove: 10,
          inputMultiplier: 2,
          outputMultiplier: 2,
        },
      },
    };
    const normalized = models.text.registry.normalize(custom);
    normalized.cost!.longContext!.inputMultiplier = 7;
    expect(custom.cost.longContext.inputMultiplier).toBe(2);
  });
});

describe("models.text.catalog September 22 releases", () => {
  it.each([
    {
      id: "anthropic/claude-opus-5.5",
      label: "Claude Opus 5.5",
      source: "https://www.anthropic.com/claude-opus-5-5",
      contextWindow: 1_000_000,
    },
    {
      id: "openai/gpt-6-sol",
      label: "GPT-6 Sol",
      source: "https://developers.openai.com/api/docs/changelog",
      contextWindow: 1_050_000,
    },
    {
      id: "openai/gpt-6-luna",
      label: "GPT-6 Luna",
      source: "https://developers.openai.com/api/docs/changelog",
      contextWindow: 1_050_000,
    },
  ] as const)(
    "resolves $id with its intrinsic release and published input limits",
    ({ id, label, source, contextWindow }) => {
      const spec = models.text.catalog[id];
      const bare = id.slice(id.indexOf("/") + 1);
      expect(models.text.modelSpecById(id)).toBe(spec);
      expect(models.text.modelSpecById(bare)).toBe(spec);
      expect(models.text.modelSpecById(`${bare}-2026-09-22`)).toBe(spec);
      expect(spec).toMatchObject({
        label,
        release: {
          date: "2026-09-22",
          basis: "model",
          source_url: source,
        },
        multimodal: true,
        tool_call: true,
        contextWindow,
        outputLimit: 128_000,
      });
      expect([...spec.imageInputMimes].sort()).toEqual([
        "image/gif",
        "image/jpeg",
        "image/png",
        "image/webp",
      ]);
    }
  );

  it("retains standard Opus 5.5 rates without a long-context surcharge", () => {
    const opus = models.text.catalog["anthropic/claude-opus-5.5"];
    expect(opus.cost).toEqual({
      input: 4,
      output: 20,
      cacheRead: 0.2,
      cacheWrite: 5,
    });
    expect(models.text.displayLabel(opus)).toBe("Opus 5.5");
    expect(models.text.modelSpecById("claude-opus-5")?.id).toBe(
      "anthropic/claude-opus-5"
    );
  });

  it.each([
    ["openai/gpt-6-sol", 2, 10, 0.2, 2.5],
    ["openai/gpt-6-luna", 0.1, 0.5, 0.01, 0.125],
  ] as const)(
    "keeps %s base rates separate from its request-wide long-context rule",
    (id, input, output, cacheRead, cacheWrite) => {
      expect(models.text.catalog[id].cost).toEqual({
        input,
        output,
        cacheRead,
        cacheWrite,
        longContext: {
          inputTokensAbove: 272_000,
          inputMultiplier: 2,
          outputMultiplier: 1.5,
        },
      });
    }
  );
});
