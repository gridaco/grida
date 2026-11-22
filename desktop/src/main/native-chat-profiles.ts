// GRIDA-SEC-004 / GRIDA-SEC-008 / GRIDA-SEC-014 — Main binds a catalog choice to an approved provider and model.
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  byokProvidersFor,
  CHATGPT_PROVIDER_ID,
  GG_PROVIDER_ID,
  GG_PROVIDER_METADATA,
  isValidEndpointProviderId,
  type EndpointProviderConfig,
  type GGModelsView,
} from "@grida/ai-host";
import {
  catalog,
  isChatModelIdentifier,
  ChatModels,
} from "@grida/ai/catalogue";
import type { ModelCatalogueSnapshot } from "@grida/ai/model-catalogue";
import { OPENAI_PROJECT_PROVIDER_ID } from "@grida/ai/providers";
import type { NativeChatProfileChoice } from "@grida/desktop-bridge";
import type { NativeAgentLaunch } from "./native-agent-process";
import { NativeProviderSelection } from "./native-provider-selection";

const FILENAME = "chat-profiles.json";
const PROFILE_ID = /^[a-f0-9]{64}$/;
const MAX_SAVED = 24;
const MAX_BYTES = 24 * 1024;
const MAX_CHOICES = 256;
const MAX_ENDPOINTS = 16;
const GATEWAY_OUTPUT_LIMIT = 4_096;
/** The largest output allowance the native agent accepts. */
const AGENT_OUTPUT_LIMIT = 65_536;
type Launch = Awaited<
  ReturnType<typeof NativeProviderSelection.configuredEndpoint>
> &
  Pick<NativeAgentLaunch, "compatibleOutputLimitField">;
type Resolve = (
  providerId: string,
  modelId?: string,
  llamaCppInputCount?: true
) => Promise<Launch>;

export namespace NativeChatProfiles {
  export type Saved = NativeChatProfileChoice &
    Readonly<{ providerId: string; modelId: string }>;
  type GatewayModel = GGModelsView["models"][number];

  export function validId(id: unknown): id is string {
    return typeof id === "string" && PROFILE_ID.test(id);
  }

  export function binding(providerId: string, launch: Launch): string {
    const base = new URL(launch.endpoint);
    base.pathname = base.pathname.replace(/\/$/, "");
    const builtIn = NativeProviderSelection.isBuiltInByok(providerId);
    return createHash("sha256")
      .update(
        JSON.stringify([
          builtIn
            ? "desktop-builtin-byok-chat-v1"
            : launch.compatibleOutputLimitField === "max-tokens"
              ? "desktop-compatible-max-tokens-chat-v1"
              : "desktop-compatible-chat-v1",
          providerId,
          launch.provider,
          base.href,
          builtIn || launch.configuredEndpointKey ? "stored" : "anonymous",
          launch.model,
          ...(launch.llamaCppInputCount
            ? ["llama-cpp-chat-input-count-v1"]
            : []),
        ])
      )
      .digest("hex");
  }

  export function configuredLaunch(launch: Launch): Launch {
    return { ...launch, compatibleOutputLimitField: "max-tokens" };
  }

  export function gatewayBinding(scope: string, modelId: string): string {
    return createHash("sha256")
      .update(JSON.stringify(["desktop-gateway-model-chat-v1", scope, modelId]))
      .digest("hex");
  }

  /** OAuth rotation keeps a choice; a new sign-in lineage requires a new one. */
  export function subscriptionBinding(scope: string, modelId: string): string {
    return createHash("sha256")
      .update(JSON.stringify(["desktop-chatgpt-model-chat-v1", scope, modelId]))
      .digest("hex");
  }

  export function subscriptionChoices(
    scope: string,
    models: readonly ChatModels.Binding[]
  ): Saved[] {
    return models.map((model) => ({
      ...displayFacts(model),
      id: subscriptionBinding(scope, model.modelId),
      providerId: CHATGPT_PROVIDER_ID,
      modelId: model.modelId,
      connection: "ChatGPT Subscription",
      model: label(model.label, model.modelId),
    }));
  }

  function displayFacts(model: ChatModels.Binding) {
    return {
      ...(model.contextWindow && { contextWindow: model.contextWindow }),
      ...(model.imageInput && { imageInput: true as const }),
      ...(model.reasoning && { reasoning: true as const }),
    };
  }

  export function gatewayOutputLimit(model: GatewayModel | undefined) {
    return model?.capabilities.tools === true
      ? gatewayChatOutputLimit(model)
      : undefined;
  }

  /** A text-only completion does not require a tool-capable foreground model. */
  export function gatewayChatOutputLimit(model: GatewayModel | undefined) {
    if (
      !model ||
      !/^[A-Za-z0-9_.:/@-]{1,128}$/.test(model.id) ||
      model.kind !== "text" ||
      !model.interfaces.includes("chat.completions")
    )
      return undefined;
    const { max_output_tokens: limit } = model.limits;
    return Number.isSafeInteger(limit) && limit > 0
      ? Math.min(limit, GATEWAY_OUTPUT_LIMIT)
      : undefined;
  }

  export function gatewayChoices(
    models: readonly GatewayModel[],
    scope: string,
    defaultModel: string
  ): Saved[] {
    return models
      .filter(
        (model) =>
          model.id !== defaultModel && gatewayOutputLimit(model) !== undefined
      )
      .slice(0, MAX_CHOICES)
      .map((model) => ({
        id: gatewayBinding(scope, model.id),
        providerId: GG_PROVIDER_ID,
        modelId: model.id,
        connection: GG_PROVIDER_METADATA.label,
        model: label(model.label, model.id),
        ...(positive(model.limits.context_tokens) && {
          contextWindow: model.limits.context_tokens,
        }),
      }));
  }

  /** The context window from the selected provider's model catalogue. */
  export function contextWindow(modelId: string): number | undefined {
    const window =
      catalog.text.catalog[modelId as keyof typeof catalog.text.catalog]
        ?.contextWindow;
    return positive(window) ? window : undefined;
  }

  /** The gateway adapter currently implements retained PNG input on this route. */
  export function gatewayImageInput(modelId: string): boolean {
    return modelId === "openai/gpt-5.6-sol";
  }

  /**
   * The output allowance for a launch with the person's own key or endpoint:
   * the model's catalogue output limit, bounded by what the agent accepts.
   * An unknown model keeps the agent's default. A small fixed allowance cuts
   * off long replies, such as a large file written in one tool call.
   */
  export function outputLimit(modelId: string): number | undefined {
    const limit =
      catalog.text.catalog[modelId as keyof typeof catalog.text.catalog]
        ?.outputLimit;
    return positive(limit) ? Math.min(limit, AGENT_OUTPUT_LIMIT) : undefined;
  }

  /** Whether this provider's binding of the model accepts a reasoning level. */
  export function reasons(providerId: string, modelId: string): boolean {
    return (
      catalog.text.catalog[
        modelId as keyof typeof catalog.text.catalog
      ]?.reasoningProviders?.includes(providerId) === true
    );
  }

  export async function builtInChoices(
    snapshot: ModelCatalogueSnapshot,
    resolve: (
      providerId: string,
      modelId: string,
      binding: ChatModels.Binding
    ) => Promise<Launch>,
    openAiModels: readonly ChatModels.Binding[] = []
  ): Promise<Saved[]> {
    const choices: Saved[] = [];
    for (const { id, label: connection } of byokProvidersFor("text")) {
      if (!NativeProviderSelection.isBuiltInByok(id)) continue;
      const models =
        id === OPENAI_PROJECT_PROVIDER_ID
          ? openAiModels
          : ChatModels.list(snapshot, { provider: id });
      const sample = models[0];
      if (!sample) continue;
      // The credential owner is common to every binding on this provider.
      const eligible = await resolve(id, sample.modelId, sample).catch(
        () => null
      );
      if (!eligible) continue;
      for (const model of models) {
        choices.push({
          ...displayFacts(model),
          id: binding(id, { ...eligible, model: model.modelId }),
          providerId: id,
          modelId: model.modelId,
          connection,
          model: label(model.label, model.modelId),
        });
      }
    }
    return choices;
  }

  /** Model settings supply choices; the existing native resolver decides eligibility. */
  export async function configuredChoices(
    endpoints: readonly EndpointProviderConfig[],
    resolve: Resolve
  ): Promise<Saved[]> {
    const choices: Saved[] = [];
    const countedChoices: Saved[] = [];
    for (const endpoint of endpoints.slice(0, MAX_ENDPOINTS)) {
      if (!isValidEndpointProviderId(endpoint.id)) continue;
      const eligible = await resolve(endpoint.id).catch(() => null);
      if (!eligible || eligible.endpoint !== endpoint.base_url) continue;
      const counted =
        endpoint.input_counting === "llama.cpp"
          ? await resolve(endpoint.id, undefined, true).catch(() => null)
          : null;
      for (const model of endpoint.models) {
        if (choices.length >= MAX_CHOICES) return choices;
        if (!modelId(model.id)) continue;
        const launch = { ...eligible, model: model.id };
        const window = model.overrides?.contextWindow ?? model.contextWindow;
        const choice = {
          id: binding(endpoint.id, configuredLaunch(launch)),
          providerId: endpoint.id,
          modelId: model.id,
          connection: label(endpoint.label, endpoint.id),
          model: label(model.label, model.id),
          ...(positive(window) && { contextWindow: window }),
        };
        choices.push(choice);
        if (
          counted?.llamaCppInputCount &&
          counted.endpoint === endpoint.base_url &&
          countedChoices.length < MAX_CHOICES
        ) {
          countedChoices.push({
            ...choice,
            id: binding(
              endpoint.id,
              configuredLaunch({ ...counted, model: model.id })
            ),
            connection: label(
              `${choice.connection} (llama.cpp counting)`,
              `${endpoint.id} (llama.cpp counting)`
            ),
          });
        }
      }
    }
    return [
      ...choices,
      ...countedChoices.slice(0, MAX_CHOICES - choices.length),
    ];
  }

  export async function read(directory: string): Promise<Saved[]> {
    if (!(await privateDirectory(directory))) return [];
    const handle = await fs
      .open(
        path.join(directory, FILENAME),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
      )
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    if (!handle) return [];
    try {
      const stat = await handle.stat();
      if (
        !stat.isFile() ||
        stat.uid !== process.geteuid?.() ||
        stat.nlink !== 1 ||
        (stat.mode & 0o7777) !== 0o600 ||
        stat.size > MAX_BYTES
      )
        throw invalid();
      const buffer = Buffer.alloc(MAX_BYTES + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead !== stat.size) throw invalid();
      const entries: unknown = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          buffer.subarray(0, bytesRead)
        )
      );
      if (
        !Array.isArray(entries) ||
        entries.length > MAX_SAVED ||
        !entries.every(saved) ||
        new Set(entries.map(({ id }) => id)).size !== entries.length
      )
        throw invalid();
      return entries;
    } catch {
      throw invalid();
    } finally {
      await handle.close();
    }
  }

  /** Main serializes writes. No selected profile can change an existing receipt. */
  export async function remember(
    directory: string,
    profile: Saved,
    requireCurrent: () => void
  ) {
    const before = await privateDirectory(directory);
    if (!before) throw invalid();
    const entries = await read(directory);
    if (entries.some(({ id }) => id === profile.id)) return;
    if (entries.length >= MAX_SAVED)
      throw new Error("native_chat_profile_limit");
    // The receipt keeps only its identity; display facts are derived again.
    const { id, providerId, modelId, connection, model } = profile;
    const encoded = Buffer.from(
      JSON.stringify([
        ...entries,
        { id, providerId, modelId, connection, model },
      ])
    );
    if (encoded.length > MAX_BYTES) throw invalid();
    const target = path.join(directory, FILENAME);
    const stage = path.join(directory, `.chat-profiles-${randomUUID()}.tmp`);
    try {
      const handle = await fs.open(stage, "wx", 0o600);
      try {
        await handle.writeFile(encoded);
        await handle.sync();
      } finally {
        await handle.close();
      }
      const current = await privateDirectory(directory);
      if (current?.dev !== before.dev || current.ino !== before.ino)
        throw invalid();
      requireCurrent();
      await fs.rename(stage, target);
      const parent = await fs.open(
        directory,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
      );
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
    } finally {
      await fs.unlink(stage).catch(() => {});
    }
  }
}

async function privateDirectory(directory: string) {
  const stat = await fs
    .lstat(directory)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  if (!stat) return undefined;
  if (
    !stat.isDirectory() ||
    stat.uid !== process.geteuid?.() ||
    (stat.mode & 0o7777) !== 0o700 ||
    (await fs.realpath(directory)) !== directory
  )
    throw invalid();
  return stat;
}

function label(value: string | undefined, fallback: string): string {
  return (
    (value ?? fallback).replace(/\p{C}/gu, "").trim().slice(0, 128) || fallback
  );
}

function modelId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    !/\p{C}/u.test(value)
  );
}

function saved(value: unknown): value is NativeChatProfiles.Saved {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<NativeChatProfiles.Saved>;
  return (
    Object.keys(entry).length === 5 &&
    NativeChatProfiles.validId(entry.id) &&
    typeof entry.providerId === "string" &&
    (entry.providerId === GG_PROVIDER_ID ||
      (entry.providerId === CHATGPT_PROVIDER_ID &&
        isChatModelIdentifier(entry.modelId)) ||
      isValidEndpointProviderId(entry.providerId) ||
      NativeProviderSelection.isBuiltInByok(entry.providerId)) &&
    modelId(entry.modelId) &&
    modelId(entry.connection) &&
    modelId(entry.model)
  );
}

function positive(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function invalid(): Error {
  return new Error("native_chat_profiles_invalid");
}
