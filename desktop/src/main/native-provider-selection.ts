// GRIDA-SEC-004 / GRIDA-SEC-014 — resolve a native launch from Desktop settings.
import type { EndpointProviderConfig } from "@grida/agent";
import type { NativeAgentLaunch } from "./native-agent-process";
import type { NativeProviderNetwork } from "./native-provider-egress";

export namespace NativeProviderSelection {
  type Settings = Readonly<{
    list: () => Promise<readonly EndpointProviderConfig[]>;
    hasKey: (id: string) => Promise<boolean>;
    network: (id: string, baseUrl: string) => Promise<NativeProviderNetwork>;
  }>;

  type Launch = Readonly<
    Pick<NativeAgentLaunch, "provider" | "endpoint" | "model"> & {
      providerNetwork: NativeProviderNetwork;
    }
  >;

  export async function configuredEndpoint(
    providerId: string,
    modelId: string | undefined,
    settings: Settings
  ): Promise<Launch> {
    const config = (await settings.list()).find(
      (entry) => entry.id === providerId
    );
    if (!config) throw new Error("native_provider_endpoint_unavailable");
    const model = modelId ?? config.default_model_id ?? config.models[0]?.id;
    if (
      model === undefined ||
      !config.models.some((entry) => entry.id === model)
    )
      throw new Error("native_provider_model_unavailable");
    if (await settings.hasKey(config.id))
      throw new Error("native_provider_endpoint_credential_unavailable");
    const endpoint = config.base_url;
    const network = await settings.network(config.id, endpoint);
    const target = new URL(endpoint);
    target.pathname = `${target.pathname.replace(/\/$/, "")}/chat/completions`;
    return {
      provider: "openai-compatible",
      endpoint,
      model,
      providerNetwork: {
        prepare: (url, headers) =>
          url === target.href && !headers.has("authorization")
            ? network.prepare(url, headers)
            : null,
      },
    };
  }
}
