// Project public facts into the interfaces implemented by this client release.
// These field names describe client compatibility, not another authored model list.
const fields = {
  "text.catalog": [
    "id",
    "label",
    "release",
    "multimodal",
    "image_input_mimes",
    "tool_call",
    "context_window",
    "output_limit",
    "cost",
    "short_label",
  ],
  "image.models": [
    "id",
    "label",
    "release",
    "short_description",
    "vendor",
    "transparent_background",
    "providers",
    "speed_label",
    "speed_max",
    "styles",
    "sizes",
    "constraints",
    "pricing",
    "avg_cost_usd",
    "quality",
  ],
  "video.models": [
    "id",
    "label",
    "release",
    "short_description",
    "vendor",
    "aspect_ratios",
    "min_duration",
    "max_duration",
    "audio",
    "speed_label",
    "url",
    "providers",
  ],
  "audio.music.models": [
    "id",
    "label",
    "release",
    "short_description",
    "vendor",
    "provider",
    "input",
    "output",
    "duration_label",
    "output_format",
    "sample_rate_label",
    "speed_label",
    "speed_max",
    "pricing",
    "avg_cost_usd",
    "url",
  ],
  "audio.sound_effects.models": [
    "id",
    "label",
    "release",
    "short_description",
    "vendor",
    "provider",
    "input",
    "output",
    "duration_label",
    "output_format",
    "sample_rate_label",
    "pricing",
    "avg_cost_usd",
    "url",
  ],
  "audio.text_to_speech.models": [
    "id",
    "label",
    "release",
    "short_description",
    "vendor",
    "provider",
    "input",
    "output",
    "output_format",
    "sample_rate_label",
    "pricing",
    "url",
  ],
  "three_d.models": [
    "id",
    "label",
    "release",
    "short_description",
    "vendor",
    "provider",
    "category",
    "input",
    "output",
    "pricing",
    "avg_cost_usd",
    "url",
  ],
  "three_d.model_generation.models": [
    "vendor",
    "provider",
    "feature",
    "inputs",
    "output",
    "texture_quality",
    "id",
    "label",
    "binding_id",
    "preview",
    "release",
    "short_description",
    "face_limit",
    "geometry_quality",
    "pricing",
    "url",
  ],
  "three_d.rigging.models": [
    "vendor",
    "provider",
    "feature",
    "specs",
    "input",
    "output",
    "pricing",
    "release",
    "url",
    "id",
    "label",
    "binding_id",
    "short_description",
    "rig_types",
  ],
  "three_d.rig_check.operation": [
    "feature",
    "provider",
    "binding_id",
    "input",
    "rig_types",
    "pricing",
    "url",
  ],
  "image_tools.models": [
    "id",
    "label",
    "release",
    "url",
    "category",
    "cost_usd",
  ],
  "embedding.models": [
    "id",
    "label",
    "release",
    "deprecated",
    "short_description",
    "vendor",
    "category",
    "dimensions",
    "normalized",
    "multimodal",
    "pricing",
    "avg_cost_usd",
    "url",
  ],
};
const pick = (value, keys) =>
  Object.fromEntries(
    keys
      .filter((key) => Object.hasOwn(value, key))
      .map((key) => [key, value[key]])
  );

function perMillion(rate) {
  if (typeof rate !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(rate))
    throw Error("Invalid decimal token price");
  const value = Number(`${rate}e6`);
  if (!Number.isFinite(value) || value < 0)
    throw Error("Invalid decimal token price");
  return value;
}

function textCost(card) {
  if (card.cost) return card.cost;
  // The installed text adapter supports these provider meters. An absent native
  // regular price remains absent in Models; this is explicitly a provider quote.
  const price = card.providers?.vercel?.token_pricing;
  if (!price || price.unit !== "usd_per_token")
    throw Error(`No compatible text price: ${card.id}`);
  const result = {
    input: perMillion(price.input),
    output: perMillion(price.output),
  };
  if (price.input_cache_read !== undefined)
    result.cache_read = perMillion(price.input_cache_read);
  if (price.input_cache_write !== undefined)
    result.cache_write = perMillion(price.input_cache_write);
  // Only represent the established two-band request-wide shape; reject a new
  // meter arrangement rather than flattening tiered costs into one rate.
  if (price.tiers?.length) {
    const input = price.tiers.filter((tier) => tier.meter === "input");
    const output = price.tiers.filter((tier) => tier.meter === "output");
    if (
      input.length !== 2 ||
      output.length !== 2 ||
      input[0].minimum_input_tokens !== 0 ||
      output[0].minimum_input_tokens !== 0 ||
      input[1].minimum_input_tokens !== output[1].minimum_input_tokens ||
      input[0].maximum_input_tokens !== input[1].minimum_input_tokens ||
      output[0].maximum_input_tokens !== output[1].minimum_input_tokens
    )
      throw Error(`Unsupported text price tiers: ${card.id}`);
    result.long_context = {
      input_tokens_above: input[1].minimum_input_tokens,
      input_multiplier:
        perMillion(input[1].usd_per_token) / perMillion(price.input),
      output_multiplier:
        perMillion(output[1].usd_per_token) / perMillion(price.output),
    };
  }
  if (
    Object.values(result).some(
      (value) =>
        typeof value === "number" && (!Number.isFinite(value) || value < 0)
    )
  )
    throw Error(`Invalid text price: ${card.id}`);
  return result;
}

function mediaProviders(card, family) {
  const providers = {};
  for (const provider of ["vercel", "fal", "openrouter"]) {
    const binding = card.providers?.[provider];
    if (!binding) continue;
    const endpoint = binding.endpoints?.find(
      (value) =>
        value.id === binding.id &&
        ["text", "image", "text-or-image"].includes(value.input)
    );
    const input = binding.input ?? endpoint?.input;
    const supported =
      family === "image.models"
        ? ["per_image_flat", "per_image_tiered", "per_token"].includes(
            binding.pricing?.type
          ) &&
          (binding.pricing?.type !== "per_token" ||
            (typeof binding.pricing.input === "number" &&
              typeof binding.pricing.output === "number"))
        : ["per_second", "provider_skus"].includes(binding.pricing?.type) &&
          ["text", "image", "text-or-image"].includes(input);
    // Exact token SKU prices remain public facts, never guessed USD/second.
    // Unknown route/input contracts are not native adapter support.
    if (!supported) continue;
    const value = pick(binding, [
      "provider",
      "id",
      "pricing",
      "avg_cost_usd",
      "deprecated",
      "url",
      family === "image.models" ? "transparent_background" : "input",
      "references",
    ]);
    value.pricing = structuredClone(value.pricing);
    if (family === "video.models") value.input = input;
    providers[provider] = value;
  }
  if (!Object.keys(providers).length)
    throw Error(`No implemented provider binding: ${card.id}`);
  return providers;
}

export function projectFacts(source, presets) {
  const result = {};
  for (const [family, keys] of Object.entries(fields)) {
    if (family === "three_d.rig_check.operation") {
      result[family] = pick(source[family], keys);
      continue;
    }
    const policy =
      presets.definitions[family.replace(/\.(models|catalog)$/, "")];
    const ids =
      family === "embedding.models"
        ? [presets.library_embedding.model_id]
        : Object.keys(policy?.members ?? {});
    if (!ids.length) throw Error(`Missing product membership: ${family}`);
    result[family] = Object.fromEntries(
      ids.map((id) => {
        const original = source[family]?.[id];
        if (!original || original.id !== id)
          throw Error(`Unknown public model: ${family}:${id}`);
        const card = pick(original, keys);
        if (family === "text.catalog") card.cost = textCost(original);
        if (family === "image.models" || family === "video.models")
          card.providers = mediaProviders(original, family);
        if (family === "embedding.models") {
          card.dimensions = presets.library_embedding.dimensions;
          card.normalized = presets.library_embedding.normalized;
        }
        return [id, card];
      })
    );
  }
  return result;
}
