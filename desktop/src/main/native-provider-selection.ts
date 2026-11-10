// GRIDA-SEC-004 / GRIDA-SEC-014 — resolve a native launch from Desktop settings.
import {
  isValidEndpointProviderId,
  type EndpointProviderConfig,
} from "@grida/agent";
import { catalog } from "@grida/ai/catalogue";
import fs from "node:fs/promises";
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
    return {
      provider: "openai-compatible",
      endpoint,
      model,
      credentialHome: home,
      ...(imageGeneration && { imageGeneration }),
      providerNetwork: {
        prepare: (url, headers) =>
          url === target &&
          /^Bearer [!-~]+$/.test(headers.get("authorization") ?? "")
            ? network.prepare(url, headers)
            : null,
      },
    };
  }

  export async function configuredEndpoint(
    providerId: string,
    modelId: string | undefined,
    settings: Settings
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

    const hasKey = await settings.hasKey(config.id);
    if (hasKey && nativeVendorKeys.has(config.id))
      throw new Error("native_provider_endpoint_credential_id_reserved");
    const credentialHome = hasKey
      ? await checkedCredentialHome(settings.credentialHome)
      : undefined;
    const network = await settings.network(config.id, endpoint);
    target.pathname = `${target.pathname.replace(/\/$/, "")}/chat/completions`;
    return {
      provider: "openai-compatible",
      endpoint,
      model,
      ...(credentialHome && {
        credentialHome,
        configuredEndpointKey: config.id,
      }),
      providerNetwork: {
        prepare: (url, headers) =>
          url === target.href &&
          (hasKey
            ? /^Bearer [!-~]+$/.test(headers.get("authorization") ?? "")
            : !headers.has("authorization"))
            ? network.prepare(url, headers)
            : null,
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
