// GRIDA-SEC-004 / GRIDA-SEC-014 — resolve a native launch from Desktop settings.
import {
  isValidEndpointProviderId,
  type EndpointProviderConfig,
} from "@grida/agent";
import { catalog } from "@grida/ai/catalogue";
import fs from "node:fs/promises";
import path from "node:path";
import type { NativeAgentLaunch } from "./native-agent-process";
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
    > & {
      providerNetwork: NativeProviderNetwork;
    }
  >;

  type ByokSettings = Readonly<{
    credentialHome: string;
    hasKey: (id: string) => Promise<boolean>;
    network: () => Promise<NativeProviderNetwork>;
  }>;

  const builtInEndpoints = {
    openrouter: "https://openrouter.ai/api/v1",
    vercel: "https://ai-gateway.vercel.sh/v1",
  } as const;
  // The native CLI also owns these vendor keys in the shared store.
  const nativeVendorKeys = new Set(["openai", "anthropic", "google"]);

  export async function builtInByok(
    providerId: string,
    model: string,
    settings: ByokSettings
  ): Promise<Launch & Readonly<{ credentialHome: string }>> {
    if (!Object.hasOwn(builtInEndpoints, providerId))
      throw new Error("native_provider_byok_unavailable");
    if (!Object.hasOwn(catalog.text.catalog, model))
      throw new Error("native_provider_model_unavailable");
    const home = await checkedCredentialHome(settings.credentialHome);
    if (!(await settings.hasKey(providerId)))
      throw new Error("native_provider_byok_key_missing");
    const endpoint =
      builtInEndpoints[providerId as keyof typeof builtInEndpoints];
    const target = `${endpoint}/chat/completions`;
    const network = await settings.network();
    return {
      provider: "openai-compatible",
      endpoint,
      model,
      credentialHome: home,
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
    const hasKey = await settings.hasKey(config.id);
    if (hasKey && nativeVendorKeys.has(config.id))
      throw new Error("native_provider_endpoint_credential_id_reserved");
    const credentialHome = hasKey
      ? await checkedCredentialHome(settings.credentialHome)
      : undefined;
    const endpoint = config.base_url;
    const network = await settings.network(config.id, endpoint);
    const target = new URL(endpoint);
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
