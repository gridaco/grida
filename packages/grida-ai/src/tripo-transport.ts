// GRIDA-SEC-006 / GRIDA-GG: provider — safe scoped-authority errors and observed task receipts.
// GRIDA-SEC-004 — internal fixed-origin Tripo transport, bounded multipart and portable GLB validation.
import { MediaRequest } from "./media-request";
import { MediaInputs } from "./media-inputs";
import { GridaGatewayAuthError, GridaGatewayCreditsError } from "./gg";

/** Shared only by the named Tripo operations; no arbitrary public endpoint surface. */
export namespace TripoTransport {
  export type Task = Readonly<{ id: string; credits_consumed?: number }>;
  export function task(id: string, credits: unknown): Task {
    identifier(id);
    if (
      credits !== undefined &&
      (typeof credits !== "number" || !Number.isFinite(credits) || credits < 0)
    )
      invalid();
    return Object.freeze({
      id,
      ...(credits === undefined ? {} : { credits_consumed: credits as number }),
    });
  }
  export function completedTask(
    value: Task | undefined,
    id: string | undefined
  ): Task | undefined {
    try {
      return value && value.id === id
        ? task(value.id, value.credits_consumed)
        : undefined;
    } catch {
      return undefined;
    }
  }
  const API = "https://openapi.tripo3d.ai/v3";
  export type FailureCode =
    | "invalid_input"
    | "model_unavailable"
    | "provider_key_required"
    | "credential_rejected"
    | "access_denied"
    | "insufficient_credits"
    | "gg_token_expired"
    | "aborted"
    | "timeout"
    | "invalid_response"
    | "generation_failed";
  export const codes: readonly FailureCode[] = [
    "invalid_input",
    "model_unavailable",
    "provider_key_required",
    "credential_rejected",
    "access_denied",
    "insufficient_credits",
    "gg_token_expired",
    "aborted",
    "timeout",
    "invalid_response",
    "generation_failed",
  ];
  export class Failure extends Error {
    constructor(
      readonly code: FailureCode,
      readonly task_id?: string,
      readonly completed_task?: Task
    ) {
      super(code);
    }
  }
  export function failureCode(
    error: unknown,
    request?: MediaRequest
  ): FailureCode {
    try {
      request?.check();
    } catch (abort) {
      error = abort;
    }
    try {
      if (error instanceof Failure || error instanceof MediaRequest.Failure)
        return error.code;
      if (error instanceof GridaGatewayAuthError) return "gg_token_expired";
      if (error instanceof GridaGatewayCreditsError)
        return "insufficient_credits";
    } catch {
      /* Host errors can have throwing prototype accessors. */
    }
    return "generation_failed";
  }
  export function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  export function invalid(): never {
    throw new Failure("invalid_response");
  }
  export function validIdentifier(
    value: string,
    prefix: "task" | "file" = "task"
  ) {
    return (
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        value
      ) || new RegExp(`^${prefix}_[A-Za-z0-9_-]{1,100}$`).test(value)
    );
  }
  export function identifier(
    value: unknown,
    prefix: "task" | "file" = "task"
  ): string {
    if (typeof value !== "string" || !validIdentifier(value, prefix)) invalid();
    return value;
  }
  export async function json(
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
    if (response.status === 401) throw new Failure("credential_rejected");
    let payload: unknown;
    try {
      payload = JSON.parse(await request.wait(response.text()));
    } catch (error) {
      if (response.status === 403) throw new Failure("access_denied");
      if (error instanceof MediaRequest.Failure) throw error;
      invalid();
    }
    if (response.status === 403 && (!record(payload) || payload.code !== 2010))
      throw new Failure("access_denied");
    if (!record(payload) || !Number.isInteger(payload.code)) invalid();
    if (payload.code === 1000 || payload.code === 1001)
      throw new Failure("credential_rejected");
    if (payload.code === 2010) throw new Failure("insufficient_credits");
    if (response.status === 403) throw new Failure("access_denied");
    if (!response.ok || payload.code !== 0)
      throw new Failure("generation_failed");
    if (!record(payload.data)) invalid();
    return payload.data;
  }
  export async function upload(
    request: MediaRequest,
    key: string,
    image: {
      data: Uint8Array;
      media_type: "image/png" | "image/jpeg" | "model/gltf-binary";
    }
  ) {
    // A browser-compatible bounded multipart body; no FormData/stream escape hatch is required from hosts.
    const boundary = `grida-tripo-${crypto.randomUUID()}`;
    const extension =
      image.media_type === "model/gltf-binary"
        ? "glb"
        : image.media_type === "image/png"
          ? "png"
          : "jpg";
    const filename = extension === "glb" ? "mesh.glb" : `image.${extension}`;
    const encoder = new TextEncoder();
    const start = encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${image.media_type}\r\n\r\n`
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
  export function assetUrl(value: unknown): URL {
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
  export function validateGlb(data: Uint8Array) {
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
}
