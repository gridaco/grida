// Model facts and exact selectors come from one public release. The caller
// supplies the account offer or the configured provider for this decision.
import type { ModelCatalogueSnapshot } from "./public-models.mjs";
import { isChatModelIdentifier } from "./chat-model-identifier.mjs";
import { catalog } from "./grida/catalog";

export namespace ChatModels {
  export type Connection =
    | { provider: "chatgpt"; selectors: readonly string[] }
    | { provider: "openrouter" | "vercel" };
  export type Binding = Readonly<{
    modelId: string;
    wireModel: string;
    label: string;
    contextWindow?: number;
    maxOutputTokens?: number;
    imageInput: boolean;
    reasoning: boolean;
    speeds: readonly ("fast" | "ultrafast")[];
  }>;

  /** A single decision sees the same release and connection offer throughout. */
  export function list(
    snapshot: ModelCatalogueSnapshot,
    connection: Connection
  ): Binding[] {
    return Array.from(candidates(snapshot, connection));
  }

  export function resolve(
    snapshot: ModelCatalogueSnapshot,
    connection: Connection,
    modelId: string
  ): Binding | undefined {
    for (const binding of candidates(snapshot, connection, modelId))
      return binding;
  }

  /** Only accepted native inputs supply this record. Its connection is authorized again. */
  export type Retained = Readonly<{
    wireModel: string;
    imageInput?: boolean;
    speed?: "fast" | "ultrafast";
  }>;

  export function resume(
    snapshot: ModelCatalogueSnapshot,
    connection: Connection,
    modelId: string,
    retained: Retained
  ): Binding | undefined {
    if (
      !isChatModelIdentifier(modelId) ||
      !isChatModelIdentifier(retained.wireModel)
    )
      return;
    const current = resolve(snapshot, connection, modelId);
    if (connection.provider === "chatgpt") {
      const owner =
        snapshot.agents["openai-codex"]?.[retained.wireModel]?.canonicalModelId;
      if (
        !connection.selectors.includes(retained.wireModel) ||
        (owner && owner !== modelId)
      )
        return;
      const same =
        current?.wireModel === retained.wireModel ? current : undefined;
      return {
        modelId,
        wireModel: retained.wireModel,
        label: current?.label ?? modelId,
        reasoning: true,
        imageInput: retained.imageInput ?? same?.imageInput ?? false,
        speeds: retained.speed ? [retained.speed] : (same?.speeds ?? []),
      };
    }
    if (
      !current ||
      Object.values(snapshot.text).some(
        (row) =>
          row.id !== modelId &&
          row.bindings[connection.provider]?.wireModel === retained.wireModel
      )
    )
      return;
    return {
      ...current,
      wireModel: retained.wireModel,
      imageInput: retained.imageInput ?? current.imageInput,
    };
  }

  function* candidates(
    snapshot: ModelCatalogueSnapshot,
    connection: Connection,
    only?: string
  ): Generator<Binding> {
    if (connection.provider === "chatgpt") {
      const agentModels = snapshot.agents["openai-codex"];
      if (!agentModels) return;
      const seen = new Set<string>();
      for (const selector of connection.selectors) {
        const agent =
          isChatModelIdentifier(selector) &&
          Object.hasOwn(agentModels, selector) &&
          agentModels[selector];
        if (
          !agent ||
          !isChatModelIdentifier(agent.canonicalModelId) ||
          (only !== undefined && only !== agent.canonicalModelId) ||
          seen.has(agent.canonicalModelId)
        )
          continue;
        const model = snapshot.text[agent.canonicalModelId];
        const native = model?.bindings.openai;
        if (
          !model?.tools ||
          !native?.tools ||
          !native.reasoning ||
          native.streaming !== true
        )
          continue;
        const speeds: ("fast" | "ultrafast")[] = [];
        if (agent.serviceTiers.fast === "priority") speeds.push("fast");
        if (agent.serviceTiers.ultrafast === "ultrafast")
          speeds.push("ultrafast");
        seen.add(model.id);
        yield {
          modelId: model.id,
          wireModel: selector,
          label: model.shortLabel ?? model.label,
          reasoning: true,
          contextWindow: native.contextWindow ?? model.contextWindow,
          imageInput:
            native.imageInput === true &&
            model.imageInputMimes.includes("image/png"),
          speeds,
        };
      }
      return;
    }
    const ids = only === undefined ? Object.keys(snapshot.text) : [only];
    for (const id of ids) {
      if (!isChatModelIdentifier(id) || !Object.hasOwn(snapshot.text, id))
        continue;
      const model = snapshot.text[id];
      const binding = model.bindings[connection.provider];
      const policy = catalog.definitions.text.members;
      if (
        Object.hasOwn(policy, id) &&
        policy[id as keyof typeof policy].status !== "listed"
      )
        continue;
      if (
        !model.tools ||
        !binding?.tools ||
        !isChatModelIdentifier(binding.wireModel) ||
        binding.streaming === false
      )
        continue;
      const limit = binding.outputLimit ?? model.outputLimit;
      yield {
        modelId: id,
        wireModel: binding.wireModel,
        label: model.shortLabel ?? model.label,
        contextWindow: binding.contextWindow ?? model.contextWindow,
        maxOutputTokens:
          limit === undefined ? undefined : Math.min(65_536, limit),
        imageInput:
          connection.provider === "openrouter" &&
          binding.imageInput === true &&
          model.imageInputMimes.includes("image/png"),
        reasoning: binding.reasoning === true,
        speeds: [],
      };
    }
  }
}
