// GRIDA-SEC-004 — explicit provider authority, separate downloads, safe operation failures.
// GRIDA-SEC-006 — scoped GG credential is re-read at use; no mint or persistent custody.
// GRIDA-GG: token — explicit GG selection never falls back to BYOK.
import { models } from "@grida/ai-models";
import { InputSchema } from "./input-schema";
import { MediaInputs } from "./media-inputs";
import { MediaRoutes } from "./media-routes";
import type { ImageModelV3 } from "@ai-sdk/provider";
import { generateImage } from "ai";
import { makeImageModelFor } from "./image-byok";
import { GridaGatewayImageModel } from "./image-gg";
import {
  GridaGatewayAuthError,
  GridaGatewayCreditsError,
  gridaGatewayOrigin,
} from "./gg";
import { liveGgMediaDeps, type GgTokenSource } from "./gg-session";
import { ProviderHttp } from "./http";
import { catalogViewOnMiss, type ModelCatalogStore } from "./model-catalog";
import { byokProvidersFor } from "./provider-ids";

/** Catalogue-backed image operations. Construction supplies authority, never a default model. */
export class ImageClient {
  readonly #getKey: ImageClient.Keys["get"];
  readonly #http: ProviderHttp;
  readonly #catalog?: ModelCatalogStore;
  readonly #gg?: GgTokenSource;
  readonly #ggBaseUrl?: string;

  constructor(options: ImageClient.Options) {
    try {
      const { keys, http, catalog, gg, gg_base_url } = options;
      const get = keys.get;
      if (!(http instanceof ProviderHttp) || typeof get !== "function") {
        throw new ImageClient.Failure("invalid_input");
      }
      this.#getKey = get.bind(keys);
      this.#http = http;
      this.#catalog = catalog;
      if (gg !== undefined) {
        const read = gg.getAccessToken.bind(gg);
        this.#gg = { getAccessToken: read };
      }
      if (gg_base_url !== undefined) {
        this.#ggBaseUrl = gridaGatewayOrigin(gg_base_url);
      }
    } catch {
      throw new ImageClient.Failure("invalid_input");
    }
  }

  /** Resolve before reading host assets. `auto` explicitly opts into legacy BYOK order, then GG. */
  async resolve(input: ImageClient.Selection): Promise<ImageClient.Resolved> {
    try {
      const selected = selection(input);
      const view = await catalogViewOnMiss(
        this.#catalog,
        (v) => !v.image.cardById(selected.model_id)
      );
      const card = view.image.cardById(selected.model_id);
      if (!MediaRoutes.imageModel(card))
        throw new ImageClient.Failure("model_unavailable");
      if (selected.provider === "gg") {
        if (selected.references)
          throw new ImageClient.Failure("references_unsupported");
        const route = MediaRoutes.image(card, "gg", false, selected.background);
        if (!route) throw new ImageClient.Failure("provider_unavailable");
        this.#hosted();
        return this.#operation(route, selected.background);
      }
      const order =
        selected.provider === "auto"
          ? byokProvidersFor("image")
              .map((p) => p.id)
              .filter(isImageProvider)
          : [selected.provider];
      let referenceCapable = false;
      for (const provider of order) {
        const route = MediaRoutes.image(
          card,
          provider,
          selected.references ?? false,
          selected.background
        );
        if (!route) continue;
        referenceCapable = true;
        if (!(await this.#key(provider))) continue;
        return this.#operation(route, selected.background);
      }
      const hostedRoute = MediaRoutes.image(
        card,
        "gg",
        false,
        selected.background
      );
      if (
        selected.provider === "auto" &&
        !selected.references &&
        hostedRoute &&
        liveGgMediaDeps({ gg: this.#gg, gg_base_url: this.#ggBaseUrl })
      ) {
        return this.#operation(hostedRoute, selected.background);
      }

      throw new ImageClient.Failure(
        selected.references && !referenceCapable
          ? "references_unsupported"
          : "provider_unavailable"
      );
    } catch (error) {
      throw safeFailure(error);
    }
  }

  async #key(provider: ImageClient.ByokProvider): Promise<string | null> {
    const key = await this.#getKey(provider);
    return typeof key === "string" && key.trim() ? key.trim() : null;
  }

  #hosted() {
    const hosted = liveGgMediaDeps({
      gg: this.#gg,
      gg_base_url: this.#ggBaseUrl,
    });
    if (!hosted) throw new ImageClient.Failure("gg_token_expired");
    return hosted;
  }

  #operation(
    metadata: ImageClient.Descriptor,
    background?: ImageClient.Background
  ): ImageClient.Resolved {
    const capturedBackground = background === "auto" ? undefined : background;
    const descriptor = Object.freeze({ ...metadata });
    return Object.freeze({
      ...descriptor,
      generate: (input: ImageClient.Input) =>
        this.#generate(descriptor, input, capturedBackground),
    });
  }

  async #generate(
    descriptor: ImageClient.Descriptor,
    input: ImageClient.Input,
    capturedBackground?: "opaque" | "transparent"
  ): Promise<ImageClient.Result> {
    let signal: AbortSignal | undefined;
    try {
      const args = generationInput(input, descriptor);
      if (
        capturedBackground &&
        args.background !== undefined &&
        args.background !== capturedBackground
      )
        throw new ImageClient.Failure("invalid_input");
      const background =
        capturedBackground ??
        (args.background === "auto" ? undefined : args.background);
      signal = args.signal;
      if (signal?.aborted) throw new ImageClient.Failure("aborted");
      const provider = descriptor.provider_id;
      let model;
      if (provider === "gg") {
        const hosted = this.#hosted();
        model = new GridaGatewayImageModel(
          hosted.session,
          hosted.base_url,
          descriptor.binding_id,
          this.#http,
          background
        );
      } else {
        const key = await this.#key(provider);
        if (!key) throw new ImageClient.Failure("provider_unavailable");
        model = makeImageModelFor(
          provider,
          key,
          descriptor.binding_id,
          this.#http,
          background
        );
      }
      if (signal?.aborted) throw new ImageClient.Failure("aborted");
      // The AI SDK logs warnings after generation. Provider warning text is
      // untrusted output, so remove it before that logger sees the result.
      const safeModel: ImageModelV3 = {
        specificationVersion: model.specificationVersion,
        provider: model.provider,
        modelId: model.modelId,
        maxImagesPerCall: model.maxImagesPerCall,
        doGenerate: async (options) => ({
          ...(await model.doGenerate(options)),
          warnings: [],
        }),
      };
      const qualityNamespace =
        provider === "vercel" && descriptor.binding_id.startsWith("openai/")
          ? "openai"
          : provider;
      const result = await generateImage({
        model: safeModel,
        prompt: args.prompt,
        n: args.n,
        size: args.size,
        aspectRatio: args.aspect_ratio,
        seed: args.seed,
        abortSignal: signal,
        // Respect provider batch limits; never retry a failed paid batch.
        maxRetries: 0,
        providerOptions: {
          ...(args.quality
            ? { [qualityNamespace]: { quality: args.quality } }
            : {}),
          ...(args.references
            ? { grida: { references: args.references } }
            : {}),
        },
      });
      if (signal?.aborted) throw new ImageClient.Failure("aborted");
      if (result.images.length === 0 || result.images.length > args.n)
        throw new ImageClient.Failure("invalid_response");
      let total = 0;
      const images = result.images.map((image) => {
        const data = image.uint8Array;
        total += data.byteLength;
        if (
          !data.byteLength ||
          total > MediaInputs.limits.image ||
          !/^image\/[a-z0-9.+-]+$/i.test(image.mediaType)
        ) {
          throw new ImageClient.Failure("invalid_response");
        }
        return { data: Uint8Array.from(data), media_type: image.mediaType };
      });
      return { images };
    } catch (error) {
      if (isAborted(signal)) throw new ImageClient.Failure("aborted");
      throw safeFailure(error);
    }
  }
}

export namespace ImageClient {
  export type Background = "auto" | "opaque" | "transparent";
  export type ByokProvider = models.image.ImageProvider;
  export type Provider = ByokProvider | "gg";
  /** Private host capability. It is never returned or forwarded to a model. */
  export type Keys = {
    get(provider: ByokProvider): string | null | Promise<string | null>;
  };
  export type Options = {
    keys: Keys;
    /** Explicit host choice. ImageClient never constructs an ambient transport. */
    http: ProviderHttp;
    catalog?: ModelCatalogStore;
    gg?: GgTokenSource;
    gg_base_url?: string;
  };
  export type Selection = {
    model_id: string;
    provider: Provider | "auto";
    references?: boolean;
    /** Native intent participates in provider selection before host asset reads. */
    background?: Background;
  };
  export type Descriptor = Readonly<{
    model_id: string;
    provider_id: Provider;
    binding_id: string;
    references_max?: number;
    /** Both explicit opaque and transparent require verified native support. */
    native_background?: true;
  }>;
  export type Resolved = Descriptor & {
    readonly generate: (input: Input) => Promise<Result>;
  };
  export type Input = {
    prompt: string;
    /** Image count 1–16. Provider batch limits may require multiple submissions. */
    n?: number;
    size?: `${number}x${number}`;
    aspect_ratio?: `${number}:${number}`;
    seed?: number;
    quality?: string;
    /** Cannot override a non-auto mode captured during resolution. */
    background?: Background;
    /** Already authorized and resolved by the host: HTTPS or inline image data URLs. */
    references?: readonly string[];
    signal?: AbortSignal;
  };
  export type Result = { images: { data: Uint8Array; media_type: string }[] };
  export type FailureCode =
    | "invalid_input"
    | "model_unavailable"
    | "provider_unavailable"
    | "references_unsupported"
    | "gg_token_expired"
    | "insufficient_credits"
    | "aborted"
    | "invalid_response"
    | "generation_failed";
  /** Safe for display/serialization: no upstream cause, input, response, or credentials. */
  export class Failure extends Error {
    readonly code: FailureCode;
    constructor(code: FailureCode) {
      super(failureCode(code));
      this.name = "ImageFailure";
      this.code = failureCode(code);
    }
    toJSON(): { code: FailureCode; message: string } {
      return { code: this.code, message: this.code };
    }
  }
}

function isImageProvider(value: string): value is ImageClient.ByokProvider {
  return (models.image.providers as readonly string[]).includes(value);
}

function selection(value: ImageClient.Selection): ImageClient.Selection {
  try {
    exactKeys(value, ["model_id", "provider", "references", "background"]);
    const { model_id, provider, references, background } = value;
    if (
      typeof model_id !== "string" ||
      !model_id ||
      model_id.length > 256 ||
      !(
        provider === "auto" ||
        provider === "gg" ||
        isImageProvider(provider)
      ) ||
      (references !== undefined && typeof references !== "boolean") ||
      (background !== undefined &&
        !["auto", "opaque", "transparent"].includes(background))
    )
      throw 0;
    return { model_id, provider, references, background };
  } catch {
    throw new ImageClient.Failure("invalid_input");
  }
}

function generationInput(
  value: ImageClient.Input,
  descriptor: ImageClient.Descriptor
) {
  try {
    const rule = MediaInputs.image(descriptor);
    const properties = rule.schema.properties as Record<string, unknown>;
    return InputSchema.native(
      rule,
      value,
      ["references", "seed", "aspect_ratio"].filter(
        (key) => !(key in properties)
      )
    );
  } catch {
    throw new ImageClient.Failure("invalid_input");
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

function safeFailure(error: unknown): ImageClient.Failure {
  try {
    if (error instanceof ImageClient.Failure)
      return new ImageClient.Failure(error.code);
    if (error instanceof GridaGatewayAuthError)
      return new ImageClient.Failure("gg_token_expired");
    if (error instanceof GridaGatewayCreditsError)
      return new ImageClient.Failure("insufficient_credits");
  } catch {
    /* A host can throw an object with hostile accessors. */
  }
  return new ImageClient.Failure("generation_failed");
}

/** A host-supplied signal getter must not throw past the safe error boundary. */
function isAborted(signal: AbortSignal | undefined): boolean {
  try {
    return signal?.aborted === true;
  } catch {
    return false;
  }
}

function failureCode(value: unknown): ImageClient.FailureCode {
  return typeof value === "string" &&
    [
      "invalid_input",
      "model_unavailable",
      "provider_unavailable",
      "references_unsupported",
      "gg_token_expired",
      "insufficient_credits",
      "aborted",
      "invalid_response",
      "generation_failed",
    ].includes(value)
    ? (value as ImageClient.FailureCode)
    : "generation_failed";
}
