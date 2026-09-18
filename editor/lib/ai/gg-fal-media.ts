// GRIDA-EE: billing — organization-funded media and actual provider charges.
// GRIDA-GG: gateway — hosted fal image/video execution and actual-charge metering.
// GRIDA-SEC-003 / GRIDA-SEC-006 — verified organization, fixed provider authority, safe failures.
import "server-only";
import {
  ImageClient,
  VideoClient,
  MediaOperations,
  type ProviderHttp,
} from "@grida/ai";
import { ProviderCredentials } from "@grida/ai/providers";
import { catalog } from "@grida/ai-models/grida";
import { withTransaction, type GridaCallContext } from "./server";
import { GgFalHttp } from "./gg-fal-http";
import { GgFalBilling } from "./gg-fal-billing";

export namespace GgFalMedia {
  /** Pure pre-submit admission uses the very same rules as the provider adapter. */
  export function accepts(
    kind: "image" | "video",
    model_id: string,
    input: ImageClient.Input | VideoClient.Input,
    provider: "fal" | "vercel" = "fal"
  ): boolean {
    try {
      new MediaOperations().parseInput(
        { kind, model_id, provider, variant: "text" },
        Object.fromEntries(
          Object.entries(input).filter(([, value]) => value !== undefined)
        )
      );
      return true;
    } catch (error) {
      if (error instanceof MediaOperations.Failure) return false;
      throw error;
    }
  }
  /** Compatibility is about controls, never an excuse to move an invalid prompt/count/duration. */
  export function vercelException(
    kind: "image" | "video",
    model_id: string,
    input: ImageClient.Input | VideoClient.Input
  ): boolean {
    const controls = kind === "image" ? ["seed"] : ["seed", "fps"];
    const aspectBounds =
      kind === "image"
        ? catalog.image.findImageModelCard(model_id)?.constraints?.aspect_ratio
        : undefined;
    if (kind === "image" && aspectBounds?.max !== undefined)
      controls.push("aspect_ratio");
    // These legacy Vercel routes accept bounded exact dimensions; fal exposes
    // only resolution tiers. Other models must keep size validation on fal.
    if (
      kind === "image" &&
      [
        "google/gemini-3.1-flash-image-preview",
        "google/gemini-3-pro-image",
        "xai/grok-imagine-image-2.0",
      ].includes(model_id)
    ) {
      const size = (input as ImageClient.Input).size;
      const maxEdge =
        catalog.image.findImageModelCard(model_id)?.constraints?.max_edge;
      if (size && maxEdge) {
        const dimensions = size.split("x").map(Number);
        if (
          dimensions.length !== 2 ||
          !dimensions.every(
            (value) =>
              Number.isSafeInteger(value) && value > 0 && value <= maxEdge
          )
        )
          return false;
        controls.push("size");
      }
    }
    const basic = Object.fromEntries(
      Object.entries(input).filter(([field]) => !controls.includes(field))
    ) as ImageClient.Input | VideoClient.Input;
    return (
      accepts(kind, model_id, basic) && accepts(kind, model_id, input, "vercel")
    );
  }
  const statuses = {
    invalid_request: 400,
    model_unavailable: 400,
    provider_unavailable: 503,
    usage_unavailable: 502,
    generation_failed: 502,
    invalid_response: 502,
    aborted: 499,
    timeout: 504,
  } as const;
  export class Failure extends Error {
    readonly status: number;
    constructor(
      readonly code: keyof typeof statuses,
      readonly task_id?: string
    ) {
      super(code);
      this.name = "GgFalMediaFailure";
      this.status = statuses[code];
    }
  }

  export function image(
    organizationId: number,
    model_id: string,
    endpoint: string,
    input: ImageClient.Input
  ): Promise<ImageClient.Result> {
    return meter(
      { organizationId, model_id, feature: "v1/ai/image", awaitIngest: true },
      endpoint,
      async (key, http, completed) => {
        const operation = await new ImageClient({
          keys: { get: () => key },
          http,
          on_fal_completed: completed,
        }).resolve({ model_id, provider: "fal", background: input.background });
        if (operation.binding_id !== endpoint)
          throw new Failure("model_unavailable");
        return operation.generate({
          ...input,
          signal: AbortSignal.timeout(240_000),
        });
      }
    );
  }

  export function video(
    organizationId: number,
    model_id: string,
    endpoint: string,
    input: VideoClient.Input
  ): Promise<VideoClient.Result> {
    return meter(
      { organizationId, model_id, feature: "v1/ai/video", awaitIngest: true },
      endpoint,
      async (key, http, completed) => {
        const operation = await new VideoClient({
          keys: { get: () => key },
          http,
          on_fal_completed: completed,
        }).resolve({ model_id, provider: "fal", image: false });
        if (operation.binding_id !== endpoint)
          throw new Failure("model_unavailable");
        return operation.generate({
          ...input,
          // Leave receipt/ledger headroom inside the native client's 300s request budget.
          signal: AbortSignal.timeout(240_000),
        });
      }
    );
  }

  type Outcome<T> = { ok: true; value: T } | { ok: false; error: Failure };
  async function meter<T>(
    ctx: GridaCallContext,
    endpoint: string,
    operation: (
      key: string,
      http: ProviderHttp,
      completed: (receipt: ImageClient.FalCompletion) => void
    ) => Promise<T>
  ): Promise<T> {
    const outcome = await withTransaction<Outcome<T>>(
      ctx,
      async (transactionId) => {
        let key: string, admin: string;
        try {
          key = ProviderCredentials.normalize("fal", process.env.GG_FAL_KEY);
          admin = ProviderCredentials.normalize(
            "fal",
            process.env.GG_FAL_ADMIN_KEY
          );
        } catch {
          throw new Failure("provider_unavailable");
        }
        const http = GgFalHttp.create(key, admin, endpoint);
        try {
          await GgFalBilling.preflight(http, admin, endpoint);
        } catch {
          throw new Failure("provider_unavailable");
        }
        const receipts = new Map<string, boolean>();
        let result: Outcome<T>;
        try {
          const value = await operation(key, http, (receipt) => {
            if (
              receipt.binding_id !== endpoint ||
              receipt.provider_id !== "fal" ||
              receipts.has(receipt.request_id) ||
              receipts.size >= 4
            )
              throw new Failure("invalid_response");
            receipts.set(receipt.request_id, true);
          });
          result = { ok: true, value };
        } catch (error) {
          const failure = safeFailure(error);
          if (failure.task_id && !receipts.has(failure.task_id))
            receipts.set(failure.task_id, false);
          result = { ok: false, error: failure };
        }
        if (!receipts.size) {
          if (!result.ok) throw result.error;
          reconcile(ctx, transactionId);
          throw new Failure("usage_unavailable");
        }
        let nanos = 0,
          known = 0;
        const charges = await Promise.allSettled(
          [...receipts.keys()].map((requestId) =>
            GgFalBilling.charge(http, admin, endpoint, requestId)
          )
        );
        for (const [index, [requestId, completed]] of [
          ...receipts.entries(),
        ].entries()) {
          const charge = charges[index]!;
          if (charge.status === "fulfilled") {
            nanos += charge.value;
            known++;
          } else {
            reconcile(ctx, transactionId, requestId);
            if (completed)
              result = {
                ok: false,
                error: new Failure("usage_unavailable", requestId),
              };
          }
        }
        if (!known || !Number.isSafeInteger(nanos)) {
          if (!result.ok) throw result.error;
          throw new Failure("usage_unavailable");
        }
        // Completed paid work is ingested even when a later download/batch fails.
        return { result, costMills: Math.ceil(nanos / 1e6) };
      }
    );
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }

  function safeFailure(error: unknown): Failure {
    if (error instanceof Failure) return error;
    if (
      error instanceof ImageClient.Failure ||
      error instanceof VideoClient.Failure
    ) {
      const code = error.code;
      return new Failure(
        [
          "invalid_input",
          "input_unsupported",
          "references_unsupported",
        ].includes(code)
          ? "invalid_request"
          : [
                "model_unavailable",
                "provider_unavailable",
                "invalid_response",
                "aborted",
                "timeout",
              ].includes(code)
            ? (code as keyof typeof statuses)
            : "generation_failed",
        error.task_id
      );
    }
    return new Failure("generation_failed");
  }
  function reconcile(
    ctx: GridaCallContext,
    transactionId: string,
    task_id?: string
  ) {
    console.error("[gg-fal-media] usage_reconciliation_required", {
      organizationId: ctx.organizationId,
      model_id: ctx.model_id,
      feature: ctx.feature,
      transactionId,
      ...(task_id ? { task_id } : {}),
    });
  }
}
