// GRIDA-SEC-004 / GRIDA-SEC-008 — only Main can resolve a catalog selection to provider authority.
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { NativeAgentLaunch } from "./native-agent-process";
import { NativeProviderEgress } from "./native-provider-egress";

export type NativeProviderRouteLaunch = Pick<
  NativeAgentLaunch,
  | "provider"
  | "endpoint"
  | "model"
  | "providerNetwork"
  | "maxOutputTokens"
  | "compatibleOutputLimitField"
  | "reasoning"
  | "llamaCppInputCount"
  | "credentialHome"
  | "configuredEndpointKey"
  | "gatewayScope"
  | "gatewayJobBilling"
  | "subscriptionScope"
  | "imageGeneration"
>;
export type PreparedProviderRoute = {
  launch: NativeProviderRouteLaunch;
  release?: () => void;
};
type Route = PreparedProviderRoute & {
  routeId: string;
  egress: NativeProviderEgress;
};
const MAX_ROUTES = 256;

export class NativeProviderRoutes {
  static readonly capability = "co.grida/provider/routes";
  static readonly resolveMethod = "_co.grida/provider/resolve";
  private readonly lifetime = new AbortController();
  private readonly launchId = randomUUID();
  private readonly bySelection = new Map<string, Promise<Route>>();
  private readonly resolved = new Map<string, Route>();

  constructor(
    private readonly connectionId: string | null,
    private readonly launch: NativeProviderRouteLaunch,
    private readonly lookup: NativeProviderRoutes.Lookup
  ) {}

  /** Exactly the same custody and limits apply at process launch and per-input selection. */
  static egress(options: NativeProviderRouteLaunch) {
    const { imageGeneration } = options;
    if (
      imageGeneration &&
      (options.provider !== "openai-compatible" ||
        options.endpoint !== imageGeneration.endpoint ||
        !options.credentialHome ||
        !options.providerNetwork ||
        options.configuredEndpointKey !== undefined ||
        options.gatewayScope !== undefined ||
        options.subscriptionScope !== undefined)
    )
      throw new Error("native_agent_image_generation_profile_invalid");
    if (
      options.maxOutputTokens !== undefined &&
      (!Number.isSafeInteger(options.maxOutputTokens) ||
        options.maxOutputTokens < 1 ||
        options.maxOutputTokens > 65_536)
    )
      throw new Error("native_agent_output_limit_invalid");
    if (
      options.compatibleOutputLimitField !== undefined &&
      (options.compatibleOutputLimitField !== "max-tokens" ||
        options.provider !== "openai-compatible" ||
        !options.providerNetwork ||
        (options.credentialHome !== undefined &&
          options.configuredEndpointKey === undefined) ||
        options.gatewayScope !== undefined ||
        options.subscriptionScope !== undefined)
    )
      throw new Error("native_agent_compatible_output_limit_invalid");
    if (
      options.configuredEndpointKey !== undefined &&
      (!options.credentialHome ||
        !options.providerNetwork ||
        options.provider !== "openai-compatible" ||
        options.gatewayScope !== undefined ||
        options.subscriptionScope !== undefined)
    )
      throw new Error("native_agent_configured_endpoint_profile_invalid");
    if (
      options.subscriptionScope !== undefined &&
      (!/^[a-f0-9]{64}$/.test(options.subscriptionScope) ||
        options.provider !== "responses" ||
        !options.providerNetwork ||
        options.credentialHome !== undefined ||
        options.gatewayScope !== undefined)
    )
      throw new Error("native_agent_subscription_profile_invalid");
    if (
      options.gatewayScope !== undefined &&
      (!/^[a-f0-9]{64}$/.test(options.gatewayScope) ||
        options.provider !== "openai-compatible" ||
        !options.providerNetwork ||
        options.credentialHome)
    )
      throw new Error("native_agent_gateway_profile_invalid");
    if (options.gatewayJobBilling && !options.gatewayScope)
      throw new Error("native_agent_gateway_profile_invalid");
    if (options.llamaCppInputCount && !options.providerNetwork)
      throw new Error("native_provider_input_count_unavailable");
    if (
      options.credentialHome !== undefined &&
      !path.isAbsolute(options.credentialHome)
    )
      throw new Error("native_agent_absolute_directory_required");
    return options.providerNetwork
      ? new NativeProviderEgress(
          options.providerNetwork,
          options.subscriptionScope ? "chatgpt-subscription" : options.provider,
          options.endpoint,
          options.model,
          options.llamaCppInputCount,
          options.gatewayScope && options.gatewayJobBilling ? true : undefined
        )
      : undefined;
  }

  async resolve(value: unknown) {
    const params = record(value);
    const model = params?.model;
    const connectionId = params?.connectionId;
    if (
      this.lifetime.signal.aborted ||
      Object.keys(params ?? {}).length !== 2 ||
      typeof model !== "string" ||
      !/^[A-Za-z0-9_.:@/-]{1,256}$/.test(model) ||
      (connectionId !== null &&
        (typeof connectionId !== "string" ||
          !/^[a-f0-9]{64}$/.test(connectionId)))
    )
      throw new Error("native_chat_profile_unavailable");
    // A saved receipt identifies a choice. The live catalog must still admit
    // it, even when the same endpoint or network grant remains available.
    const profile = await this.lookup(
      connectionId,
      model,
      this.lifetime.signal
    );
    this.lifetime.signal.throwIfAborted();
    if (
      this.connectionId === connectionId &&
      model === this.launch.model &&
      (await this.launch.providerNetwork?.isCurrent?.()) !== false
    )
      return { kind: "launch", model, routeId: this.launchId };

    const key = JSON.stringify([connectionId, model]);
    const previous = this.bySelection.get(key);
    if (previous) {
      const captured = await previous;
      // Keep open HTTP exchanges on their original authority. A newly approved
      // endpoint or rotated key receives a distinct handle for later work.
      if (
        (await captured.launch.providerNetwork?.isCurrent?.()) === false &&
        this.bySelection.get(key) === previous
      )
        this.bySelection.delete(key);
    }
    this.lifetime.signal.throwIfAborted();
    let opening = this.bySelection.get(key);
    if (!opening) {
      if (Math.max(this.bySelection.size, this.resolved.size) >= MAX_ROUTES)
        throw new Error("native_chat_profile_unavailable");
      opening = this.open(model, profile);
      this.bySelection.set(key, opening);
      void opening.catch(() => this.bySelection.delete(key));
    }
    const { launch, routeId } = await opening;
    return {
      routeId,
      model,
      protocol: launch.provider,
      endpoint: launch.endpoint,
      kind: launch.gatewayScope
        ? "gateway"
        : launch.subscriptionScope
          ? "chatgpt"
          : "http",
      scope: launch.gatewayScope ?? launch.subscriptionScope,
      maxOutputTokens: launch.maxOutputTokens,
      compatibleOutputLimitField: launch.compatibleOutputLimitField,
      reasoning: launch.reasoning,
      llamaCppInputCount: launch.llamaCppInputCount,
      credentialHome: launch.credentialHome,
      configuredEndpointKey: launch.configuredEndpointKey,
      imageGenerationBinding: launch.imageGeneration?.binding,
      gatewayBilling: launch.gatewayJobBilling ? true : undefined,
    };
  }

  get(id: unknown) {
    return typeof id === "string" ? this.resolved.get(id) : undefined;
  }

  get openExchangeCount(): number {
    let count = 0;
    for (const route of this.resolved.values())
      count += route.egress.openExchangeCount;
    return count;
  }

  cancelImage(id: number | string) {
    for (const route of this.resolved.values())
      route.launch.imageGeneration?.cancel(id);
  }

  private async open(
    model: string,
    profile: NativeProviderRoutes.Profile
  ): Promise<Route> {
    const prepared = await profile.prepare();
    try {
      this.lifetime.signal.throwIfAborted();
      const { launch } = prepared;
      if (launch.model !== model)
        throw new Error("native_chat_profile_unavailable");
      const egress = NativeProviderRoutes.egress(launch);
      if (!egress) throw new Error("native_chat_profile_unavailable");
      const route = { ...prepared, routeId: randomUUID(), egress };
      this.resolved.set(route.routeId, route);
      return route;
    } catch (error) {
      prepared.release?.();
      throw error;
    }
  }

  close(): void {
    this.lifetime.abort();
    for (const route of this.resolved.values()) {
      route.egress.close();
      route.launch.imageGeneration?.close();
      route.release?.();
    }
    this.resolved.clear();
    this.bySelection.clear();
  }
}
export namespace NativeProviderRoutes {
  export type Profile = { prepare(): Promise<PreparedProviderRoute> };
  export type Lookup = (
    connectionId: string | null,
    model: string,
    signal: AbortSignal
  ) => Promise<Profile>;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
