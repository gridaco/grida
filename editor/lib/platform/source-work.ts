import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import {
  exactCostMills,
  productDigest,
  ProductBillingError,
  type ProductContext,
} from "./product-billing";

export type SourceWorkRPC = (
  name:
    | "platform_source_work_begin"
    | "platform_source_work_capture"
    | "platform_source_work_finish",
  args: Record<string, unknown>
) => Promise<{ data: unknown; error: unknown }>;
const parent = new AsyncLocalStorage<string>();
const LIMIT = 1 << 20;
async function bodyBytes(body: ReadableStream<Uint8Array> | null) {
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const value = await reader.read();
      if (value.done) break;
      length += value.value.byteLength;
      if (length > LIMIT) throw new ProductBillingError();
      chunks.push(value.value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
/** Source-owned migration custody; these are not target-admitted usage events. */
export class SourceWork {
  constructor(private readonly rpc: SourceWorkRPC) {}
  private async call(
    name: Parameters<SourceWorkRPC>[0],
    args: Record<string, unknown>
  ) {
    const { data, error } = await this.rpc(name, args);
    if (error || !data || typeof data !== "object")
      throw new ProductBillingError();
    return data as Record<string, unknown>;
  }
  private async begin(
    id: string,
    kind: "provider_http" | "legacy_ai",
    request: Record<string, unknown>,
    parentID?: string
  ) {
    const data = await this.call("platform_source_work_begin", {
      work_id: id,
      work_kind: kind,
      request: { ...request, request_digest: productDigest(request) },
      parent_work_id: parentID ?? null,
    });
    if (data.created !== true || data.id !== id)
      throw new ProductBillingError("execution_already_dispatched");
    return id;
  }
  async beginAI(
    context: Omit<ProductContext, "requestDigest"> & { requestDigest?: string }
  ) {
    const id = randomUUID();
    const transactionID = context.transactionId ?? id;
    if (
      !Number.isSafeInteger(context.organizationId) ||
      context.organizationId <= 0 ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(transactionID)
    )
      throw new ProductBillingError();
    await this.begin(id, "legacy_ai", {
      organization_id: String(context.organizationId),
      execution_id: transactionID,
      product: "grida-ai",
      operation: context.feature,
      model: context.model_id,
      unit: "cost_mills",
      policy_version: "legacy-ai-v1",
      input_digest:
        context.requestDigest ??
        productDigest({
          transactionID,
          model: context.model_id,
          feature: context.feature,
        }),
    });
    return { id, transactionID };
  }
  async completeAI(
    work: { id: string; transactionID: string },
    quantity: number,
    evidence: unknown,
    deliver: () => Promise<unknown>
  ) {
    // A captured exact receipt remains present even when the legacy ingest is
    // rejected, interrupted or loses its response. It is never retried blindly.
    const result = await this.call("platform_source_work_capture", {
      work_id: work.id,
      evidence: {
        execution_id: work.transactionID,
        quantity: exactCostMills(quantity),
        unit: "cost_mills",
        outcome: "succeeded",
        occurred_at: new Date().toISOString(),
        evidence_digest: productDigest(evidence),
      },
    });
    if (result.accepted !== true) throw new ProductBillingError();
    try {
      await parent.run(work.id, deliver);
    } catch {
      return { delivered: false };
    }
    const finished = await this.call("platform_source_work_finish", {
      work_id: work.id,
    });
    if (finished.accepted !== true) throw new ProductBillingError();
    return { delivered: true };
  }
  async fetch(
    input: RequestInfo | URL,
    init?: RequestInit,
    transport: typeof fetch = fetch
  ) {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const bytes = await bodyBytes(request.clone().body);
    const id = randomUUID();
    // Authorization and cookies are deliberately excluded. Exact request/response
    // bytes remain private SQL custody for cutover reconciliation, never logs.
    await this.begin(
      id,
      "provider_http",
      {
        method: request.method,
        url: url.toString(),
        idempotency_key: request.headers.get("idempotency-key"),
        body_base64: bytes.toString("base64"),
      },
      parent.getStore()
    );
    const response = await transport(request);
    const responseBytes = await bodyBytes(response.clone().body);
    const result = await this.call("platform_source_work_capture", {
      work_id: id,
      evidence: {
        status: response.status,
        request_id:
          response.headers.get("request-id") ??
          response.headers.get("x-request-id"),
        body_base64: responseBytes.toString("base64"),
        body_digest: productDigest(responseBytes.toString("base64")),
      },
    });
    if (result.accepted !== true) throw new ProductBillingError();
    // A response is custody, not certification that the parent projection ran.
    // The operator must reconcile captured attempts in the transfer manifest.
    return response;
  }
}
