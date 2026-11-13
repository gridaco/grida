// GRIDA-SEC-004 / GRIDA-SEC-014 — resolve a native launch from Desktop settings.
import {
  allowsLlamaCppInputCounting,
  isValidEndpointProviderId,
  type EndpointProviderConfig,
} from "@grida/ai-host";
import { catalog } from "@grida/ai/catalogue";
import { ProviderCredentialStore } from "@grida/auth/providers";
import fs from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { isIPv4 } from "node:net";
import path from "node:path";
import type { NativeAgentLaunch } from "./native-agent-process";
import { NativeImageGeneration } from "./native-image-generation";
import type { NativeProviderNetwork } from "./native-provider-egress";

export namespace NativeProviderSelection {
  type Settings = Readonly<{
    list: () => Promise<readonly EndpointProviderConfig[]>;
    hasKey: (id: string) => Promise<boolean>;
    network: (id: string, baseUrl: string) => Promise<NativeProviderNetwork>;
    credentialHome?: string;
  }>;

  type Launch = Readonly<
    Pick<
      NativeAgentLaunch,
      | "provider"
      | "endpoint"
      | "model"
      | "credentialHome"
      | "configuredEndpointKey"
      | "imageGeneration"
      | "llamaCppInputCount"
      | "subagents"
    > & {
      providerNetwork: NativeProviderNetwork;
    }
  >;

  type ByokSettings = Readonly<{
    credentialHome: string;
    hasKey: (id: string) => Promise<boolean>;
    network: () => Promise<NativeProviderNetwork>;
    imageRequest?: (init: RequestInit) => Promise<Response>;
  }>;

  const builtInEndpoints = {
    openrouter: "https://openrouter.ai/api/v1",
    vercel: "https://ai-gateway.vercel.sh/v1",
  } as const;
  // The native CLI also owns these vendor keys in the shared store.
  const nativeVendorKeys = new Set(["openai", "anthropic", "google"]);

  export function isBuiltInByok(
    providerId: string
  ): providerId is keyof typeof builtInEndpoints {
    return Object.hasOwn(builtInEndpoints, providerId);
  }

  /** Whether `endpoint` is the base URL of a built-in stored-key provider. */
  export function isBuiltInEndpoint(endpoint: string): boolean {
    return Object.values<string>(builtInEndpoints).includes(endpoint);
  }

  export async function builtInByok(
    providerId: string,
    model: string,
    settings: ByokSettings
  ): Promise<Launch & Readonly<{ credentialHome: string }>> {
    if (!isBuiltInByok(providerId))
      throw new Error("native_provider_byok_unavailable");
    if (!Object.hasOwn(catalog.text.catalog, model))
      throw new Error("native_provider_model_unavailable");
    const home = await checkedCredentialHome(settings.credentialHome);
    if (!(await settings.hasKey(providerId)))
      throw new Error("native_provider_byok_key_missing");
    const custody = await capturedCredential(home, providerId, true);
    const endpoint = builtInEndpoints[providerId];
    const target = `${endpoint}/chat/completions`;
    const network = await settings.network();
    const imageGeneration = settings.imageRequest
      ? NativeImageGeneration.forByok(
          providerId,
          endpoint,
          settings.imageRequest
        )
      : undefined;
    // Reasoning is a published fact of this provider's binding of the model.
    const reasoning =
      catalog.text.catalog[
        model as keyof typeof catalog.text.catalog
      ]?.reasoningProviders?.includes(providerId) === true;
    return {
      provider: "openai-compatible",
      endpoint,
      model,
      credentialHome: home,
      subagents: true,
      ...(reasoning && { reasoning: true as const }),
      ...(imageGeneration && { imageGeneration }),
      providerNetwork: {
        prepare: (url, headers) =>
          url === target &&
          /^Bearer [!-~]+$/.test(headers.get("authorization") ?? "")
            ? custody.prepare(network, url, headers)
            : null,
      },
    };
  }

  export async function configuredEndpoint(
    providerId: string,
    modelId: string | undefined,
    settings: Settings,
    llamaCppInputCount?: true
  ): Promise<Launch> {
    const config = (await settings.list()).find(
      (entry) => entry.id === providerId
    );
    if (!config || !isValidEndpointProviderId(config.id))
      throw new Error("native_provider_endpoint_unavailable");
    const model = modelId ?? config.default_model_id ?? config.models[0]?.id;
    if (
      model === undefined ||
      !config.models.some((entry) => entry.id === model)
    )
      throw new Error("native_provider_model_unavailable");
    const endpoint = config.base_url;
    const target = URL.parse(endpoint);
    if (
      !target ||
      (target.protocol !== "http:" && target.protocol !== "https:") ||
      target.username ||
      target.password ||
      target.href.includes("?") ||
      target.href.includes("#")
    )
      throw new Error("native_provider_endpoint_invalid");
    if (target.protocol === "http:" && !isLoopbackHost(target.hostname))
      throw new Error("native_provider_endpoint_https_required");
    if (
      llamaCppInputCount &&
      (config.input_counting !== "llama.cpp" ||
        !allowsLlamaCppInputCounting(target))
    )
      throw new Error("native_provider_input_count_unavailable");

    const hasKey = await settings.hasKey(config.id);
    if (hasKey && nativeVendorKeys.has(config.id))
      throw new Error("native_provider_endpoint_credential_id_reserved");
    const credentialHome = hasKey
      ? await checkedCredentialHome(settings.credentialHome)
      : undefined;
    const custody = credentialHome
      ? await capturedCredential(credentialHome, config.id, false)
      : undefined;
    const network = await settings.network(config.id, endpoint);
    target.pathname = `${target.pathname.replace(/\/$/, "")}/chat/completions`;
    const countTarget = llamaCppInputCount
      ? `${target.href}/input_tokens`
      : undefined;
    return {
      provider: "openai-compatible",
      endpoint,
      model,
      ...(llamaCppInputCount && { llamaCppInputCount }),
      ...(credentialHome && {
        credentialHome,
        configuredEndpointKey: config.id,
      }),
      providerNetwork: {
        prepare: (url, headers) =>
          (url === target.href || url === countTarget) &&
          (hasKey
            ? /^Bearer [!-~]+$/.test(headers.get("authorization") ?? "")
            : !headers.has("authorization"))
            ? custody
              ? custody.prepare(network, url, headers)
              : network.prepare(url, headers)
            : null,
      },
    };
  }

  async function capturedCredential(
    home: string,
    provider: string,
    trim: boolean
  ) {
    const store = new ProviderCredentialStore({ home });
    const key = await store.read(provider);
    if (key === null) throw new Error("native_provider_byok_key_missing");
    const wireKey = trim ? key.trim() : key;
    if (
      !wireKey ||
      [...wireKey].some((character) => {
        const point = character.codePointAt(0)!;
        return point < 32 || point > 126;
      })
    )
      throw new Error("native_provider_credential_unavailable");
    // Headers strips trailing ASCII spaces; never include key bytes in errors.
    const bearer = Buffer.from(`Bearer ${wireKey}`.replace(/ +$/, ""));
    return {
      prepare(network: NativeProviderNetwork, url: string, headers: Headers) {
        const provided = Buffer.from(headers.get("authorization") ?? "");
        if (
          provided.length !== bearer.length ||
          !timingSafeEqual(provided, bearer)
        )
          return null;
        return async (body: Buffer, signal: AbortSignal) => {
          let attempted = false;
          let pending: Promise<Response | null> | undefined;
          try {
            const admitted = await store.admit(provider, key, () => {
              if (signal.aborted) return false;
              const dispatch = network.prepare(url, headers);
              if (!dispatch || signal.aborted) return false;
              attempted = true;
              pending = dispatch(body, signal);
              void pending.catch(() => {});
              return true;
            });
            if (!admitted) return null;
            if (!pending)
              throw new Error("native_provider_dispatch_unavailable");
            return await pending;
          } catch (error) {
            if (attempted) throw error;
            return null;
          }
        };
      },
    };
  }

  // Match the native HTTP boundary before looking up credentials or approval.
  // WHATWG URL hostnames serialize IPv4-mapped IPv6 with hexadecimal words.
  function isLoopbackHost(host: string): boolean {
    return (
      host === "localhost" ||
      host === "[::1]" ||
      (host.startsWith("127.") && isIPv4(host)) ||
      /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(host)
    );
  }

  async function checkedCredentialHome(home?: string): Promise<string> {
    // Windows Desktop's keys belong to its own auth.json custody owner.
    if (process.platform !== "darwin" && process.platform !== "linux")
      throw new Error("native_provider_byok_platform_unsupported");
    if (
      !home ||
      !path.isAbsolute(home) ||
      (await fs.realpath(home).catch(() => null)) !== home
    )
      throw new Error("native_provider_byok_home_invalid");
    return home;
  }
}
