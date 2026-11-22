/** Text model bindings published in a Models V2 release. */
export interface CatalogueTextBinding {
  readonly wireModel: string;
  readonly tools: boolean;
  readonly reasoning: boolean;
  readonly imageInput: boolean;
  readonly streaming?: boolean;
  readonly contextWindow?: number;
  readonly outputLimit?: number;
}

export interface CatalogueTextModel {
  readonly id: string;
  readonly label: string;
  readonly shortLabel?: string;
  readonly contextWindow?: number;
  readonly outputLimit?: number;
  readonly imageInputMimes: readonly string[];
  readonly tools: boolean;
  readonly bindings: Readonly<Record<string, CatalogueTextBinding>>;
}

export interface CatalogueAgentSelector {
  readonly canonicalModelId: string;
  readonly serviceTiers: Readonly<Record<string, string | undefined>>;
}

export interface CatalogueVisualBinding {
  readonly id: string;
  readonly input?: string;
  readonly endpoints: readonly Readonly<{ id: string; input: string }>[];
  readonly references?: Readonly<{ id: string; max: number }>;
  readonly transparentBackground?: boolean;
  readonly pricingType?: string;
  readonly scalarTokenPricing: boolean;
  readonly deprecated: boolean;
}

export interface CatalogueVisualOptions {
  readonly constraints?: Readonly<{ max_edge: number }>;
  readonly quality?: Readonly<{ options: readonly string[]; default?: string }>;
  readonly pricing?: Readonly<{ type: string }>;
  readonly aspect_ratios?: readonly string[];
  readonly min_duration?: number;
  readonly max_duration?: number;
}

export interface CatalogueVisualModel {
  readonly id: string;
  readonly label: string;
  readonly vendor?: string;
  readonly shortDescription?: string;
  readonly options?: CatalogueVisualOptions;
  readonly releaseDate?: string;
  readonly deprecated: boolean;
  readonly transparentBackground: boolean;
  readonly bindings: Readonly<Record<string, CatalogueVisualBinding>>;
}

export type CatalogueVisualKind = "image" | "video";
export type CatalogueVisualModels = Readonly<
  Record<CatalogueVisualKind, Readonly<Record<string, CatalogueVisualModel>>>
>;

export interface ModelCatalogueSnapshot {
  readonly version: string;
  readonly text: Readonly<Record<string, CatalogueTextModel>>;
  readonly visual?: CatalogueVisualModels;
  readonly agents: Readonly<
    Record<string, Readonly<Record<string, CatalogueAgentSelector>> | undefined>
  >;
}

export function isModelCatalogueVersion(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^2\.[1-9][0-9]{7}\.(?:0|[1-9][0-9]{0,5})$/.test(value)
  );
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid Models V2 record");
  return value as Record<string, unknown>;
}

function token(value: unknown): string {
  if (typeof value !== "string" || !value || /[\s\p{Cc}]/u.test(value))
    throw new Error("Invalid Models V2 identifier");
  return value;
}

function limit(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

function textModel(id: string, value: unknown): CatalogueTextModel {
  const row = record(value);
  const { label, short_label: shortLabel } = row;
  if (
    row.id !== id ||
    typeof label !== "string" ||
    !label.trim() ||
    /\p{C}/u.test(label) ||
    (shortLabel !== undefined &&
      (typeof shortLabel !== "string" ||
        !shortLabel.trim() ||
        /\p{C}/u.test(shortLabel)))
  )
    throw new Error("Invalid Models V2 text model");
  const bindings: Record<string, CatalogueTextBinding> = Object.create(null);
  for (const [provider, entry] of Object.entries(record(row.providers ?? {}))) {
    const binding = record(entry);
    if (binding.provider !== provider)
      throw new Error("Invalid Models V2 provider");
    const wireModel = token(binding.id);
    const capabilities = record(binding.capabilities ?? {});
    const limits = record(binding.limits ?? {});
    bindings[provider] = Object.freeze({
      wireModel,
      tools: capabilities.tools === true,
      reasoning: capabilities.reasoning === true,
      imageInput: capabilities.image_input === true,
      streaming:
        typeof capabilities.streaming === "boolean"
          ? capabilities.streaming
          : undefined,
      contextWindow: limit(limits.context_tokens),
      outputLimit: limit(limits.max_output_tokens),
    });
  }
  const mimes = row.image_input_mimes ?? [];
  if (!Array.isArray(mimes) || !mimes.every((mime) => typeof mime === "string"))
    throw new Error("Invalid Models V2 image input formats");
  return Object.freeze({
    id,
    label,
    ...(shortLabel !== undefined && { shortLabel }),
    bindings: Object.freeze(bindings),
    tools: row.tool_call === true,
    imageInputMimes: Object.freeze([...mimes]),
    contextWindow: limit(row.context_window),
    outputLimit: limit(row.output_limit),
  });
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() && !/\p{C}/u.test(value)
    ? value
    : undefined;
}

function visualOptions(row: Record<string, unknown>): CatalogueVisualOptions {
  const constraints = record(row.constraints ?? {});
  const pricing = record(row.pricing ?? {});
  const quality = record(row.quality ?? {});
  const maxEdge = limit(constraints.max_edge);
  const minDuration = limit(row.min_duration);
  const maxDuration = limit(row.max_duration);
  const modes = Array.isArray(quality.options)
    ? quality.options.filter(
        (option): option is string =>
          typeof option === "string" && /^[a-z0-9_-]{1,32}$/i.test(option)
      )
    : [];
  const aspectRatios = Array.isArray(row.aspect_ratios)
    ? row.aspect_ratios.filter(
        (ratio): ratio is string =>
          typeof ratio === "string" && /^\d{1,4}:\d{1,4}$/.test(ratio)
      )
    : [];
  return Object.freeze({
    ...(maxEdge && { constraints: Object.freeze({ max_edge: maxEdge }) }),
    ...(pricing.type === "per_image_tiered" && {
      pricing: Object.freeze({ type: "per_image_tiered" as const }),
    }),
    ...(modes.length && {
      quality: Object.freeze({
        options: Object.freeze(modes),
        ...(typeof quality.default === "string" &&
          modes.includes(quality.default) && { default: quality.default }),
      }),
    }),
    ...(aspectRatios.length && { aspect_ratios: Object.freeze(aspectRatios) }),
    ...(minDuration && { min_duration: minDuration }),
    ...(maxDuration && { max_duration: maxDuration }),
  });
}

function visualModels(
  family: unknown
): Readonly<Record<string, CatalogueVisualModel>> {
  const result: Record<string, CatalogueVisualModel> = Object.create(null);
  for (const [id, value] of Object.entries(record(family ?? {}))) {
    const row = record(value);
    const label = optionalText(row.label);
    if (token(id) !== row.id || !label)
      throw new Error("Invalid Models V2 visual model");
    const bindings: Record<string, CatalogueVisualBinding> =
      Object.create(null);
    for (const [provider, value] of Object.entries(
      record(row.providers ?? {})
    )) {
      const binding = record(value);
      if (provider !== binding.provider)
        throw new Error("Invalid Models V2 provider");
      const pricing = record(binding.pricing ?? {});
      const references = record(binding.references ?? {});
      const count = limit(references.max);
      const endpoints = Array.isArray(binding.endpoints)
        ? binding.endpoints
        : [];
      bindings[provider] = Object.freeze({
        id: token(binding.id),
        input: optionalText(binding.input),
        endpoints: Object.freeze(
          endpoints.map((value) => {
            const endpoint = record(value);
            return Object.freeze({
              id: token(endpoint.id),
              input: token(endpoint.input),
            });
          })
        ),
        ...(count && {
          references: Object.freeze({ id: token(references.id), max: count }),
        }),
        pricingType: optionalText(pricing.type),
        scalarTokenPricing:
          typeof pricing.input === "number" &&
          typeof pricing.output === "number",
        transparentBackground:
          typeof binding.transparent_background === "boolean"
            ? binding.transparent_background
            : undefined,
        deprecated: binding.deprecated === true,
      });
    }
    const date = record(row.release ?? {}).date;
    result[id] = Object.freeze({
      id,
      label,
      vendor: optionalText(row.vendor),
      shortDescription: optionalText(row.short_description),
      options: visualOptions(row),
      ...(typeof date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(date) &&
        new Date(date).toJSON()?.slice(0, 10) === date && {
          releaseDate: date,
        }),
      deprecated: row.deprecated === true,
      transparentBackground: row.transparent_background === true,
      bindings: Object.freeze(bindings),
    });
  }
  return Object.freeze(result);
}

/** Both inputs must come from the same version. Ignore fields outside the installed interface. */
export function parseModelCatalogue(
  version: string,
  models: unknown,
  agents: unknown
): ModelCatalogueSnapshot {
  const facts = record(models);
  const selections = record(agents);
  if (
    !isModelCatalogueVersion(version) ||
    facts.$schema !== "https://grida.co/schemas/ai-model-facts-v2.json" ||
    selections.$schema !== "https://grida.co/schemas/ai-agents-v2.json"
  )
    throw new Error("Incompatible Models catalogue");
  const text: Record<string, CatalogueTextModel> = Object.create(null);
  for (const [id, row] of Object.entries(record(facts["text.catalog"]))) {
    text[token(id)] = textModel(id, row);
  }
  const agentsById: Record<
    string,
    Readonly<Record<string, CatalogueAgentSelector>>
  > = Object.create(null);
  for (const [agent, value] of Object.entries(record(selections.agents))) {
    const agentModels: Record<string, CatalogueAgentSelector> =
      Object.create(null);
    for (const [key, entry] of Object.entries(record(record(value).models))) {
      const selector = record(entry);
      const canonicalModelId = token(selector.canonical_model_id);
      if (!Object.hasOwn(text, canonicalModelId))
        throw new Error("Unknown agent model");
      const serviceTiers: Record<string, string> = Object.create(null);
      for (const [mode, tier] of Object.entries(
        record(selector.service_tiers ?? {})
      )) {
        serviceTiers[token(mode)] = token(record(tier).service_tier);
      }
      agentModels[token(key)] = Object.freeze({
        canonicalModelId,
        serviceTiers: Object.freeze(serviceTiers),
      });
    }
    agentsById[token(agent)] = Object.freeze(agentModels);
  }
  return Object.freeze({
    version,
    text: Object.freeze(text),
    visual: Object.freeze({
      image: visualModels(facts["image.models"]),
      video: visualModels(facts["video.models"]),
    }),
    agents: Object.freeze(agentsById),
  });
}
