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
