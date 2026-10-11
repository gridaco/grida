import { createHash, randomBytes, randomUUID } from "node:crypto";

export type ProductRPC = (
  name:
    | "platform_billing_owner"
    | "platform_product_execution_claim"
    | "platform_product_execution_dispatch"
    | "platform_product_execution_close"
    | "platform_product_execution_receipt",
  args: Record<string, unknown>
) => Promise<{ data: unknown; error: unknown }>;
export type ProductContext = {
  organizationId: number;
  feature: string;
  model_id: string;
  transactionId?: string;
  requestDigest: string;
  authorizedMills?: string;
  expenseBoundMills?: string;
  /** Explicitly accepted native expense estimate; never a GG API policy. */
  expensePolicy?: "native-interactive-estimate-v1" | "native-image-estimate-v1";
  tariffRevision?: string;
};
export type Claim = {
  organization_id: string;
  product: string;
  operation: string;
  model: string;
  unit: string;
  policy_version: string;
  request_digest: string;
  admission_observed_at: string;
  admission_expires_at: string;
  authorized_mills?: string;
  expense_bound_mills?: string;
  tariff_revision?: string;
};
export type ProductExecution = { id: string; claim: Claim };
export type Admission = {
  observation_id: string;
  allowed: boolean;
  reason: string;
  account_id: string;
  source_instance: string;
  source_epoch: string;
  source_version: string;
  account_observed_at: string;
  lifecycle_observed_at: string;
  commercial_observed_at: string;
  financial_observed_at: string;
  observed_at: string;
  expires_at: string;
  balance_cents: number;
  entitled: boolean;
  provisioned: boolean;
  id?: string;
  claim?: Claim;
};
export class ProductBillingError extends Error {
  readonly status: number;
  constructor(
    readonly code:
      | "blocked"
      | "billing_unavailable"
      | "execution_already_dispatched"
      | "invalid_cost" = "billing_unavailable"
  ) {
    super(code);
    this.name = "ProductBillingError";
    this.status =
      code === "blocked"
        ? 402
        : code === "execution_already_dispatched"
          ? 409
          : 503;
  }
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const identifier = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Hash request data without persisting prompts, uploaded references or secrets. */
export function productDigest(value: unknown): string {
  return createHash("sha256")
    .update(
      JSON.stringify(value, (_key, item) => {
        if (object(item) && Object.getPrototypeOf(item) === Object.prototype)
          return Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((key) => [key, item[key]])
          );
        return item;
      })
    )
    .digest("hex");
}
/** Native units are decimal strings; never round to a GG money unit. */
export function exactCostMills(value: number | string): string {
  let text = typeof value === "number" ? String(value) : value;
  if (typeof value === "number" && (!Number.isFinite(value) || value < 0))
    throw new ProductBillingError("invalid_cost");
  if (/^[0-9]+(?:\.[0-9]+)?e[+-]?[0-9]+$/i.test(text)) {
    const [coefficient, exponent] = text.toLowerCase().split("e");
    const [whole, fraction = ""] = coefficient!.split(".");
    const digits = whole! + fraction,
      point = whole!.length + Number(exponent);
    if (point < -18 || point > 19)
      throw new ProductBillingError("invalid_cost");
    text =
      point <= 0
        ? `0.${"0".repeat(-point)}${digits}`
        : point >= digits.length
          ? digits + "0".repeat(point - digits.length)
          : `${digits.slice(0, point)}.${digits.slice(point)}`;
  }
  if (!/^(0|[1-9][0-9]{0,18})(\.[0-9]{1,18})?$/.test(text))
    throw new ProductBillingError("invalid_cost");
  const [whole, fraction = ""] = text.split(".");
  if (
    BigInt(whole!) > BigInt("9223372036854775807") ||
    (whole === "9223372036854775807" && /[1-9]/.test(fraction))
  )
    throw new ProductBillingError("invalid_cost");
  return text;
}

export class ProductBilling {
  constructor(
    private readonly config: {
      origin: string;
      keyId: string;
      token: string;
      development: boolean;
    },
    private readonly rpc: ProductRPC,
    private readonly transport: typeof fetch = fetch
  ) {
    const url = new URL(config.origin);
    if (
      url.origin !== config.origin ||
      url.username ||
      url.password ||
      !(
        url.protocol === "https:" ||
        (config.development &&
          url.protocol === "http:" &&
          ["127.0.0.1", "localhost"].includes(url.hostname))
      ) ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(config.keyId) ||
      !/^[A-Za-z0-9_-]{43,256}$/.test(config.token)
    )
      throw new ProductBillingError();
  }
  private async source(
    name: Parameters<ProductRPC>[0],
    args: Record<string, unknown>
  ) {
    const result = await this.rpc(name, args);
    if (result.error || !object(result.data)) throw new ProductBillingError();
    return result.data;
  }
  private async assertOwner() {
    const state = await this.source("platform_billing_owner", {});
    if (
      state.owner !== "infra" ||
      typeof state.epoch !== "string" ||
      !/^[1-9][0-9]*$/.test(state.epoch)
    )
      throw new ProductBillingError();
  }
  private async observe(
    path: "entitlement" | "executions",
    organizationId: number,
    input: Record<string, string> = {}
  ): Promise<Admission> {
    if (!Number.isSafeInteger(organizationId) || organizationId <= 0)
      throw new ProductBillingError();
    await this.assertOwner();
    const start = Date.now(),
      monotonic = performance.now(),
      observation_id = randomBytes(24).toString("base64url");
    const response = await this.transport(
      `${this.config.origin}/platform/v1/billing/usage/${path}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.token}`,
          "X-Grida-Workload-Key-ID": this.config.keyId,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...input,
          organization_id: String(organizationId),
          observation_id,
          requested_at: new Date(start).toISOString(),
        }),
        cache: "no-store",
        redirect: "error",
        credentials: "omit",
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new ProductBillingError(
        response.status === 402 ? "blocked" : "billing_unavailable"
      );
    }
    const reader = response.body?.getReader();
    if (!reader) throw new ProductBillingError();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 32768) throw new ProductBillingError();
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    let data: unknown;
    try {
      data = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))
      );
    } catch {
      throw new ProductBillingError();
    }
    if (
      !object(data) ||
      data.observation_id !== observation_id ||
      typeof data.allowed !== "boolean" ||
      typeof data.reason !== "string" ||
      typeof data.account_id !== "string" ||
      !/^ba_[0-9a-f]{32}$/.test(data.account_id) ||
      typeof data.source_instance !== "string" ||
      !uuid.test(data.source_instance) ||
      typeof data.source_epoch !== "string" ||
      !uuid.test(data.source_epoch) ||
      typeof data.source_version !== "string" ||
      !/^[1-9][0-9]*$/.test(data.source_version)
    )
      throw new ProductBillingError();
    const times = [
      "account_observed_at",
      "lifecycle_observed_at",
      "commercial_observed_at",
      "financial_observed_at",
      "observed_at",
    ].map((key) =>
      typeof data[key] === "string" ? Date.parse(data[key]) : NaN
    );
    const expires =
      typeof data.expires_at === "string" ? Date.parse(data.expires_at) : NaN;
    const now = Date.now(),
      elapsed = performance.now() - monotonic;
    if (
      !Number.isFinite(expires) ||
      times.some((t) => !Number.isFinite(t) || t > now + 5000) ||
      expires <= now ||
      expires > start + 60000 ||
      expires > Math.min(...times) + 60000 ||
      elapsed >= Math.min(60000, expires - start)
    )
      throw new ProductBillingError();
    return data as unknown as Admission;
  }
  async entitlement(organizationId: number) {
    const data = await this.observe("entitlement", organizationId);
    if (
      !Number.isSafeInteger(data.balance_cents) ||
      typeof data.entitled !== "boolean" ||
      typeof data.provisioned !== "boolean"
    )
      throw new ProductBillingError();
    return data;
  }
  async begin(context: ProductContext): Promise<ProductExecution> {
    const id = context.transactionId ?? randomUUID();
    if (
      !identifier.test(id) ||
      !/^[0-9a-f]{64}$/.test(context.requestDigest) ||
      !context.feature ||
      context.feature.length > 256 ||
      !context.model_id ||
      context.model_id.length > 256
    )
      throw new ProductBillingError();
    const bounded =
      context.authorizedMills != null &&
      context.expenseBoundMills != null &&
      context.tariffRevision != null;
    if (
      !bounded &&
      [
        context.authorizedMills,
        context.expenseBoundMills,
        context.tariffRevision,
      ].some((v) => v != null)
    )
      throw new ProductBillingError("invalid_cost");
    const identity = {
      organization_id: String(context.organizationId),
      product: "grida-ai",
      operation: context.feature,
      model: context.model_id,
      unit: "cost_mills",
      policy_version: bounded ? "shared-ai-v1" : "legacy-ai-v1",
      ...(bounded
        ? {
            authorized_mills: exactCostMills(context.authorizedMills!),
            expense_bound_mills: exactCostMills(context.expenseBoundMills!),
            tariff_revision: context.tariffRevision!,
          }
        : {}),
      request_digest: context.requestDigest,
    };
    if (
      bounded &&
      (!/^[0-9a-f]{64}$/.test(context.tariffRevision!) ||
        Number(context.authorizedMills) < 0 ||
        Number(context.expenseBoundMills) < 0)
    )
      throw new ProductBillingError("invalid_cost");
    const decision = await this.observe("executions", context.organizationId, {
      ...identity,
      ...(context.expensePolicy
        ? { expense_policy: context.expensePolicy }
        : {}),
      id,
      producer: "grida-ai",
    });
    if (!decision.allowed) throw new ProductBillingError("blocked");
    const claim = decision.claim;
    const shared = claim?.policy_version === "shared-ai-v1";
    const expectedIdentity = shared
      ? identity
      : {
          organization_id: identity.organization_id,
          product: identity.product,
          operation: identity.operation,
          model: identity.model,
          unit: identity.unit,
          policy_version: "legacy-ai-v1",
          request_digest: identity.request_digest,
        };
    if (
      decision.id !== id ||
      !object(claim) ||
      (shared
        ? !bounded || Object.keys(claim).length !== 12
        : claim.policy_version !== "legacy-ai-v1" ||
          Object.keys(claim).length !== 9) ||
      Object.entries(expectedIdentity).some(
        ([key, value]) =>
          (claim as unknown as Record<string, unknown>)[key] !== value
      ) ||
      claim.admission_observed_at !== decision.observed_at ||
      claim.admission_expires_at !== decision.expires_at
    )
      throw new ProductBillingError();
    try {
      const custody = await this.source("platform_product_execution_claim", {
        producer_id: "grida-ai",
        execution_id: id,
        claim,
      });
      if (custody.created !== true || custody.state !== "claimed")
        throw new ProductBillingError("execution_already_dispatched");
      // Only the target CAS winner may proceed. An ambiguous response never
      // becomes a second provider dispatch or a new execution identity.
      if (shared) {
        const permission = await this.executionCommand(id, claim, "dispatch");
        if (permission.dispatch !== true)
          throw new ProductBillingError("execution_already_dispatched");
      }
      const dispatch = await this.source(
        "platform_product_execution_dispatch",
        {
          producer_id: "grida-ai",
          execution_id: id,
        }
      );
      if (dispatch.dispatch !== true || dispatch.state !== "dispatched")
        throw new ProductBillingError("execution_already_dispatched");
    } catch (error) {
      // Close source custody first. A committed tombstone fences a delayed
      // claim/dispatch; without its proof the financial hold remains intact.
      try {
        const closure = await this.source("platform_product_execution_close", {
          producer_id: "grida-ai",
          execution_id: id,
          claim,
        });
        if (shared && closure.state === "closed")
          await this.executionCommand(id, claim, "close", closure);
      } catch {
        /* Destination outage retains the original hold for recovery. */
      }
      throw error;
    }
    return { id, claim };
  }
  private async executionCommand(
    id: string,
    claim: Claim,
    command: "dispatch" | "close",
    closure?: Record<string, unknown>
  ) {
    const response = await this.transport(
      `${this.config.origin}/platform/v1/billing/usage/executions/${encodeURIComponent(id)}/${command}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.token}`,
          "X-Grida-Workload-Key-ID": this.config.keyId,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          organization_id: claim.organization_id,
          request_digest: claim.request_digest,
          ...(closure ? { closure } : {}),
        }),
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new ProductBillingError();
    }
    const reader = response.body?.getReader();
    if (!reader) throw new ProductBillingError();
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 32768) throw new ProductBillingError();
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    const out: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))
    );
    if (
      !object(out) ||
      out.id !== id ||
      out.organization_id !== claim.organization_id ||
      out.request_digest !== claim.request_digest
    )
      throw new ProductBillingError();
    return out;
  }
  async complete(
    execution: ProductExecution,
    quantity: number | string,
    evidence: unknown,
    outcome: "succeeded" | "failed" | "cancelled" = "succeeded"
  ) {
    const {
      admission_expires_at: _expires,
      admission_observed_at: _observed,
      request_digest: _digest,
      authorized_mills: _maximum,
      expense_bound_mills: _expense,
      tariff_revision: _tariff,
      ...identity
    } = execution.claim;
    const receipt = {
      ...identity,
      outcome,
      quantity: exactCostMills(quantity),
      occurred_at: new Date().toISOString(),
      evidence_digest: productDigest(evidence),
    };
    const result = await this.source("platform_product_execution_receipt", {
      producer_id: "grida-ai",
      execution_id: execution.id,
      receipt,
    });
    if (result.accepted !== true) throw new ProductBillingError();
    // Committed local receipt/outbox is custody. Destination downtime must not
    // replace its ID or make an already completed execution runnable again.
    return receipt;
  }
}
