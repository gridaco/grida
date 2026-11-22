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

export interface ModelCatalogueSnapshot {
  readonly version: string;
  readonly text: Readonly<Record<string, CatalogueTextModel>>;
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
    agents: Object.freeze(agentsById),
  });
}
