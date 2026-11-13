import type { Catalogue, PublicModel } from "./catalogue";

/** Synthetic public wire fixture; never a production fallback. */
export function catalogueFixture(): Catalogue {
  const model = (
    id: string,
    kind: PublicModel["gg"]["kind"],
    input: PublicModel["gg"]["input_modalities"],
    output: PublicModel["gg"]["output_modalities"],
    lab: string
  ): PublicModel => ({
    id,
    object: "model",
    created: 0,
    owned_by: lab,
    gg: {
      kind,
      input_modalities: input,
      output_modalities: output,
      operation_ids: kind === "three-d" ? ["three-d.test.image"] : [],
      pricing_context: kind === "three-d" ? "operation_input" : "input",
      interfaces: [kind === "text" ? "responses" : "endpoints"],
      capabilities: { streaming: kind === "text" },
      limits: { request_bytes: 1024 },
      pricing: {
        revision: "fixture-v1",
        currency: "USD",
        unit: "mill",
        measurement: "Original measured usage.",
        components: [
          {
            id: "output",
            meter: "output_tokens",
            unit: "token",
            rate_mills: "0.01",
            per_quantity: "1",
            quantity_rounding: { mode: "none", increment: null },
            when:
              kind === "three-d"
                ? { properties: { operation: { const: "three-d.test.image" } } }
                : {},
            description: "Output usage.",
            quantity_range: {
              meter: "total_input_tokens",
              min: "0",
              max: "100000",
            },
          },
        ],
      },
      card: {
        label: id.split("/")[1],
        description: "A synthetic creative model.",
        lab: {
          id: lab,
          name: `${lab} Lab`,
          url: "https://example.com",
          logo: null,
        },
        release: {
          date: null,
          source_url: "https://example.com/release",
          basis: "model",
        },
      },
    },
  });
  return {
    object: "list",
    revision: "fixture-v1",
    cards: {
      version: "1.0.0",
      commit: "a".repeat(40),
      url: "https://example.com/release",
    },
    next_change_at: null,
    data: [
      model("alpha/Éclair", "text", ["image", "text"], ["text"], "alpha"),
      model("beta/mesh", "three-d", ["image"], ["three-d"], "beta"),
      model("beta/music", "music", ["image", "text"], ["audio"], "beta"),
    ],
  };
}

/** Mixed snapshot covering additive speech kinds and their measured price units. */
export function speechCatalogueFixture(): Catalogue {
  const catalogue = catalogueFixture();
  const speech = (
    id: string,
    operation: string,
    unit: "character" | "second",
    rate_mills: string
  ): PublicModel => {
    const model = structuredClone(catalogue.data[0]);
    const tts = unit === "character";
    model.id = id;
    model.owned_by = "elevenlabs";
    model.gg.kind = "speech";
    model.gg.input_modalities = ["text"];
    model.gg.output_modalities = ["audio"];
    model.gg.operation_ids = [operation];
    model.gg.interfaces = ["endpoints"];
    model.gg.capabilities = {
      streaming: false,
      speech_generation: tts,
      sound_effects_generation: !tts,
    };
    model.gg.card.label = id;
    model.gg.card.lab = {
      id: "elevenlabs",
      name: "ElevenLabs",
      url: "https://example.com",
      logo: null,
    };
    model.gg.pricing.components = [
      {
        id: tts ? "speech_characters" : "audio_seconds",
        meter: tts ? "speech_characters" : "audio_seconds",
        unit,
        rate_mills,
        per_quantity: "1",
        quantity_rounding: { mode: "none", increment: null },
        when: {},
        description: "Original measured usage.",
      },
    ];
    return model;
  };
  catalogue.data.push(
    speech(
      "eleven_v4",
      "speech.elevenlabs.eleven-v4.generate",
      "character",
      "0.08"
    ),
    speech(
      "eleven_v4_turbo",
      "speech.elevenlabs.eleven-v4-turbo.generate",
      "character",
      "0.04"
    ),
    speech(
      "eleven_text_to_sound_v3",
      "speech.elevenlabs.sound-effects-v3.generate",
      "second",
      "2"
    )
  );
  catalogue.data.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return catalogue;
}

/** A future additive vocabulary, without teaching the consumer those values. */
export function futureCatalogueFixture() {
  const catalogue = catalogueFixture();
  const model = structuredClone(catalogue.data[0]);
  model.id = "future/audio-analysis";
  model.gg.kind = "audio-analysis";
  model.gg.input_modalities = ["constructor", "pdf", "text"];
  model.gg.output_modalities = ["audio", "spatial"];
  model.gg.pricing_context = "session_input";
  model.gg.card.release = {
    date: "2026-11-12",
    source_url: "https://example.com/release",
    basis: "provider_revision",
  };
  model.gg.pricing.components = [
    {
      id: "session_input_frames",
      meter: "session_input_frames",
      unit: "audio_frame",
      rate_mills: "12.500",
      per_quantity: "3",
      quantity_rounding: { mode: "none", increment: null },
      when: {},
      description: "Measured frame usage.",
    },
  ];
  return {
    ...catalogue,
    data: [
      ...catalogue.data,
      {
        ...model,
        gg: {
          ...model.gg,
          future_metadata: { ignored: true },
          card: {
            ...model.gg.card,
            lab: {
              ...model.gg.card.lab,
              logo: {
                url: "https://example.com/animated.avif",
                media_type: "image/avif",
                kind: "animated",
              },
            },
          },
        },
      },
    ],
  };
}
