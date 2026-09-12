// GRIDA-SEC-004 — exact Tripo operations, private credentials, bounded uploads and GLB result.
// GRIDA-SEC-006 — scoped GG tokens remain on the fixed gateway request lane.
// GRIDA-GG: provider — explicit funded operation; never falls back between accounts.
import { catalog as models } from "@grida/ai-models/grida";
import { InputSchema } from "./input-schema";
import { TripoInputs } from "./tripo-inputs";
import { ProviderCredentials } from "./provider-credentials";
import { ProviderHttp } from "./http";
import { MediaRequest } from "./media-request";
import { MediaInputs } from "./media-inputs";
import { delay } from "./fetch-helpers";
import { TripoTransport } from "./tripo-transport";
import type { GgTokenSource } from "./gg-session";
import { GgTripo } from "./gg-tripo";

const {
  codes,
  validIdentifier,
  identifier,
  json,
  upload,
  assetUrl,
  validateGlb,
} = TripoTransport;
const LocalFailure = TripoTransport.Failure;
const catalogue = models.three_d.model_generation;
const variants = ["text", "image", "multiview"] as const;
const taskTypes = {
  text: "text_to_model",
  image: "image_to_model",
  multiview: "multiview_to_model",
} as const;

/** Direct Tripo model generation. Processing and animation are separate features. */
export class TripoClient {
  readonly #http: ProviderHttp;
  readonly #getKey: TripoClient.Keys["get"];
  readonly #gg?: GgTripo;
  constructor(options: TripoClient.Options) {
    try {
      InputSchema.exact(options, ["http", "keys", "gg", "gg_base_url"]);
      if (
        !(options.http instanceof ProviderHttp) ||
        typeof options.keys.get !== "function"
      )
        throw 0;
      this.#http = options.http;
      this.#getKey = options.keys.get.bind(options.keys);
      if (
        options.gg !== undefined &&
        typeof options.gg.getAccessToken !== "function"
      )
        throw 0;
      if (options.gg && options.gg_base_url)
        this.#gg = new GgTripo(options.gg, options.gg_base_url);
    } catch {
      throw new TripoClient.Failure("invalid_input");
    }
  }

  resolve<M extends TripoClient.ModelId, V extends TripoClient.Variant>(
    input: TripoClient.Selection<M, V>
  ): Promise<TripoClient.Resolved<M, V>>;
  resolve(input: TripoClient.Selection<string>): Promise<TripoClient.Resolved>;
  async resolve(
    input: TripoClient.Selection<string>
  ): Promise<TripoClient.Resolved> {
    let request: MediaRequest | undefined;
    try {
      let selected: ReturnType<typeof selection>;
      try {
        selected = selection(input);
      } catch (error) {
        if (error instanceof LocalFailure) throw error;
        throw new LocalFailure("invalid_input");
      }
      request = new MediaRequest(this.#http);
      if (selected.provider === "gg") {
        if (!this.#gg) throw new LocalFailure("gg_token_expired");
        this.#gg.ready();
      } else await this.#key(request);
      const descriptor = Object.freeze({
        feature: "model-generation" as const,
        model_id: selected.model_id,
        binding_id: catalogue.models[selected.model_id].binding_id,
        provider_id: selected.provider,
        variant: selected.variant,
      });
      return Object.freeze({
        ...descriptor,
        generate: (args: TripoClient.Input) => this.#generate(descriptor, args),
        generateUploaded: (args: TripoClient.UploadedInput) =>
          this.#generate(descriptor, args, true),
      }) as TripoClient.Resolved;
    } catch (error) {
      throw failure(error, request);
    } finally {
      request?.dispose();
    }
  }

  async #key(request: MediaRequest): Promise<string> {
    request.check();
    const value = await request.wait(Promise.resolve(this.#getKey("tripo")));
    request.check();
    if (value === null || value === undefined || value === "")
      throw new LocalFailure("provider_key_required");
    try {
      return ProviderCredentials.normalize("tripo", value);
    } catch {
      throw new LocalFailure("provider_key_required");
    }
  }

  async #generate(
    descriptor: TripoClient.Descriptor,
    input: TripoClient.Input | TripoClient.UploadedInput,
    uploaded = false
  ): Promise<TripoClient.Result> {
    let request: MediaRequest | undefined;
    let taskId: string | undefined;
    let completedTask: TripoClient.Task | undefined;
    try {
      let normalized: TripoClient.Input | TripoClient.UploadedInput;
      try {
        normalized = InputSchema.native<
          TripoClient.Input | TripoClient.UploadedInput
        >(
          uploaded
            ? TripoInputs.uploadedRule(descriptor.model_id, descriptor.variant)
            : TripoInputs.rule(descriptor.model_id, descriptor.variant),
          input
        );
      } catch {
        throw new LocalFailure("invalid_input");
      }
      request = new MediaRequest(
        this.#http,
        normalized.signal,
        descriptor.provider_id === "gg" ? 780_000 : 600_000
      );
      if (descriptor.provider_id === "gg") {
        if (uploaded) throw new LocalFailure("invalid_input");
        if (!this.#gg) throw new LocalFailure("gg_token_expired");
        return await this.#gg.generate(
          request,
          descriptor,
          normalized as TripoClient.Input
        );
      }
      const key = await this.#key(request);
      const imageToken = (
        image: TripoClient.Image | TripoClient.UploadedImage
      ) => {
        if ("data" in image) return upload(request!, key, image);
        if (image.file_token.includes(key))
          throw new LocalFailure("invalid_input");
        return Promise.resolve(image.file_token);
      };
      const body: Record<string, unknown> = {
        model: descriptor.binding_id,
        texture: normalized.texture ?? true,
        pbr: normalized.pbr ?? normalized.texture ?? true,
        ...(normalized.texture_quality === undefined
          ? {}
          : { texture_quality: normalized.texture_quality }),
        ...(normalized.face_limit === undefined
          ? {}
          : { face_limit: normalized.face_limit }),
        ...(normalized.seed === undefined
          ? {}
          : { model_seed: normalized.seed }),
        ...("geometry_quality" in normalized &&
        normalized.geometry_quality !== undefined
          ? { geometry_quality: normalized.geometry_quality }
          : {}),
      };
      if ("prompt" in normalized) body.prompt = normalized.prompt;
      else if ("image" in normalized)
        body.input = await imageToken(normalized.image);
      else {
        const inputs: Record<string, string>[] = [];
        for (const view of ["front", "left", "back", "right"] as const) {
          const image = normalized.images[view];
          if (image) inputs.push({ [view]: await imageToken(image) });
        }
        body.inputs = inputs;
      }
      // The sole paid submission. Neither status errors nor transport ambiguity resubmit it.
      const submitted = await json(
        request,
        key,
        `/generation/${descriptor.variant}-to-model`,
        "POST",
        JSON.stringify(body)
      );
      const acceptedId = identifier(submitted.task_id);
      if (acceptedId.includes(key)) TripoTransport.invalid();
      taskId = acceptedId;
      for (;;) {
        const task = await json(request, key, `/tasks/${taskId}`, "GET");
        if (
          task.task_id !== taskId ||
          task.type !== taskTypes[descriptor.variant] ||
          typeof task.status !== "string"
        )
          TripoTransport.invalid();
        if (task.status === "success") {
          completedTask = TripoTransport.task(taskId, task.credits_consumed);
          if (!TripoTransport.record(task.output)) TripoTransport.invalid();
          const url = assetUrl(task.output.model_url);
          const downloaded = await request.download(
            url,
            MediaInputs.limits.glb
          );
          validateGlb(downloaded.data);
          request.check();
          return {
            glb: { data: downloaded.data, media_type: "model/gltf-binary" },
            task: completedTask,
          };
        }
        if (["failed", "cancelled", "banned", "expired"].includes(task.status))
          throw new LocalFailure("generation_failed");
        if (task.status !== "queued" && task.status !== "running")
          TripoTransport.invalid();
        if (
          !Number.isInteger(task.progress) ||
          (task.progress as number) < 0 ||
          (task.progress as number) > 100
        )
          TripoTransport.invalid();
        await request.wait(delay(2_000, request.signal));
      }
    } catch (error) {
      throw failure(error, request, taskId, completedTask);
    } finally {
      request?.dispose();
    }
  }
}

export namespace TripoClient {
  export type ModelId = models.three_d.model_generation.ModelId;
  export type Variant = models.three_d.model_generation.InputVariant;
  export type Keys = {
    get(provider: "tripo"): string | null | Promise<string | null>;
  };
  export type Provider = "tripo" | "gg";
  export type Options = {
    keys: Keys;
    http: ProviderHttp;
    gg?: GgTokenSource;
    gg_base_url?: string;
  };
  export type Image = {
    data: Uint8Array;
    media_type: "image/png" | "image/jpeg";
  };
  export type UploadedImage = {
    file_token: string;
    media_type: "image/png" | "image/jpeg";
  };
  export type UploadedViews = { front: UploadedImage } & (
    | { left: UploadedImage; back?: UploadedImage; right?: UploadedImage }
    | { left?: UploadedImage; back: UploadedImage; right?: UploadedImage }
    | { left?: UploadedImage; back?: UploadedImage; right: UploadedImage }
  );
  export type Views = { front: Image } & (
    | { left: Image; back?: Image; right?: Image }
    | { left?: Image; back: Image; right?: Image }
    | { left?: Image; back?: Image; right: Image }
  );
  export type Controls = {
    texture?: boolean;
    pbr?: boolean;
    texture_quality?: models.three_d.model_generation.TextureQuality;
    face_limit?: number;
    /** Geometry seed; serialized to the provider's model_seed. */
    seed?: number;
    signal?: AbortSignal;
  };
  type Geometry<M extends ModelId> = M extends "tripo/h3.1"
    ? { geometry_quality?: models.three_d.model_generation.GeometryQuality }
    : { geometry_quality?: never };
  type Inputs = {
    text: { prompt: string };
    image: { image: Image };
    multiview: { images: Views };
  };
  export type Input<
    M extends ModelId = ModelId,
    V extends Variant = Variant,
  > = Controls & Geometry<M> & Inputs[V];
  export type UploadedInput<
    M extends ModelId = ModelId,
    V extends Variant = Variant,
  > = Controls &
    Geometry<M> &
    {
      text: { prompt: string };
      image: { image: UploadedImage };
      multiview: { images: UploadedViews };
    }[V];
  export type Selection<
    M extends string = ModelId,
    V extends Variant = Variant,
  > = {
    feature: "model-generation";
    model_id: M;
    provider: Provider;
    variant: V;
  };
  export type Descriptor = Readonly<{
    feature: "model-generation";
    model_id: ModelId;
    binding_id: models.three_d.model_generation.ModelCard["binding_id"];
    provider_id: Provider;
    variant: Variant;
  }>;
  export type Resolved<
    M extends ModelId = ModelId,
    V extends Variant = Variant,
  > = {
    [K in M]: {
      [W in V]: Readonly<
        Omit<Descriptor, "model_id" | "variant"> & {
          model_id: K;
          variant: W;
          generate(input: Input<K, W>): Promise<Result>;
          /** Direct-provider execution of previously authorized uploads; never accepts URLs. */
          generateUploaded(input: UploadedInput<K, W>): Promise<Result>;
        }
      >;
    }[V];
  }[M];
  export type Result = {
    glb: { data: Uint8Array; media_type: "model/gltf-binary" };
    task: Task;
  };
  export type Task = TripoTransport.Task;
  export type FailureCode =
    | "invalid_input"
    | "model_unavailable"
    | "provider_unavailable"
    | "provider_key_required"
    | "credential_rejected"
    | "access_denied"
    | "insufficient_credits"
    | "gg_token_expired"
    | "aborted"
    | "timeout"
    | "invalid_response"
    | "generation_failed";
  export class Failure extends Error {
    readonly code: FailureCode;
    readonly task_id?: string;
    readonly completed_task?: Task;
    constructor(code: FailureCode, task_id?: string, completed_task?: Task) {
      const safe = codes.includes(code) ? code : "generation_failed";
      super(safe);
      this.name = "TripoFailure";
      this.code = safe;
      if (typeof task_id === "string" && validIdentifier(task_id))
        this.task_id = task_id;
      this.completed_task = TripoTransport.completedTask(
        completed_task,
        this.task_id
      );
    }
    toJSON() {
      return {
        code: this.code,
        message: this.code,
        ...(this.task_id ? { task_id: this.task_id } : {}),
        ...(this.completed_task ? { completed_task: this.completed_task } : {}),
      };
    }
  }
}
function failure(
  error: unknown,
  request?: MediaRequest,
  task_id?: string,
  completed_task?: TripoClient.Task
) {
  try {
    if (error instanceof TripoTransport.Failure) {
      task_id ??= error.task_id;
      completed_task ??= error.completed_task;
    }
  } catch {
    /* Untrusted host exceptions may trap prototype/property reads. */
  }
  return new TripoClient.Failure(
    TripoTransport.failureCode(error, request),
    task_id,
    completed_task
  );
}
function selection(value: TripoClient.Selection<string>) {
  InputSchema.exact(value, ["model_id", "provider", "feature", "variant"]);
  const { model_id, provider, feature, variant } = value;
  if (
    (provider !== "tripo" && provider !== "gg") ||
    feature !== "model-generation" ||
    typeof model_id !== "string" ||
    !model_id ||
    model_id.length > 256 ||
    !variants.includes(variant)
  )
    throw 0;
  if (!catalogue.is_model_id(model_id))
    throw new LocalFailure("model_unavailable");
  return { model_id, variant, provider };
}
