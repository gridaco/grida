// GRIDA-SEC-004 / GRIDA-SEC-006 — scoped GG image requests; no result URL following.
// GRIDA-GG: token — token is re-read for every submission.
import type { ImageModelV3, ImageModelV3CallOptions } from "@ai-sdk/provider";
import type { GgTokenSource } from "./gg-session";
import { ProviderHttp } from "./http";
import { GGOperationsClient } from "./gg-operations";
import type { GGDiscoveryStore, GGOperation } from "./gg-discovery";
export class GridaGatewayImageModel implements ImageModelV3 {
  readonly specificationVersion = "v3" as const;
  readonly provider = "gg";
  get maxImagesPerCall(): number {
    const properties = this.operation.input_schema.properties as
      | Record<string, Record<string, unknown>>
      | undefined;
    const maximum = properties?.n?.maximum ?? properties?.n?.const ?? 1;
    return typeof maximum === "number" &&
      Number.isSafeInteger(maximum) &&
      maximum > 0 &&
      maximum <= 16
      ? maximum
      : 1;
  }

  constructor(
    private readonly session: GgTokenSource,
    private readonly baseUrl: string,
    readonly modelId: string,
    private readonly providerHttp: ProviderHttp,
    private readonly operation: GGOperation,
    private readonly discovery: GGDiscoveryStore,
    private readonly background?: "opaque" | "transparent"
  ) {}

  async doGenerate(
    options: ImageModelV3CallOptions
  ): Promise<Awaited<ReturnType<ImageModelV3["doGenerate"]>>> {
    const { prompt, n, size, aspectRatio, seed, abortSignal, providerOptions } =
      options;
    let width: number | undefined;
    let height: number | undefined;
    if (size) {
      const match = /^(\d+)x(\d+)$/.exec(size);
      if (match) {
        width = Number(match[1]);
        height = Number(match[2]);
      }
    }
    // The desktop image route sets the picker's quality tier under
    // `providerOptions.gg` (keyed by provider id); forward it so the hosted
    // endpoint bills AND delivers the requested tier rather than dropping it.
    const rawQuality = providerOptions?.gg?.quality;
    const quality = typeof rawQuality === "string" ? rawQuality : undefined;
    {
      const properties = this.operation.input_schema.properties as
        | Record<string, Record<string, unknown>>
        | undefined;
      const input: Record<string, unknown> = { prompt, n };
      let canonicalSize: string | undefined = size;
      const sizes = properties?.size?.enum;
      if (
        size &&
        Array.isArray(sizes) &&
        !sizes.includes(size) &&
        width &&
        height
      ) {
        const tiers = sizes.filter(
          (item): item is string =>
            typeof item === "string" && /^\d+K$/.test(item)
        );
        canonicalSize =
          tiers.find(
            (tier) => Math.max(width!, height!) <= Number.parseInt(tier) * 1024
          ) ?? tiers.at(-1);
        if (!canonicalSize) throw new Error("invalid_input");
      }
      for (const [key, value] of Object.entries({
        size: canonicalSize,
        aspect_ratio: aspectRatio,
        seed,
        quality,
        background: this.background,
      })) {
        if (value !== undefined) {
          if (!properties || !Object.hasOwn(properties, key))
            throw new Error("invalid_input");
          input[key] = value;
        }
      }
      const client = new GGOperationsClient({
        http: this.providerHttp,
        gg: this.session,
        gg_base_url: this.baseUrl,
        gg_catalog: this.discovery,
      });
      const raw = await client.submit(this.operation.id, input, abortSignal);
      if (
        !Array.isArray(raw.data) ||
        !raw.data.length ||
        raw.data.length > n ||
        raw.data.some(
          (image) =>
            !image ||
            typeof image !== "object" ||
            typeof image.b64_json !== "string"
        )
      )
        throw new Error("invalid_response");
      return {
        images: raw.data.map((image: { b64_json: string }) => image.b64_json),
        warnings: [],
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
          headers: undefined,
        },
      };
    }
  }
}
