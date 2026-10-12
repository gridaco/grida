// GRIDA-GG: gateway — organization-funded Tripo features through the AI billing seam.
// GRIDA-SEC-003 / GRIDA-SEC-006 — the API supplies verified org and authenticated upload refs.
import "server-only";
import type { RiggingClient, TripoClient } from "@grida/ai";
import { ProviderCredentials } from "@grida/ai/providers";
import { catalog } from "@grida/ai-models/grida";
import { checkGate } from "./server";
import { randomUUID } from "node:crypto";
import {
  gatewayFetch,
  gatewayWait,
  GatewayProductError,
} from "./gateway-product";
import { GgThreeDHttp } from "./gg-three-d-http";

/** Server execution only. It never resolves an organization or accepts request URLs/keys. */
export namespace GgThreeD {
  export type MediaType = "image/png" | "image/jpeg" | "model/gltf-binary";
  export type PresignedUpload = {
    upload_url: string;
    file_token: string;
    expires_in: number;
  };
  const status = {
    invalid_request: 400,
    model_unavailable: 400,
    provider_unavailable: 503,
    usage_unavailable: 502,
    invalid_response: 502,
    generation_failed: 502,
    aborted: 499,
    timeout: 504,
  } as const;
  export type FailureCode = keyof typeof status;
  export class Failure extends Error {
    readonly status: number;
    constructor(
      readonly code: FailureCode,
      readonly task_id?: string
    ) {
      super(code);
      this.name = "GgThreeDFailure";
      this.status = status[code];
    }
    toJSON() {
      return {
        code: this.code,
        message: this.code,
        ...(this.task_id ? { task_id: this.task_id } : {}),
      };
    }
  }

  /** Gate before even the free upload preparation; root signs the returned ref for this caller. */
  export async function preparePresign(
    organizationId: number,
    media_type: MediaType
  ): Promise<PresignedUpload> {
    const format =
      media_type === "model/gltf-binary"
        ? "glb"
        : media_type === "image/png"
          ? "png"
          : media_type === "image/jpeg"
            ? "jpeg"
            : null;
    if (!format) throw new Failure("invalid_request");
    await checkGate({
      organizationId,
      feature: "v1/ai/3d/uploads",
      model_id: "tripo/upload",
    });
    const key = gatewayKey();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await GgThreeDHttp.create(key).request(
        "https://openapi.tripo3d.ai/v3/files/presign",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${key}`,
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify({ format }),
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        }
      );
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        throw new Failure("provider_unavailable");
      }
      const payload: unknown = JSON.parse(
        await boundedText(response, controller.signal)
      );
      if (!record(payload) || payload.code !== 0 || !record(payload.data))
        throw new Failure("invalid_response");
      const { presigned_url, file_token, expires_in } = payload.data;
      if (
        typeof presigned_url !== "string" ||
        presigned_url.length > 16_384 ||
        typeof file_token !== "string" ||
        !validId(file_token, "file") ||
        file_token.includes(key) ||
        presigned_url.includes(key) ||
        !Number.isSafeInteger(expires_in) ||
        (expires_in as number) <= 0 ||
        (expires_in as number) > 3600
      )
        throw new Failure("invalid_response");
      const url = new URL(presigned_url);
      if (
        url.protocol !== "https:" ||
        url.href !== presigned_url ||
        url.hostname !== "tripo-data.s3.us-west-2.amazonaws.com" ||
        url.port ||
        url.username ||
        url.password ||
        url.hash
      )
        throw new Failure("invalid_response");
      return {
        upload_url: presigned_url,
        file_token,
        expires_in: expires_in as number,
      };
    } catch (error) {
      if (error instanceof Failure) throw error;
      throw new Failure(
        controller.signal.aborted
          ? "timeout"
          : error instanceof SyntaxError || error instanceof TypeError
            ? "invalid_response"
            : "provider_unavailable"
      );
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  export async function modelGenerate(
    organizationId: number,
    model_id: string,
    variant: TripoClient.Variant,
    input: unknown
  ): Promise<TripoClient.Result> {
    if (
      !catalog.three_d.model_generation.is_model_id(model_id) ||
      !["text", "image", "multiview"].includes(variant)
    )
      throw new Failure("model_unavailable");
    return resultMesh(
      organizationId,
      `three-d.${model_id.replace("/", ".")}.${variant}`,
      input
    );
  }
  export async function check(
    organizationId: number,
    input: unknown
  ): Promise<RiggingClient.CheckResult> {
    const job = await execute(organizationId, "three-d.tripo.rig-check", input);
    if (
      typeof job.result?.riggable !== "boolean" ||
      typeof job.result?.rig_type !== "string"
    )
      throw new Failure("invalid_response", job.id);
    return {
      riggable: job.result.riggable,
      rig_type: job.result.rig_type as RiggingClient.RigType,
      task: { id: taskIdentity(job.id) },
    };
  }
  export async function rig(
    organizationId: number,
    model_id: string,
    input: unknown
  ): Promise<RiggingClient.Result> {
    if (!catalog.three_d.rigging.is_model_id(model_id))
      throw new Failure("model_unavailable");
    return resultMesh(
      organizationId,
      `three-d.${model_id.replace("/", ".")}.mesh`,
      input
    );
  }
  // Upload tickets are already verified by the HTTP boundary. Convert only
  // those provider references; GG's public API still requires HTTPS assets.
  function references(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(references);
    if (record(value)) {
      if ("file_token" in value) {
        if (
          typeof value.file_token !== "string" ||
          !validId(value.file_token, "file") ||
          !["image/png", "image/jpeg", "model/gltf-binary"].includes(
            String(value.media_type)
          ) ||
          Object.keys(value).some(
            (k) => !["file_token", "media_type"].includes(k)
          )
        )
          throw new Failure("invalid_request");
        return {
          url: `https://grida-upload.invalid/${value.file_token}`,
          media_type: value.media_type,
        };
      }
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => key !== "signal")
          .map(([key, v]) => [key, references(v)])
      );
    }
    return value;
  }
  function taskIdentity(id: string) {
    return `task_${id.replace(/^req_/, "")}`;
  }
  async function execute(
    organizationId: number,
    endpoint: string,
    input: unknown
  ) {
    const ctx = {
      organizationId,
      feature: `v1/ai/3d/${endpoint.includes("rig") ? "rigging" : "model-generation"}`,
    };
    try {
      const response = await gatewayFetch(
        ctx,
        `/v1/endpoints/${endpoint}`,
        { method: "POST", body: JSON.stringify(references(input)) },
        randomUUID()
      );
      const submitted = await response.json();
      if (
        typeof submitted.id !== "string" ||
        !/^req_[A-Za-z0-9_-]+$/.test(submitted.id)
      )
        throw new Failure("invalid_response");
      return await gatewayWait(
        ctx,
        submitted.id,
        record(input) && input.signal instanceof AbortSignal
          ? input.signal
          : undefined
      );
    } catch (error) {
      if (error instanceof Failure) throw error;
      if (error instanceof GatewayProductError)
        throw new Failure(
          error.status === 400
            ? "invalid_request"
            : error.status === 504
              ? "timeout"
              : error.status === 499
                ? "aborted"
                : "generation_failed",
          error.requestId
        );
      throw error;
    }
  }
  async function resultMesh(
    organizationId: number,
    endpoint: string,
    input: unknown
  ): Promise<TripoClient.Result> {
    const job = await execute(organizationId, endpoint, input);
    const reference = job.result?.glb;
    if (!record(reference) || typeof reference.url !== "string")
      throw new Failure("invalid_response", job.id);
    try {
      const mesh = await GgThreeDHttp.productAssets().downloadProviderAsset(
        new URL(reference.url),
        { max_bytes: 60_000_000 }
      );
      const view = new DataView(
        mesh.data.buffer,
        mesh.data.byteOffset,
        mesh.data.byteLength
      );
      if (
        mesh.data.length < 20 ||
        view.getUint32(0, true) !== 0x46546c67 ||
        view.getUint32(4, true) !== 2 ||
        view.getUint32(8, true) !== mesh.data.length
      )
        throw new Error("invalid_mesh");
      return {
        glb: { data: mesh.data, media_type: "model/gltf-binary" },
        task: { id: taskIdentity(job.id) },
      };
    } catch {
      throw new Failure("invalid_response", job.id);
    }
  }
  function gatewayKey() {
    try {
      // Only GG authority is admitted; unprefixed and BYOK keys cannot fund this path.
      return ProviderCredentials.normalize(
        "tripo",
        process.env.GG_TRIPO_API_KEY
      );
    } catch {
      throw new Failure("provider_unavailable");
    }
  }
  function validId(value: string, prefix = "task") {
    return (
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        value
      ) || new RegExp(`^${prefix}_[A-Za-z0-9_-]{1,100}$`).test(value)
    );
  }
  function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  async function boundedText(response: Response, signal: AbortSignal) {
    if (
      !response.body ||
      Number(response.headers.get("content-length")) > 64 * 1024
    ) {
      void response.body?.cancel().catch(() => undefined);
      throw new Failure("invalid_response");
    }
    const reader = response.body.getReader();
    const cancel = () => {
      void reader.cancel().catch(() => undefined);
    };
    signal.addEventListener("abort", cancel, { once: true });
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let text = "",
      size = 0;
    try {
      for (;;) {
        signal.throwIfAborted();
        const { value, done } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        size += value.byteLength;
        if (size > 64 * 1024) throw new Failure("invalid_response");
        text += decoder.decode(value, { stream: true });
      }
      return text + decoder.decode();
    } finally {
      signal.removeEventListener("abort", cancel);
      cancel();
      reader.releaseLock();
    }
  }
}
