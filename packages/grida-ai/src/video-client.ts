// GRIDA-SEC-004 — explicit video provider authority, bounded execution/results, safe failures.
// GRIDA-SEC-006 — scoped GG is checked at submission; accepted work cannot be recalled.
// GRIDA-GG: token — no account credentials, mint, persistence, or implicit provider switching.
import { models } from "@grida/ai-models";
import { InputSchema } from "./input-schema";
import { MediaInputs } from "./media-inputs";
import { MediaRoutes } from "./media-routes";
import { GridaGatewayAuthError, GridaGatewayCreditsError } from "./gg";
import { liveGgMediaDeps, type GgTokenSource } from "./gg-session";
import { ProviderHttp } from "./http";
import { catalogViewOnMiss, type ModelCatalogStore } from "./model-catalog";
import { byokProvidersFor } from "./provider-ids";
import { videoModels } from "./video-models";
import { MediaRequest } from "./media-request";

/** Catalogue-backed video execution. Hosts own keys, egress, inputs, and persistence. */
export class VideoClient {
  readonly #getKey: VideoClient.Keys["get"];
  readonly #http: ProviderHttp;
  readonly #catalog?: ModelCatalogStore;
  readonly #gg?: GgTokenSource;
  readonly #ggBaseUrl?: string;

  constructor(options: VideoClient.Options) {
    try {
      const { keys, http, catalog, gg, gg_base_url } = options;
      const get = keys.get;
      if (!(http instanceof ProviderHttp) || typeof get !== "function") throw 0;
      this.#getKey = get.bind(keys);
      this.#http = http;
      this.#catalog = catalog;
      if (gg !== undefined)
        this.#gg = { getAccessToken: gg.getAccessToken.bind(gg) };
      if (gg_base_url !== undefined) {
        const url = new URL(gg_base_url);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search ||
          url.hash
        )
          throw 0;
        this.#ggBaseUrl = url.origin;
      }
    } catch {
      throw new VideoClient.Failure("invalid_input");
    }
  }

  async resolve(input: VideoClient.Selection): Promise<VideoClient.Resolved> {
    try {
      const selected = selection(input);
      const view = await catalogViewOnMiss(
        this.#catalog,
        (v) => !v.video.cardById(selected.model_id)
      );
      const card = view.video.cardById(selected.model_id);
      if (!MediaRoutes.videoModel(card))
        throw new VideoClient.Failure("model_unavailable");
      const hostedRoute = MediaRoutes.video(
        card,
        "gg",
        selected.image ?? false
      );
      if (selected.provider === "gg") {
        if (!hostedRoute) throw new VideoClient.Failure("input_unsupported");
        this.#hosted();
        return this.#operation(hostedRoute, false);
      }
      const order =
        selected.provider === "auto"
          ? byokProvidersFor("video")
              .map((p) => p.id)
              .filter(isProvider)
          : [selected.provider];
      let capable = false;
      for (const provider of order) {
        const route = MediaRoutes.video(
          card,
          provider,
          selected.image ?? false
        );
        if (!route) continue;
        capable = true;
        if (!(await this.#key(provider))) continue;
        return this.#operation(route, selected.image ?? false);
      }
      if (
        selected.provider === "auto" &&
        hostedRoute &&
        liveGgMediaDeps({ gg: this.#gg, gg_base_url: this.#ggBaseUrl })
      ) {
        return this.#operation(hostedRoute, false);
      }

      throw new VideoClient.Failure(
        capable ? "provider_unavailable" : "input_unsupported"
      );
    } catch (error) {
      throw safeFailure(error);
    }
  }

  async #key(provider: VideoClient.ByokProvider): Promise<string | null> {
    const value = await this.#getKey(provider);
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  #hosted() {
    const hosted = liveGgMediaDeps({
      gg: this.#gg,
      gg_base_url: this.#ggBaseUrl,
    });
    if (!hosted) throw new VideoClient.Failure("gg_token_expired");
    return hosted;
  }

  #operation(
    metadata: VideoClient.Descriptor,
    image: boolean
  ): VideoClient.Resolved {
    const descriptor = Object.freeze({ ...metadata });
    return Object.freeze({
      ...descriptor,
      generate: (input: VideoClient.Input) =>
        this.#generate(descriptor, image, input),
    });
  }

  async #generate(
    descriptor: VideoClient.Descriptor,
    image: boolean,
    input: VideoClient.Input
  ): Promise<VideoClient.Result> {
    let request: MediaRequest | undefined;
    try {
      const args = generationInput(input, image, descriptor.provider_id);
      request = new MediaRequest(this.#http, args.signal);
      request.check();
      let raw: videoModels.Video[];
      if (descriptor.provider_id === "gg") {
        const hosted = this.#hosted();
        raw = await request.wait(
          videoModels.hosted(
            hosted.session,
            hosted.base_url,
            descriptor.binding_id,
            args,
            request
          )
        );
      } else {
        // One private authority snapshot per invocation, retained for this job's polls/content.
        const key = await request.wait(this.#key(descriptor.provider_id));
        request.check();
        if (!key) throw new VideoClient.Failure("provider_unavailable");
        raw = await request.wait(
          videoModels.byok(
            descriptor.provider_id,
            key,
            descriptor.binding_id,
            args,
            request
          )
        );
      }
      request.check();
      if (
        !Array.isArray(raw) ||
        !raw.length ||
        raw.length > MediaInputs.limits.video_items
      )
        throw new VideoClient.Failure("invalid_response");
      let total = 0;
      const videos: VideoClient.Result["videos"] = [];
      for (const item of raw) {
        request.check();
        if (
          typeof item.mediaType !== "string" ||
          !/^video\/[a-z0-9.+-]+$/i.test(item.mediaType)
        )
          throw new VideoClient.Failure("invalid_response");
        let data: Uint8Array;
        if (item.type === "binary") {
          if (!(item.data instanceof Uint8Array))
            throw new VideoClient.Failure("invalid_response");
          data = item.data;
        } else if (item.type === "base64") {
          data = decode(item.data, videoModels.maxBytes - total);
        } else if (item.type === "url") {
          const url = resultUrl(item.url, descriptor.provider_id);
          data = (await request.download(url, videoModels.maxBytes - total))
            .data;
        } else throw new VideoClient.Failure("invalid_response");
        total += data.byteLength;
        if (!data.byteLength || total > videoModels.maxBytes)
          throw new VideoClient.Failure("invalid_response");
        videos.push({
          data: Uint8Array.from(data),
          media_type: item.mediaType,
        });
      }
      request.check();
      return { videos };
    } catch (error) {
      try {
        request?.check();
      } catch (abort) {
        throw safeFailure(abort);
      }
      throw safeFailure(error);
    } finally {
      request?.dispose();
    }
  }
}

export namespace VideoClient {
  export type ByokProvider = models.video.VideoProvider;
  export type Provider = ByokProvider | "gg";
  export type Keys = {
    get(provider: ByokProvider): string | null | Promise<string | null>;
  };
  export type Options = {
    keys: Keys;
    http: ProviderHttp;
    catalog?: ModelCatalogStore;
    gg?: GgTokenSource;
    gg_base_url?: string;
  };
  export type Selection = {
    model_id: string;
    provider: Provider | "auto";
    image?: boolean;
  };
  export type Descriptor = Readonly<{
    model_id: string;
    provider_id: Provider;
    binding_id: string;
    input: models.video.VideoInput;
  }>;
  export type Resolved = Descriptor & {
    readonly generate: (input: Input) => Promise<Result>;
  };
  export type Input = {
    prompt: string;
    aspect_ratio?: `${number}:${number}`;
    resolution?: `${number}x${number}`;
    duration?: number;
    fps?: number;
    /** Safe integer. The pinned Vercel adapter cannot honor zero and rejects it. */
    seed?: number;
    /** An already authorized HTTPS start frame; local files and inline data are not read. */
    image_url?: string;
    signal?: AbortSignal;
  };
  export type Result = { videos: { data: Uint8Array; media_type: string }[] };
  export type FailureCode =
    | "invalid_input"
    | "model_unavailable"
    | "provider_unavailable"
    | "input_unsupported"
    | "gg_token_expired"
    | "insufficient_credits"
    | "aborted"
    | "timeout"
    | "invalid_response"
    | "generation_failed"
    | "unsupported_untrusted_result_origin";
  export class Failure extends Error {
    readonly code: FailureCode;
    constructor(code: FailureCode) {
      super(failureCode(code));
      this.name = "VideoFailure";
      this.code = failureCode(code);
    }
    toJSON(): { code: FailureCode; message: string } {
      return { code: this.code, message: this.code };
    }
  }
}

function selection(value: VideoClient.Selection): VideoClient.Selection {
  try {
    exactKeys(value, ["model_id", "provider", "image"]);
    const { model_id, provider, image } = value;
    if (
      typeof model_id !== "string" ||
      !model_id ||
      model_id.length > 256 ||
      !(provider === "auto" || provider === "gg" || isProvider(provider)) ||
      (image !== undefined && typeof image !== "boolean")
    )
      throw 0;
    return { model_id, provider, image };
  } catch {
    throw new VideoClient.Failure("invalid_input");
  }
}

function generationInput(
  value: VideoClient.Input,
  image: boolean,
  provider: VideoClient.Provider
): VideoClient.Input {
  try {
    return InputSchema.native(
      MediaInputs.video(image, provider),
      value,
      image ? [] : ["image_url"]
    );
  } catch {
    throw new VideoClient.Failure("invalid_input");
  }
}

function resultUrl(value: string, provider: VideoClient.Provider): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new VideoClient.Failure("invalid_response");
  }
  if (url.protocol === "data:") return url;
  if (url.protocol !== "https:" || url.username || url.password)
    throw new VideoClient.Failure("invalid_response");
  if (
    provider === "vercel" &&
    url.origin !== new URL(videoModels.vercelBase).origin
  )
    throw new VideoClient.Failure("unsupported_untrusted_result_origin");
  return url;
}

function decode(value: string, maximum: number): Uint8Array {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil(maximum / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw new VideoClient.Failure("invalid_response");
  try {
    const text = atob(value);
    if (text.length > maximum) throw 0;
    return Uint8Array.from(text, (character) => character.charCodeAt(0));
  } catch {
    throw new VideoClient.Failure("invalid_response");
  }
}

function exactKeys(value: unknown, allowed: readonly string[]): void {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Reflect.ownKeys(value).some(
      (key) => typeof key !== "string" || !allowed.includes(key)
    )
  )
    throw 0;
}
function isProvider(value: string): value is VideoClient.ByokProvider {
  return (models.video.providers as readonly string[]).includes(value);
}
function safeFailure(error: unknown): VideoClient.Failure {
  try {
    if (
      error instanceof VideoClient.Failure ||
      error instanceof MediaRequest.Failure
    )
      return new VideoClient.Failure(error.code);
    if (error instanceof GridaGatewayAuthError)
      return new VideoClient.Failure("gg_token_expired");
    if (error instanceof GridaGatewayCreditsError)
      return new VideoClient.Failure("insufficient_credits");
  } catch {
    /* Unknown host errors can have throwing accessors. */
  }
  return new VideoClient.Failure("generation_failed");
}
function failureCode(value: unknown): VideoClient.FailureCode {
  return typeof value === "string" &&
    [
      "invalid_input",
      "model_unavailable",
      "provider_unavailable",
      "input_unsupported",
      "gg_token_expired",
      "insufficient_credits",
      "aborted",
      "timeout",
      "invalid_response",
      "generation_failed",
      "unsupported_untrusted_result_origin",
    ].includes(value)
    ? (value as VideoClient.FailureCode)
    : "generation_failed";
}
