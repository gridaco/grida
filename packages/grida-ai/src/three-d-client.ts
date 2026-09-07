// GRIDA-SEC-004 — exact fal operations, private key snapshot, bounded queue and GLB result.
import { models } from "@grida/ai-models";
import { delay } from "./fetch-helpers";
import { ProviderHttp } from "./http";
import { MediaRequest } from "./media-request";

const TEXT_ID = "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d";
const IMAGE_ID = "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d";
const TRELLIS_ID = "fal-ai/trellis-2";
const QUEUE_ORIGIN = "https://queue.fal.run";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_GLB_BYTES = 64 * 1024 * 1024;

/** The three existing fal endpoints, with endpoint-specific input and result types. */
export class ThreeDClient {
  readonly #http: ProviderHttp;
  readonly #getKey: ThreeDClient.Keys["get"];

  constructor(options: ThreeDClient.Options) {
    try {
      exactKeys(options, ["keys", "http"]);
      const { keys, http } = options;
      const get = keys.get;
      if (!(http instanceof ProviderHttp) || typeof get !== "function") throw 0;
      this.#http = http;
      this.#getKey = get.bind(keys);
    } catch {
      throw new ThreeDClient.Failure("invalid_input");
    }
  }

  resolve<M extends ThreeDClient.ModelId>(
    input: ThreeDClient.Selection<M>
  ): Promise<ThreeDClient.Resolved<M>>;
  resolve(input: {
    model_id: string;
    provider: "fal";
  }): Promise<ThreeDClient.Resolved>;
  async resolve(input: {
    model_id: string;
    provider: "fal";
  }): Promise<ThreeDClient.Resolved> {
    let request: MediaRequest | undefined;
    try {
      const id = selection(input);
      const card = models.three_d.models[id];
      // Publication status does not erase these existing staged operations.
      if (
        card.id !== id ||
        card.provider !== "fal" ||
        card.deprecated ||
        card.output.primary !== "glb" ||
        card.input.type !== inputKind(id)
      )
        throw new ThreeDClient.Failure("model_unavailable");
      request = new MediaRequest(this.#http);
      await this.#key(request);
      const descriptor = Object.freeze({
        model_id: id,
        binding_id: id,
        provider_id: "fal" as const,
      });
      // Every admitted id is represented in Operations; the private dispatch
      // validates the corresponding input again at runtime before authority use.
      return Object.freeze({
        ...descriptor,
        generate: (args: ThreeDClient.Input<ThreeDClient.ModelId>) =>
          this.#generate(id, args),
      }) as ThreeDClient.Resolved;
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

  async #key(request: MediaRequest): Promise<string> {
    request.check();
    const value = await request.wait(Promise.resolve(this.#getKey("fal")));
    request.check();
    if (typeof value !== "string" || !value.trim())
      throw new ThreeDClient.Failure("provider_key_required");
    return value.trim();
  }

  async #generate(
    id: ThreeDClient.ModelId,
    input: ThreeDClient.Input<ThreeDClient.ModelId>
  ): Promise<ThreeDClient.Result<ThreeDClient.ModelId>> {
    let request: MediaRequest | undefined;
    try {
      // Capture and copy caller-owned bytes before the first await.
      const normalized = generationInput(id, input);
      request = new MediaRequest(this.#http, normalized.signal, 600_000);
      const key = await this.#key(request);
      const headers = {
        authorization: `Key ${key}`,
        "content-type": "application/json",
      };
      const body = falInput(id, normalized);
      request.check();
      const submit = await readJson(request, `${QUEUE_ORIGIN}/${id}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!isRecord(submit)) invalid();
      const statusUrl = queueUrl(submit.status_url);
      const responseUrl = queueUrl(submit.response_url);
      for (;;) {
        const status = await readJson(request, statusUrl, {
          method: "GET",
          headers,
        });
        if (!isRecord(status) || typeof status.status !== "string") invalid();
        if (status.error != null || status.error_type != null)
          throw new ThreeDClient.Failure("generation_failed");
        if (status.status === "COMPLETED") break;
        if (status.status !== "IN_QUEUE" && status.status !== "IN_PROGRESS")
          throw new ThreeDClient.Failure("generation_failed");
        await request.wait(delay(2_000, request.signal));
      }
      const result = await readJson(request, responseUrl, {
        method: "GET",
        headers,
      });
      const file = primaryGlb(result);
      const url = assetUrl(file.url);
      if (
        file.file_size !== undefined &&
        (!Number.isSafeInteger(file.file_size) ||
          (file.file_size as number) < 0 ||
          (file.file_size as number) > MAX_GLB_BYTES)
      )
        invalid();
      const downloaded = await request.download(url, MAX_GLB_BYTES);
      request.check();
      const data = downloaded.data;
      assertGlb2(data);
      request.check();
      return output(id, data);
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

export namespace ThreeDClient {
  export type ModelId = keyof Operations;
  export type Keys = {
    get(provider: "fal"): string | null | Promise<string | null>;
  };
  export type Options = { keys: Keys; http: ProviderHttp };
  export type Image = {
    data: Uint8Array;
    media_type: "image/png" | "image/jpeg" | "image/webp";
  };
  export type Glb = { data: Uint8Array; media_type: "model/gltf-binary" };
  /** Endpoint contracts, not a universal shape for future 3D operations. */
  export type Operations = {
    "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d": {
      input: { prompt: string; signal?: AbortSignal };
      result: { glb: Glb };
    };
    "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d": {
      input: { image: Image; signal?: AbortSignal };
      result: { glb: Glb };
    };
    "fal-ai/trellis-2": {
      input: { image: Image; signal?: AbortSignal };
      result: { glb: Glb };
    };
  };
  export type Input<M extends ModelId> = Operations[M]["input"];
  export type Result<M extends ModelId> = Operations[M]["result"];
  export type Selection<M extends ModelId = ModelId> = {
    model_id: M;
    provider: "fal";
  };
  export type Resolved<M extends ModelId = ModelId> = {
    [K in M]: Readonly<{
      model_id: K;
      binding_id: K;
      provider_id: "fal";
      generate: (input: Input<K>) => Promise<Result<K>>;
    }>;
  }[M];
  export type FailureCode =
    | "invalid_input"
    | "model_unavailable"
    | "provider_key_required"
    | "aborted"
    | "timeout"
    | "invalid_response"
    | "generation_failed";
  export class Failure extends Error {
    readonly code: FailureCode;
    constructor(code: FailureCode) {
      super(failureCode(code));
      this.name = "ThreeDFailure";
      this.code = failureCode(code);
    }
    toJSON(): { code: FailureCode; message: string } {
      return { code: this.code, message: this.code };
    }
  }
}

function selection(value: {
  model_id: string;
  provider: "fal";
}): ThreeDClient.ModelId {
  let id: string;
  try {
    exactKeys(value, ["model_id", "provider"]);
    const { model_id, provider } = value;
    if (
      typeof model_id !== "string" ||
      !model_id ||
      model_id.length > 256 ||
      provider !== "fal"
    )
      throw 0;
    id = model_id;
  } catch {
    throw new ThreeDClient.Failure("invalid_input");
  }
  if (id !== TEXT_ID && id !== IMAGE_ID && id !== TRELLIS_ID)
    throw new ThreeDClient.Failure("model_unavailable");
  return id;
}

function generationInput(
  id: ThreeDClient.ModelId,
  value: ThreeDClient.Input<ThreeDClient.ModelId>
): { prompt?: string; image?: ThreeDClient.Image; signal?: AbortSignal } {
  try {
    const kind = inputKind(id);
    exactKeys(
      value,
      kind === "text" ? ["prompt", "signal"] : ["image", "signal"]
    );
    const signal = value.signal;
    if (signal !== undefined && !(signal instanceof AbortSignal)) throw 0;
    if (kind === "text") {
      const raw = (value as ThreeDClient.Input<typeof TEXT_ID>).prompt;
      if (typeof raw !== "string") throw 0;
      const prompt = raw.trim();
      if (
        !prompt ||
        !withinCodepoints(
          prompt,
          models.three_d.models[TEXT_ID].input.max_utf8_characters
        )
      )
        throw 0;
      return { prompt, signal };
    }
    const image = (value as ThreeDClient.Input<typeof IMAGE_ID>).image;
    exactKeys(image, ["data", "media_type"]);
    const { data, media_type } = image;
    if (
      !(data instanceof Uint8Array) ||
      !data.byteLength ||
      data.byteLength > MAX_IMAGE_BYTES ||
      !["image/png", "image/jpeg", "image/webp"].includes(media_type)
    )
      throw 0;
    return { image: { data: new Uint8Array(data), media_type }, signal };
  } catch {
    throw new ThreeDClient.Failure("invalid_input");
  }
}

// These switches deliberately enumerate each executable endpoint. Extending the
// public operation map must also choose its input, wire and output semantics.
function inputKind(id: ThreeDClient.ModelId): "text" | "image" {
  switch (id) {
    case TEXT_ID:
      return "text";
    case IMAGE_ID:
      return "image";
    case TRELLIS_ID:
      return "image";
    default:
      return assertNever(id);
  }
}
function falInput(
  id: ThreeDClient.ModelId,
  input: ReturnType<typeof generationInput>
): Record<string, string> {
  switch (id) {
    case TEXT_ID:
      return { prompt: input.prompt! };
    case IMAGE_ID:
      return { input_image_url: imageDataUrl(input.image!) };
    case TRELLIS_ID:
      return { image_url: imageDataUrl(input.image!) };
    default:
      return assertNever(id);
  }
}
function output(
  id: ThreeDClient.ModelId,
  data: Uint8Array
): ThreeDClient.Result<ThreeDClient.ModelId> {
  switch (id) {
    case TEXT_ID:
    case IMAGE_ID:
    case TRELLIS_ID:
      return { glb: { data, media_type: "model/gltf-binary" } };
    default:
      return assertNever(id);
  }
}
function assertNever(_id: never): never {
  throw new ThreeDClient.Failure("model_unavailable");
}

async function readJson(
  request: MediaRequest,
  url: string,
  init: RequestInit
): Promise<unknown> {
  const response = await request.request(url, init);
  if (!response.ok) throw new ThreeDClient.Failure("generation_failed");
  const text = await request.wait(response.text());
  try {
    return JSON.parse(text) as unknown;
  } catch {
    invalid();
  }
}

function queueUrl(value: unknown): string {
  const url = httpsUrl(value);
  if (url.origin !== QUEUE_ORIGIN) invalid();
  return url.toString();
}
function assetUrl(value: unknown): URL {
  const url = httpsUrl(value);
  if (
    !["fal.run", "fal.media"].some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`)
    )
  )
    invalid();
  return url;
}
function httpsUrl(value: unknown): URL {
  try {
    if (typeof value !== "string") throw 0;
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    )
      throw 0;
    return url;
  } catch {
    invalid();
  }
}
function primaryGlb(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) invalid();
  const file =
    value.model_glb ??
    (isRecord(value.model_urls) ? value.model_urls.glb : undefined);
  if (!isRecord(file)) invalid();
  return file;
}
function assertGlb2(data: Uint8Array): void {
  if (data.byteLength < 12 || data.byteLength > MAX_GLB_BYTES) invalid();
  const header = new DataView(data.buffer, data.byteOffset, 12);
  if (
    header.getUint32(0, true) !== 0x46546c67 ||
    header.getUint32(4, true) !== 2 ||
    header.getUint32(8, true) !== data.byteLength
  )
    invalid();
}
function imageDataUrl(image: ThreeDClient.Image): string {
  let binary = "";
  for (let offset = 0; offset < image.data.length; offset += 8192)
    binary += String.fromCharCode(
      ...image.data.subarray(offset, offset + 8192)
    );
  return `data:${image.media_type};base64,${btoa(binary)}`;
}
function withinCodepoints(value: string, maximum: number): boolean {
  let count = 0;
  for (const _character of value) if (++count > maximum) return false;
  return true;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value: unknown, allowed: readonly string[]): void {
  if (
    !isRecord(value) ||
    Reflect.ownKeys(value).some(
      (key) => typeof key !== "string" || !allowed.includes(key)
    )
  )
    throw 0;
}
function invalid(): never {
  throw new ThreeDClient.Failure("invalid_response");
}
function safeFailure(error: unknown): ThreeDClient.Failure {
  try {
    if (
      error instanceof ThreeDClient.Failure ||
      error instanceof MediaRequest.Failure
    )
      return new ThreeDClient.Failure(error.code);
  } catch {
    /* Unknown host errors can have throwing accessors. */
  }
  return new ThreeDClient.Failure("generation_failed");
}
function failureCode(value: unknown): ThreeDClient.FailureCode {
  return typeof value === "string" &&
    [
      "invalid_input",
      "model_unavailable",
      "provider_key_required",
      "aborted",
      "timeout",
      "invalid_response",
      "generation_failed",
    ].includes(value)
    ? (value as ThreeDClient.FailureCode)
    : "generation_failed";
}
