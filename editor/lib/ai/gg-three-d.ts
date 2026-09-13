// GRIDA-GG: gateway — organization-funded Tripo features through the AI billing seam.
// GRIDA-SEC-003 / GRIDA-SEC-006 — the API supplies verified org and authenticated upload refs.
import "server-only";
import { RiggingClient, TripoClient } from "@grida/ai";
import { ProviderCredentials } from "@grida/ai/providers";
import { catalog } from "@grida/ai-models/grida";
import { checkGate, withTransaction, type GridaCallContext } from "./server";
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
    await checkGate(context(organizationId, "uploads", "tripo/upload"));
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
    if (!catalog.three_d.model_generation.is_model_id(model_id))
      throw new Failure("model_unavailable");
    return meter(
      context(organizationId, "model-generation", model_id),
      catalog.three_d.model_generation.models[model_id].pricing.usd_per_credit,
      async (key) => {
        const operation = await new TripoClient({
          keys: { get: () => key },
          http: GgThreeDHttp.create(key),
        }).resolve({
          feature: "model-generation",
          provider: "tripo",
          model_id,
          variant,
        });
        // The SDK owns runtime validation of every uploaded input and model-specific control.
        return operation.generateUploaded(input as never);
      }
    );
  }

  export async function check(
    organizationId: number,
    input: unknown
  ): Promise<RiggingClient.CheckResult> {
    return meter(
      context(organizationId, "rig-check", "tripo/rig-check"),
      catalog.three_d.rig_check.operation.pricing.usd_per_credit,
      async (key) => {
        const operation = await new RiggingClient({
          keys: { get: () => key },
          http: GgThreeDHttp.create(key),
        }).resolve({ feature: "rig-check", provider: "tripo" });
        return operation.checkUploaded(input as never);
      }
    );
  }

  export async function rig(
    organizationId: number,
    model_id: string,
    input: unknown
  ): Promise<RiggingClient.Result> {
    if (!catalog.three_d.rigging.is_model_id(model_id))
      throw new Failure("model_unavailable");
    return meter(
      context(organizationId, "rigging", model_id),
      catalog.three_d.rigging.models[model_id].pricing.usd_per_credit,
      async (key) => {
        const operation = await new RiggingClient({
          keys: { get: () => key },
          http: GgThreeDHttp.create(key),
        }).resolve({ feature: "rigging", provider: "tripo", model_id });
        return operation.generateUploaded(input as never);
      }
    );
  }

  type Task = { id: string; credits_consumed?: number };
  type Outcome<T> = { ok: true; value: T } | { ok: false; error: Failure };
  function context(
    organizationId: number,
    feature: string,
    model_id: string
  ): GridaCallContext {
    return {
      organizationId,
      feature: `v1/ai/3d/${feature}`,
      model_id,
      awaitIngest: true,
    };
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
  async function meter<T extends { task: Task }>(
    ctx: GridaCallContext,
    usdPerCredit: number,
    operation: (key: string) => Promise<T>
  ): Promise<T> {
    const outcome = await withTransaction<Outcome<T>>(
      ctx,
      async (transactionId) => {
        const key = gatewayKey();
        try {
          const result = await operation(key);
          return {
            result: { ok: true, value: result },
            costMills: cost(ctx, transactionId, result.task, usdPerCredit),
          };
        } catch (error) {
          if (error instanceof Failure) throw error;
          if (
            error instanceof TripoClient.Failure ||
            error instanceof RiggingClient.Failure
          ) {
            const failure = mapFailure(error);
            if (error.completed_task) {
              // A paid success remains billable if its later download, validation, or cancellation fails.
              // Return an outcome so the canonical seam ingests before we surface the safe failure.
              return {
                result: { ok: false, error: failure },
                costMills: cost(
                  ctx,
                  transactionId,
                  error.completed_task,
                  usdPerCredit
                ),
              };
            }
            if (error.task_id) reconcile(ctx, transactionId, error.task_id);
            throw failure;
          }
          throw new Failure("generation_failed");
        }
      }
    );
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }
  function cost(
    ctx: GridaCallContext,
    transactionId: string,
    task: Task,
    usdPerCredit: number
  ) {
    const consumed = task.credits_consumed;
    // Convert the catalog's integral per-credit rate first, avoiding a spurious
    // extra mill from e.g. 20.5 * $0.01 * 1000 = 205.00000000000003.
    const unitMills = usdPerCredit * 1000;
    const mills =
      typeof consumed === "number" ? Math.ceil(consumed * unitMills) : NaN;
    if (
      typeof consumed !== "number" ||
      !Number.isFinite(consumed) ||
      consumed < 0 ||
      !Number.isSafeInteger(unitMills) ||
      unitMills <= 0 ||
      !Number.isSafeInteger(mills) ||
      mills < 0
    ) {
      reconcile(ctx, transactionId, task.id);
      throw new Failure(
        "usage_unavailable",
        validId(task.id) ? task.id : undefined
      );
    }
    return mills;
  }
  function reconcile(
    ctx: GridaCallContext,
    transactionId: string,
    taskId: string
  ) {
    // Identifiers only: no prompts, upload refs, signed URLs, keys, provider payloads, or raw errors.
    console.error("[gg-three-d] usage_reconciliation_required", {
      organizationId: ctx.organizationId,
      model_id: ctx.model_id,
      feature: ctx.feature,
      transactionId,
      ...(validId(taskId) ? { task_id: taskId } : {}),
    });
  }
  function mapFailure(error: TripoClient.Failure | RiggingClient.Failure) {
    const code = error.code;
    const mapped =
      code === "invalid_input"
        ? "invalid_request"
        : [
              "provider_key_required",
              "credential_rejected",
              "access_denied",
              "insufficient_credits",
            ].includes(code)
          ? "provider_unavailable"
          : code;
    return new Failure(mapped as FailureCode, error.task_id);
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
