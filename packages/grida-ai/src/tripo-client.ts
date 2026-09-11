// GRIDA-SEC-004 — exact Tripo operations, private credentials, bounded uploads and GLB result.
import { catalog as models } from "@grida/ai-models/grida";
import { InputSchema } from "./input-schema";
import { TripoInputs } from "./tripo-inputs";
import { ProviderCredentials } from "./provider-credentials";
import { ProviderHttp } from "./http";
import { MediaRequest } from "./media-request";
import { MediaInputs } from "./media-inputs";
import { delay } from "./fetch-helpers";

const API = "https://openapi.tripo3d.ai/v3";
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
  constructor(options: TripoClient.Options) {
    try {
      InputSchema.exact(options, ["http", "keys"]);
      if (
        !(options.http instanceof ProviderHttp) ||
        typeof options.keys.get !== "function"
      )
        throw 0;
      this.#http = options.http;
      this.#getKey = options.keys.get.bind(options.keys);
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
      await this.#key(request);
      const descriptor = Object.freeze({
        feature: "model-generation" as const,
        model_id: selected.model_id,
        binding_id: catalogue.models[selected.model_id].binding_id,
        provider_id: "tripo" as const,
        variant: selected.variant,
      });
      return Object.freeze({
        ...descriptor,
        generate: (args: TripoClient.Input) => this.#generate(descriptor, args),
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
    input: TripoClient.Input
  ): Promise<TripoClient.Result> {
    let request: MediaRequest | undefined;
    let taskId: string | undefined;
    try {
      let normalized: TripoClient.Input;
      try {
        normalized = InputSchema.native(
          TripoInputs.rule(descriptor.model_id, descriptor.variant),
          input
        );
      } catch {
        throw new LocalFailure("invalid_input");
      }
      request = new MediaRequest(this.#http, normalized.signal, 600_000);
      const key = await this.#key(request);
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
        body.input = await upload(request, key, normalized.image);
      else {
        const inputs: Record<string, string>[] = [];
        for (const view of ["front", "left", "back", "right"] as const) {
          const image = normalized.images[view];
          if (image) inputs.push({ [view]: await upload(request, key, image) });
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
      if (acceptedId.includes(key)) invalid();
      taskId = acceptedId;
      for (;;) {
        const task = await json(request, key, `/tasks/${taskId}`, "GET");
        if (
          task.task_id !== taskId ||
          task.type !== taskTypes[descriptor.variant] ||
          typeof task.status !== "string"
        )
          invalid();
        if (task.status === "success") {
          if (!record(task.output)) invalid();
          const url = assetUrl(task.output.model_url);
          const downloaded = await request.download(
            url,
            MediaInputs.limits.glb
          );
          validateGlb(downloaded.data);
          request.check();
          const consumed = task.credits_consumed;
          if (
            consumed !== undefined &&
            (typeof consumed !== "number" ||
              !Number.isFinite(consumed) ||
              consumed < 0)
          )
            invalid();
          return {
            glb: { data: downloaded.data, media_type: "model/gltf-binary" },
            task: {
              id: taskId,
              ...(consumed === undefined
                ? {}
                : { credits_consumed: consumed as number }),
            },
          };
        }
        if (["failed", "cancelled", "banned", "expired"].includes(task.status))
          throw new LocalFailure("generation_failed");
        if (task.status !== "queued" && task.status !== "running") invalid();
        if (
          !Number.isInteger(task.progress) ||
          (task.progress as number) < 0 ||
          (task.progress as number) > 100
        )
          invalid();
        await request.wait(delay(2_000, request.signal));
      }
    } catch (error) {
      throw failure(error, request, taskId);
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
  export type Options = { keys: Keys; http: ProviderHttp };
  export type Image = {
    data: Uint8Array;
    media_type: "image/png" | "image/jpeg";
  };
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
  export type Selection<
    M extends string = ModelId,
    V extends Variant = Variant,
  > = {
    feature: "model-generation";
    model_id: M;
    provider: "tripo";
    variant: V;
  };
  export type Descriptor = Readonly<{
    feature: "model-generation";
    model_id: ModelId;
    binding_id: models.three_d.model_generation.ModelCard["binding_id"];
    provider_id: "tripo";
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
        }
      >;
    }[V];
  }[M];
  export type Result = {
    glb: { data: Uint8Array; media_type: "model/gltf-binary" };
    task: { id: string; credits_consumed?: number };
  };
  export type FailureCode =
    | "invalid_input"
    | "model_unavailable"
    | "provider_key_required"
    | "credential_rejected"
    | "access_denied"
    | "insufficient_credits"
    | "aborted"
    | "timeout"
    | "invalid_response"
    | "generation_failed";
  export class Failure extends Error {
    readonly code: FailureCode;
    readonly task_id?: string;
    constructor(code: FailureCode, task_id?: string) {
      const safe = codes.includes(code) ? code : "generation_failed";
      super(safe);
      this.name = "TripoFailure";
      this.code = safe;
      if (typeof task_id === "string" && validIdentifier(task_id))
        this.task_id = task_id;
    }
    toJSON() {
      return {
        code: this.code,
        message: this.code,
        ...(this.task_id ? { task_id: this.task_id } : {}),
      };
    }
  }
}
const codes: readonly TripoClient.FailureCode[] = [
  "invalid_input",
  "model_unavailable",
  "provider_key_required",
  "credential_rejected",
  "access_denied",
  "insufficient_credits",
  "aborted",
  "timeout",
  "invalid_response",
  "generation_failed",
];
class LocalFailure extends Error {
  constructor(readonly code: TripoClient.FailureCode) {
    super(code);
  }
}
function failure(error: unknown, request?: MediaRequest, task_id?: string) {
  try {
    request?.check();
  } catch (abort) {
    error = abort;
  }
  let code: TripoClient.FailureCode = "generation_failed";
  try {
    if (error instanceof LocalFailure || error instanceof MediaRequest.Failure)
      code = error.code;
  } catch {
    // Host failures may even throw while their prototype is inspected.
  }
  return new TripoClient.Failure(code, task_id);
}
function selection(value: TripoClient.Selection<string>) {
  InputSchema.exact(value, ["model_id", "provider", "feature", "variant"]);
  const { model_id, provider, feature, variant } = value;
  if (
    provider !== "tripo" ||
    feature !== "model-generation" ||
    typeof model_id !== "string" ||
    !model_id ||
    model_id.length > 256 ||
    !variants.includes(variant)
  )
    throw 0;
  if (!catalogue.is_model_id(model_id))
    throw new LocalFailure("model_unavailable");
  return { model_id, variant };
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function invalid(): never {
  throw new LocalFailure("invalid_response");
}
function validIdentifier(value: string, prefix: "task" | "file" = "task") {
  return (
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value
    ) || new RegExp(`^${prefix}_[A-Za-z0-9_-]{1,100}$`).test(value)
  );
}
function identifier(value: unknown, prefix: "task" | "file" = "task"): string {
  if (typeof value !== "string" || !validIdentifier(value, prefix)) invalid();
  return value;
}
async function json(
  request: MediaRequest,
  key: string,
  path: string,
  method: "GET" | "POST",
  body?: string | Uint8Array<ArrayBuffer>,
  contentType = "application/json"
) {
  const url = API + path;
  const response = await request.request(
    url,
    {
      method,
      headers: {
        authorization: `Bearer ${key}`,
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": contentType }),
      },
      body,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    },
    1024 * 1024
  );
  if (
    response.redirected ||
    response.type === "opaqueredirect" ||
    (response.url && response.url !== url) ||
    (response.status >= 300 && response.status < 400)
  )
    invalid();
  if (response.status === 401) throw new LocalFailure("credential_rejected");
  let payload: unknown;
  try {
    payload = JSON.parse(await request.wait(response.text()));
  } catch (error) {
    if (response.status === 403) throw new LocalFailure("access_denied");
    if (error instanceof MediaRequest.Failure) throw error;
    invalid();
  }
  if (response.status === 403 && (!record(payload) || payload.code !== 2010))
    throw new LocalFailure("access_denied");
  if (!record(payload) || !Number.isInteger(payload.code)) invalid();
  if (payload.code === 1000 || payload.code === 1001)
    throw new LocalFailure("credential_rejected");
  if (payload.code === 2010) throw new LocalFailure("insufficient_credits");
  if (response.status === 403) throw new LocalFailure("access_denied");
  if (!response.ok || payload.code !== 0)
    throw new LocalFailure("generation_failed");
  if (!record(payload.data)) invalid();
  return payload.data;
}
async function upload(
  request: MediaRequest,
  key: string,
  image: TripoClient.Image
) {
  // A browser-compatible bounded multipart body; no FormData/stream escape hatch is required from hosts.
  const boundary = `grida-tripo-${crypto.randomUUID()}`;
  const extension = image.media_type === "image/png" ? "png" : "jpg";
  const encoder = new TextEncoder();
  const start = encoder.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="image.${extension}"\r\nContent-Type: ${image.media_type}\r\n\r\n`
  );
  const end = encoder.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(start.length + image.data.length + end.length);
  body.set(start);
  body.set(image.data, start.length);
  body.set(end, start.length + image.data.length);
  const result = await json(
    request,
    key,
    "/files",
    "POST",
    body,
    `multipart/form-data; boundary=${boundary}`
  );
  return identifier(result.file_token, "file");
}
function assetUrl(value: unknown): URL {
  if (typeof value !== "string") invalid();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalid();
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !["cdn.tripo3d.ai", "tripo-data.rg1.data.tripo3d.com"].includes(
      url.hostname
    )
  )
    invalid();
  return url;
}
function validateGlb(data: Uint8Array) {
  if (data.byteLength < 20 || data.byteLength > MediaInputs.limits.glb)
    invalid();
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== data.byteLength
  )
    invalid();
  const jsonSize = view.getUint32(12, true);
  if (
    view.getUint32(16, true) !== 0x4e4f534a ||
    jsonSize % 4 !== 0 ||
    jsonSize > 4 * 1024 * 1024 ||
    jsonSize > data.byteLength - 20
  )
    invalid();
  let document: unknown;
  try {
    document = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        data.subarray(20, 20 + jsonSize)
      )
    );
  } catch {
    invalid();
  }
  if (
    !record(document) ||
    !record(document.asset) ||
    document.asset.version !== "2.0"
  )
    invalid();
  for (const key of ["extensionsUsed", "extensionsRequired"] as const) {
    if (
      document[key] !== undefined &&
      (!Array.isArray(document[key]) ||
        document[key].some(
          (extension: unknown) =>
            typeof extension !== "string" ||
            [
              "EXT_meshopt_compression",
              "KHR_draco_mesh_compression",
              "KHR_texture_basisu",
            ].includes(extension)
        ))
    )
      invalid();
  }
  // A single returned GLB must not smuggle expiring external resources into the result.
  for (const key of ["buffers", "images"] as const) {
    if (
      document[key] !== undefined &&
      (!Array.isArray(document[key]) ||
        document[key].some(
          (item: unknown) => !record(item) || item.uri !== undefined
        ))
    )
      invalid();
  }
  let offset = 20 + jsonSize;
  if (offset < data.byteLength) {
    if (
      data.byteLength - offset < 8 ||
      view.getUint32(offset + 4, true) !== 0x004e4942
    )
      invalid();
    const size = view.getUint32(offset, true);
    if (size % 4 !== 0 || offset + 8 + size !== data.byteLength) invalid();
    offset += 8 + size;
  }
  if (offset !== data.byteLength) invalid();
}
