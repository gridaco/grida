// GRIDA-SEC-004 / GRIDA-SEC-006 — scoped GG image requests; no result URL following.
// GRIDA-GG: token — token is re-read for every submission.
import type { ImageModelV3, ImageModelV3CallOptions } from "@ai-sdk/provider";
import type { GgTokenSource } from "./gg-session";
import { joinApi, postHosted } from "./gg";
import { ProviderHttp } from "./http";
type ImageGenerateResult = { images: { base64: string }[] };
export class GridaGatewayImageModel implements ImageModelV3 {
  readonly specificationVersion = "v3" as const;
  readonly provider = "gg";
  readonly maxImagesPerCall = 4;

  constructor(
    private readonly session: GgTokenSource,
    private readonly baseUrl: string,
    readonly modelId: string,
    private readonly providerHttp: ProviderHttp = new ProviderHttp(),
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
    const result = await postHosted<ImageGenerateResult>({
      session: this.session,
      url: joinApi(this.baseUrl, "/api/v1/ai/images/generations"),
      scope: "grida-images",
      abortSignal,
      provider_http: this.providerHttp,
      body: {
        model_id: this.modelId,
        prompt,
        n,
        width,
        height,
        aspect_ratio: aspectRatio,
        quality,
        seed,
        // Captured, capability-checked intent; provider options cannot override it.
        background: this.background,
      },
    });
    return {
      images: result.images.map((image) => image.base64),
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: undefined,
      },
    };
  }
}
