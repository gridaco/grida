// GRIDA-SEC-004 / GRIDA-SEC-006 — public contracts, scoped Grida execution and original jobs.
import { GGDiscoveryStore, type GGOperation } from "./gg-discovery";
import {
  postHosted,
  readGgToken,
  gridaGatewayOrigin,
  throwOnGgHttpError,
} from "./gg";
import type { GgTokenSource } from "./gg-session";
import { ProviderHttp } from "./http";
import { MediaRequest } from "./media-request";

/** Thin native consumer of the current JSON media interfaces; no model-ID registry. */
export class GGOperationsClient {
  readonly discovery: GGDiscoveryStore;
  readonly #origin: string;
  readonly #http: ProviderHttp;
  readonly #gg: GgTokenSource;
  constructor(options: {
    http: ProviderHttp;
    gg: GgTokenSource;
    gg_base_url: string;
    gg_catalog?: GGDiscoveryStore;
  }) {
    this.#origin = gridaGatewayOrigin(options.gg_base_url);
    this.#http = options.http;
    this.#gg = { getAccessToken: options.gg.getAccessToken.bind(options.gg) };
    this.discovery =
      options.gg_catalog ??
      new GGDiscoveryStore({ fetch: options.http.request });
  }
  async resolve(operationId: string): Promise<GGOperation> {
    const snapshot = await this.discovery.ready();
    const operation = snapshot?.operations.find(
      (item) => item.id === operationId
    );
    if (!operation) throw new GGOperationsClient.Failure("model_unavailable");
    return operation;
  }
  /** One submission. A transport failure never triggers a fresh generation. */
  async submit(
    operationId: string,
    input: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<Record<string, unknown>> {
    const operation = await this.resolve(operationId);
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new GGOperationsClient.Failure("invalid_input");
    if (input.model !== undefined && input.model !== operation.model_id)
      throw new GGOperationsClient.Failure("invalid_input");
    const body = JSON.stringify({ operation_id: operation.id, input });
    if (new TextEncoder().encode(body).byteLength > 3 * 1024 * 1024)
      throw new GGOperationsClient.Failure("invalid_input");
    const request = new MediaRequest(this.#http, signal, 600_000);
    try {
      const result = await request.wait(
        postHosted<unknown>({
          session: this.#gg,
          url: new URL("/api/v1/ai/operations", this.#origin).toString(),
          body: { operation_id: operation.id, input },
          scope: "grida-operation",
          abortSignal: request.signal,
          provider_http: request.transport(128 * 1024 * 1024),
          max_response_bytes: 128 * 1024 * 1024,
        })
      );
      request.check();
      if (!record(result)) throw new Error("invalid_response");
      return result;
    } finally {
      request.dispose();
    }
  }
  /** Lookup deliberately does not depend on today's model catalogue. */
  async job(id: string, signal?: AbortSignal): Promise<GGJob> {
    if (!/^req_[A-Za-z0-9_-]{1,160}$/.test(id))
      throw new GGOperationsClient.Failure("invalid_input");
    const request = new MediaRequest(this.#http, signal);
    try {
      const response = await request.request(
        new URL(`/api/v1/ai/jobs?request_id=${id}`, this.#origin),
        {
          method: "GET",
          credentials: "omit",
          redirect: "error",
          headers: { authorization: `Bearer ${readGgToken(this.#gg)}` },
        },
        2 * 1024 * 1024
      );
      await throwOnGgHttpError(response);
      if (response.status === 429) {
        const raw = response.headers.get("retry-after") ?? "";
        const seconds = /^\d{1,6}$/.test(raw) ? Number(raw) : 5;
        await response.body?.cancel().catch(() => {});
        throw new JobThrottled(Math.max(2_000, seconds * 1000));
      }
      if (!response.ok) throw new Error("generation_failed");
      const value: unknown = await request.wait(response.json());
      if (
        !record(value) ||
        value.id !== id ||
        value.request_id !== id ||
        typeof value.result_status !== "string" ||
        typeof value.status !== "string" ||
        (value.result !== null && !record(value.result))
      )
        throw new Error("invalid_response");
      return value as GGJob;
    } finally {
      request.dispose();
    }
  }
  async wait(id: string, signal?: AbortSignal): Promise<GGJob> {
    const request = new MediaRequest(this.#http, signal, 600_000);
    try {
      for (;;) {
        let delay = 2_000;
        try {
          const job = await request.wait(this.job(id, request.signal));
          if (job.result_status === "available") return job;
          if (["unavailable", "expired"].includes(job.result_status))
            throw new Error(`generation_failed: ${id}`);
        } catch (error) {
          if (!(error instanceof JobThrottled)) throw error;
          delay = error.delay;
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await request.wait(
            new Promise((resolve) => {
              timer = setTimeout(resolve, delay);
            })
          );
        } finally {
          clearTimeout(timer);
        }
      }
    } finally {
      request.dispose();
    }
  }
}
export type GGJob = Record<string, unknown> & {
  id: string;
  request_id: string;
  status: string;
  result_status: string;
  result: Record<string, unknown> | null;
};
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

class JobThrottled extends Error {
  constructor(readonly delay: number) {
    super("job_throttled");
  }
}

export namespace GGOperationsClient {
  /** Local pre-dispatch failures; never interpret arbitrary host error messages as these codes. */
  export class Failure extends Error {
    constructor(readonly code: "invalid_input" | "model_unavailable") {
      super(code);
      this.name = "GGOperationFailure";
    }
  }
}
