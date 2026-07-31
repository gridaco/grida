// GRIDA-GG: provider — the `gg` provider resolution arm + precedence (docs/wg/platform/hosted-ai.md)
/**
 * GRIDA-SEC-004 / GRIDA-SEC-008 — provider resolver.
 *
 * Picks the active provider for an agent run and returns a runnable
 * `ModelFactory`. Resolution is a node-only, in-process concern: it reads
 * the package-owned `SecretsStore` (credentials never cross IPC, per the
 * secrets threat model) and never calls the model itself — it only builds
 * the factory, so it's cheap on the hot path and easy to test.
 *
 * This is the providers layer, not a generic model-provider router. The
 * in-process model-provider kinds are:
 *
 *   - `chatgpt` — a native ChatGPT subscription credential whose model
 *     adapter still runs inside Grida's agent loop.
 *   - `byok` — the hardcoded third-party slots (OpenRouter, Vercel),
 *     keyed by a stored secret.
 *   - `gg` — Grida's hosted, included provider.
 *   - `endpoint` — ONE generalized OpenAI-compatible endpoint type
 *     (issue #806): user-configured `{base_url, models[]}` with an
 *     OPTIONAL key. Ollama is the preset; a missing key is not an error.
 *
 * Automatic precedence starts with a connected, model-compatible ChatGPT
 * subscription, then BYOK keys, Grida, and configured endpoints. A
 * configured-but-empty endpoint is not resolvable. Explicit picks skip
 * precedence.
 */

import { models, TIER_MODEL_IDS, type TierModelId } from "@grida/ai-models";
import type { ModelCatalogStore } from "./model-catalog";
import type { ModelFactory } from "../agent";
import type { ModelTier } from "../tiers";
import type { SecretsStore } from "@grida/daemon/server";
import {
  byokProvidersFor,
  isByokProviderId,
  isGgProviderId,
  GG_PROVIDER_ID,
  type ByokProviderId,
} from "../protocol/provider-ids";
import {
  CHATGPT_PROVIDER_ID,
  isChatGptProviderId,
  isChatGptSubscriptionModelId,
} from "../protocol/chatgpt";
import { makeGridaGatewayFactory } from "./gg";
import { liveGgMediaDeps, type GridaGatewaySessionStore } from "./gg-session";
import {
  endpointDefaultModelId,
  type EndpointProviderConfig,
} from "../protocol/endpoints";
import type { EndpointProvidersStore } from "./endpoints";
import {
  makeEndpointFactory,
  makeOpenRouterFactory,
  makeVercelFactory,
} from "./byok";
import type { ProviderHttp } from "./http";
import { ChatGptProvider, type ChatGptProviderRuntime } from "./chatgpt";

export { EndpointProvidersStore } from "./endpoints";

/**
 * Canonical tier->catalog-model map. The BUNDLED one — a host with a
 * `catalog` store resolves tiers through that instead, so the published
 * catalogue can retarget a tier without a release. Kept exported for
 * callers that legitimately want the compile-time table.
 */
export const MODEL_BY_TIER: Record<ModelTier, TierModelId> = TIER_MODEL_IDS;

export type ResolvedProvider = {
  /** A native, BYOK, hosted, endpoint, or external-agent provider id. */
  provider_id: string;
  /**
   * `chatgpt`/`byok`/`gg`/`endpoint` are MODEL providers (the host owns the
   * loop, calls `model_factory`). `gg` is the hosted "included"
   * provider (GRIDA-SEC-006) — credential is the pushed session token,
   * not a stored key. `agent-provider` is an EXTERNAL agent that owns
   * its own loop (issue #813); `model_factory` is never called — the
   * runtime branches on this kind and streams from the agent-provider
   * consumer instead.
   */
  kind: "byok" | "gg" | "chatgpt" | "endpoint" | "agent-provider";
  model_factory: ModelFactory;
};

/**
 * Build a `ResolvedProvider` for the agent-provider class. Agent-providers run
 * an EXTERNAL loop (no model factory), so — by design, not as a shortcut — the
 * runtime identifies them up front (`isAgentProviderModel`) and constructs them
 * here directly; `resolveProvider` deliberately handles only the model-provider
 * kinds (BYOK + endpoint) and never returns one. The `model_factory` throws as a
 * guard — nothing in the agent-provider path may call it.
 */
export function makeAgentProvider(providerId: string): ResolvedProvider {
  return {
    provider_id: providerId,
    kind: "agent-provider",
    model_factory: () => {
      throw new Error(
        "[agent-host-providers] agent-provider runs an external loop; model_factory must not be called"
      );
    },
  };
}

/**
 * Single error class for both "no provider configured" and "you picked
 * provider X but it isn't available" paths. The route maps `providerId`
 * being present to a 4xx with the picked-id surfaced in the body.
 */
export class ProviderUnavailableError extends Error {
  readonly code = "provider_down" as const;
  constructor(public readonly provider_id?: string) {
    super(
      provider_id
        ? `[agent-host-providers] explicit provider not available: ${provider_id}`
        : "[agent-host-providers] no provider available"
    );
    this.name = "ProviderUnavailableError";
  }
}

export type ResolveDeps = {
  secrets: SecretsStore;
  /** Host-fed provider HTTP, resolved at the server construction edge. */
  provider_http?: ProviderHttp;
  /** Endpoint provider configs. Optional so key-only hosts/tests need not
   *  wire a store; absent ⇒ no endpoint providers resolve. */
  endpoints?: EndpointProvidersStore;
  /**
   * Grida Cloud session (GRIDA-SEC-006). Optional like `endpoints`;
   * absent — or holding no live token — ⇒ the grida provider never
   * resolves. Resolves only when `gg_base_url` is ALSO configured.
   */
  gg?: GridaGatewaySessionStore;
  /** Origin the grida provider calls (e.g. `https://grida.co`). Host-
   *  injected; absent ⇒ the grida provider is disabled. */
  gg_base_url?: string;
  /**
   * Native ChatGPT subscription provider. Optional construction-time config
   * keeps the provider dormant when a host has no approved OAuth/backend
   * identity.
   */
  chatgpt?: ChatGptProviderRuntime;
  /**
   * The catalogue to resolve against. Optional so tests and key-only
   * hosts need not wire a store; absent ⇒ the bundled catalogue, which
   * is what this file read directly before the store existed.
   */
  catalog?: ModelCatalogStore;
};

/**
 * The catalogue view for a resolution — the store's if the host wired
 * one, the bundled seed otherwise. Read once per resolution so a refresh
 * mid-resolution cannot make the gate and the factory disagree.
 */
function catalogView(deps: ResolveDeps): models.snapshot.View {
  return deps.catalog?.view() ?? models.snapshot.view();
}

export type ResolveOptions = {
  /**
   * Optional caller override. If set, precedence is skipped and only the
   * named provider (BYOK or endpoint) is checked.
   */
  explicit?: string;
  /** Selected model, used to prevent a provider/model mismatch. */
  model_id?: string;
};

export async function resolveProvider(
  deps: ResolveDeps,
  options: ResolveOptions = {}
): Promise<ResolvedProvider> {
  if (options.explicit) {
    return await resolveExplicit(options.explicit, deps, options.model_id);
  }
  // One read for the whole resolution: a mid-resolution refresh must not
  // let the gate and the provider choice disagree about the catalogue.
  const view = catalogView(deps);

  // A connected ChatGPT subscription is the zero-dollar onboarding path.
  // Model compatibility is checked before precedence: a catalog model not
  // offered by the subscription falls through to BYOK/GG/endpoints.
  const chatgptResolved = await maybeResolveChatGpt(deps, options.model_id);
  if (chatgptResolved) return chatgptResolved;

  // A subscription-only id has no honest automatic fallback. Even if another
  // provider is configured, it must not receive a model id outside the shared
  // catalog merely because ChatGPT is currently signed out.
  if (
    options.model_id &&
    isChatGptSubscriptionModelId(options.model_id) &&
    !isCatalogModel(view, options.model_id)
  ) {
    throw new ProviderUnavailableError(CHATGPT_PROVIDER_ID);
  }

  // Text path: only text-capable BYOK providers. An image-only provider
  // (fal) may have a stored key, but it serves no chat models — skip it so a
  // fal-only user falls through to endpoints rather than erroring.
  if (isCatalogModel(view, options.model_id)) {
    for (const provider of byokProvidersFor("text")) {
      const key = await deps.secrets._getKey(provider.id);
      if (key) {
        return makeResolvedByok(
          provider.id,
          key,
          deps.provider_http,
          () => catalogView(deps).tier_model_ids
        );
      }
    }

    // Grida hosted (GRIDA-SEC-006) — after BYOK (existing BYOK users keep
    // exact behavior; explicit choice always wins), before endpoints
    // (fresh signed-in users get included AI without configuring
    // anything). Resolves only with a LIVE session token.
    const gridaResolved = maybeResolveGg(deps);
    if (gridaResolved) return gridaResolved;
  }

  if (deps.endpoints) {
    for (const endpoint of await deps.endpoints.list()) {
      const resolved = await maybeResolveEndpoint(
        endpoint,
        deps,
        options.model_id
      );
      if (resolved) return resolved;
    }
  }

  throw new ProviderUnavailableError();
}

async function resolveExplicit(
  providerId: string,
  deps: ResolveDeps,
  modelId?: string
): Promise<ResolvedProvider> {
  const view = catalogView(deps);
  if (isChatGptProviderId(providerId)) {
    const resolved = await maybeResolveChatGpt(deps, modelId);
    if (!resolved) throw new ProviderUnavailableError(providerId);
    return resolved;
  }
  if (isGgProviderId(providerId)) {
    // Without a live token the pick surfaces as the existing 409
    // `provider_down` with `provider_id: "gg"` — the renderer maps
    // that to "Sign in to use included AI".
    const resolved = isCatalogModel(view, modelId)
      ? maybeResolveGg(deps)
      : null;
    if (!resolved) throw new ProviderUnavailableError(providerId);
    return resolved;
  }
  if (isByokProviderId(providerId)) {
    if (
      !byokProvidersFor("text").some(
        (provider) => provider.id === providerId
      ) ||
      !isCatalogModel(view, modelId)
    ) {
      throw new ProviderUnavailableError(providerId);
    }
    const key = await deps.secrets._getKey(providerId);
    if (!key) throw new ProviderUnavailableError(providerId);
    return makeResolvedByok(
      providerId,
      key,
      deps.provider_http,
      () => catalogView(deps).tier_model_ids
    );
  }
  const endpoint = await deps.endpoints?.get(providerId);
  const resolved =
    endpoint && (await maybeResolveEndpoint(endpoint, deps, modelId));
  if (!resolved) throw new ProviderUnavailableError(providerId);
  return resolved;
}

async function maybeResolveChatGpt(
  deps: ResolveDeps,
  modelId?: string
): Promise<ResolvedProvider | null> {
  const runtime = deps.chatgpt;
  if (
    !runtime ||
    !ChatGptProvider.supportsModel(runtime.config, modelId) ||
    !(await ChatGptProvider.isReady(runtime))
  ) {
    return null;
  }
  return {
    provider_id: CHATGPT_PROVIDER_ID,
    kind: "chatgpt",
    model_factory: ChatGptProvider.makeFactory(runtime, deps.provider_http),
  };
}

/**
 * Grida hosted resolves only when the host configured a base URL AND
 * the renderer has pushed a live (unexpired) session token. The token
 * is re-read per request inside the factory's fetch — this check only
 * gates resolution.
 */
function maybeResolveGg(deps: ResolveDeps): ResolvedProvider | null {
  const hosted = liveGgMediaDeps(deps);
  if (!hosted) return null;
  return {
    provider_id: GG_PROVIDER_ID,
    kind: "gg",
    model_factory: makeGridaGatewayFactory(
      hosted.session,
      hosted.base_url,
      deps.provider_http,
      // The STORE, not a snapshot of it: a background subagent asks for
      // its tier long after resolution, and must get the model the
      // catalogue names then.
      () => catalogView(deps).tier_model_ids
    ),
  };
}

function makeResolvedByok(
  providerId: ByokProviderId,
  key: string,
  providerHttp?: ProviderHttp,
  tierModelIds?: () => Record<ModelTier, string>
): ResolvedProvider {
  switch (providerId) {
    case "openrouter":
      return {
        provider_id: providerId,
        kind: "byok",
        model_factory: makeOpenRouterFactory(
          key.trim(),
          providerHttp,
          tierModelIds
        ),
      };
    case "vercel":
      return {
        provider_id: providerId,
        kind: "byok",
        model_factory: makeVercelFactory(
          key.trim(),
          providerHttp,
          tierModelIds
        ),
      };
    case "fal":
      // fal is an image-only BYOK provider — it has no text/chat factory.
      // The text precedence loop already skips it (see `byokProvidersFor`);
      // this guards an explicit text pick of `fal`.
      throw new ProviderUnavailableError(providerId);
    case "elevenlabs":
      // ElevenLabs is audio-only and likewise cannot satisfy a text pick.
      throw new ProviderUnavailableError(providerId);
  }
  const _exhaustive: never = providerId;
  throw new ProviderUnavailableError(_exhaustive);
}

/**
 * An endpoint resolves only when it has a model to run (the default
 * model: explicit `default_model_id` or the first registered). The key is
 * looked up under the endpoint's id and is optional by design — Ollama
 * has no key, a self-hosted gateway may.
 */
async function maybeResolveEndpoint(
  endpoint: EndpointProviderConfig,
  deps: ResolveDeps,
  modelId?: string
): Promise<ResolvedProvider | null> {
  const defaultModelId = endpointDefaultModelId(endpoint);
  if (
    !defaultModelId ||
    (modelId !== undefined &&
      !endpoint.models.some((model) => model.id === modelId))
  ) {
    return null;
  }
  const key = await deps.secrets._getKey(endpoint.id);
  return {
    provider_id: endpoint.id,
    kind: "endpoint",
    model_factory: makeEndpointFactory(
      {
        id: endpoint.id,
        base_url: endpoint.base_url,
        api_key: key?.trim() || undefined,
        default_model_id: defaultModelId,
      },
      deps.provider_http
    ),
  };
}

/**
 * Whether the model is one this host's catalogue carries. `undefined`
 * (no explicit pick) is always in — the tier decides the model then.
 */
function isCatalogModel(
  view: models.snapshot.View,
  modelId: string | undefined
): boolean {
  return modelId === undefined || view.modelSpecById(modelId) !== undefined;
}
