// GRIDA-EE: billing — lazy, fixed consumer boundary to the infra billing owner.
// GRIDA-SEC-010 / GRIDA-SEC-012 — user authority and workload credentials stay distinct.
import "server-only";
import type { credits } from "../billing/credits";

export class BillingConsumerError extends Error {
  constructor(
    readonly code: "unavailable" | "unauthorized" | "forbidden" = "unavailable"
  ) {
    super("Billing is unavailable.");
    this.name = "BillingConsumerError";
  }
}

type Environment = Readonly<Record<string, string | undefined>>;
export function billingOwner(
  env: Environment = process.env
): "grida" | "infra" {
  const owner = env.GRIDA_BILLING_OWNER ?? "grida";
  if (owner !== "grida" && owner !== "infra") throw new BillingConsumerError();
  return owner;
}
export function configuredOrigin(
  value: string | undefined,
  env: Environment
): string {
  try {
    const url = new URL(value ?? "");
    if (
      url.origin !== value ||
      url.username ||
      url.password ||
      !(
        url.protocol === "https:" ||
        (env.GRIDA_PLATFORM_ALLOW_LOCAL === "1" &&
          env.NODE_ENV !== "production" &&
          url.protocol === "http:" &&
          url.hostname === "127.0.0.1")
      )
    )
      throw new BillingConsumerError();
    return url.origin;
  } catch {
    throw new BillingConsumerError();
  }
}
export type BillingDestination =
  | { section: "billing" | "upgrade" }
  | { section: "purchase"; purchaseId: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function billingDestination(
  organizationId: number,
  destination: BillingDestination
): string {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0)
    throw new BillingConsumerError();
  const base = `/organizations/${organizationId}/billing`;
  if (destination.section === "billing") return base;
  if (destination.section === "upgrade") return `${base}/upgrade`;
  if (destination.section === "purchase" && uuid.test(destination.purchaseId))
    return `${base}/purchases/${destination.purchaseId}`;
  throw new BillingConsumerError();
}
export function consoleBillingUrl(
  organizationId: number,
  destination: BillingDestination,
  env: Environment = process.env
): string {
  if (billingOwner(env) !== "infra") throw new BillingConsumerError();
  return (
    configuredOrigin(env.GRIDA_PLATFORM_CONSOLE_ORIGIN, env) +
    billingDestination(organizationId, destination)
  );
}
export type CachedCredits = Omit<credits.Summary, "organization"> & {
  organization_id: string;
};
export type BillingSummary = {
  organization_id: string;
  plan: "free" | "pro" | "team" | "custom";
  managed_contract: boolean;
  account_present: boolean;
};
export type BillingConsumerConfig = Readonly<{
  origin: string;
  keyId: string;
  token: string;
}>;
export function platformBilling(
  env: Environment = process.env,
  fetcher: typeof fetch = globalThis.fetch
): BillingConsumer {
  if (billingOwner(env) !== "infra") throw new BillingConsumerError();
  const origin = configuredOrigin(env.GRIDA_PLATFORM_BILLING_ORIGIN, env);
  const keyId = env.GRIDA_PLATFORM_SSR_KEY_ID ?? "",
    token = env.GRIDA_PLATFORM_SSR_TOKEN ?? "";
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(keyId) ||
    !/^[A-Za-z0-9_-]{43,256}$/.test(token)
  )
    throw new BillingConsumerError();
  return new BillingConsumer({ origin, keyId, token }, fetcher);
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function timestamp(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.length <= 64 &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(v) &&
    Number.isFinite(Date.parse(v))
  );
}
export function cachedCredits(
  value: unknown,
  organizationId: number
): CachedCredits {
  if (
    !record(value) ||
    value.organization_id !== String(organizationId) ||
    typeof value.account_present !== "boolean" ||
    value.source !== "cache" ||
    value.currency !== "USD" ||
    !["not_provisioned", "uncached", "cached"].includes(String(value.state)) ||
    !record(value.billing_gate)
  )
    throw new BillingConsumerError();
  const gate = value.billing_gate;
  if (
    typeof gate.allowed !== "boolean" ||
    (gate.allowed
      ? gate.reason !== null
      : !["not_provisioned", "below_floor", "no_balance"].includes(
          String(gate.reason)
        ))
  )
    throw new BillingConsumerError();
  if (value.state === "cached") {
    if (
      !value.account_present ||
      !Number.isSafeInteger(value.balance_cents) ||
      !timestamp(value.cache_updated_at)
    )
      throw new BillingConsumerError();
  } else if (
    value.balance_cents !== null ||
    value.cache_updated_at !== null ||
    (value.state === "uncached" && !value.account_present) ||
    (value.state === "not_provisioned" &&
      (gate.allowed || gate.reason !== "not_provisioned"))
  )
    throw new BillingConsumerError();
  return {
    organization_id: String(organizationId),
    account_present: value.account_present,
    state: value.state as CachedCredits["state"],
    source: "cache",
    currency: "USD",
    balance_cents: value.balance_cents as number | null,
    cache_updated_at: value.cache_updated_at as string | null,
    billing_gate: {
      allowed: gate.allowed,
      reason: gate.reason as CachedCredits["billing_gate"]["reason"],
    },
  };
}

/** Fixed methods only: callers cannot select a host, path, user, or provider. */
export class BillingConsumer {
  constructor(
    private readonly config: BillingConsumerConfig,
    private readonly fetcher: typeof fetch = globalThis.fetch
  ) {}
  private async request(
    organizationId: number,
    bearer: string,
    family: "browser" | "native",
    operation: "credits" | "summary" | "refresh",
    timeoutMs = 5_000
  ): Promise<unknown> {
    if (
      !Number.isSafeInteger(organizationId) ||
      organizationId <= 0 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(bearer) ||
      bearer.length > 16_384 ||
      (family === "native" && operation !== "credits")
    )
      throw new BillingConsumerError();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response | undefined;
    try {
      response = await this.fetcher(
        `${this.config.origin}/platform/v1/billing/organizations/${organizationId}/${operation === "refresh" ? "credits/refresh" : operation}`,
        {
          method: operation === "refresh" ? "POST" : "GET",
          headers: {
            authorization: `Bearer ${this.config.token}`,
            "X-Grida-Workload-Key-ID": this.config.keyId,
            [family === "native"
              ? "X-Grida-Native-Token"
              : "X-Grida-Account-Token"]: bearer,
            accept: "application/json",
            ...(operation === "refresh"
              ? { "content-type": "application/json" }
              : {}),
          },
          ...(operation === "refresh" ? { body: "{}" } : {}),
          redirect: "error",
          credentials: "omit",
          cache: "no-store",
          signal: controller.signal,
        }
      );
      if (response.redirected || response.status !== 200) {
        if (response.status === 401)
          throw new BillingConsumerError("unauthorized");
        if (response.status === 403 || response.status === 404)
          throw new BillingConsumerError("forbidden");
        throw new BillingConsumerError();
      }
      if (
        !/^application\/json(?:;|$)/i.test(
          response.headers.get("content-type") ?? ""
        ) ||
        !response.body
      )
        throw new BillingConsumerError();
      const reader = response.body.getReader();
      let bytes = 0,
        text = "";
      const decoder = new TextDecoder("utf-8", { fatal: true });
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 64 * 1024 || controller.signal.aborted)
            throw new BillingConsumerError();
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
        if (controller.signal.aborted) throw new BillingConsumerError();
        return JSON.parse(text) as unknown;
      } finally {
        await reader.cancel().catch(() => undefined);
      }
    } catch (error) {
      await response?.body?.cancel().catch(() => undefined);
      if (error instanceof BillingConsumerError) throw error;
      throw new BillingConsumerError();
    } finally {
      clearTimeout(timer);
    }
  }
  async credits(
    organizationId: number,
    bearer: string,
    family: "browser" | "native" = "browser"
  ): Promise<CachedCredits> {
    return cachedCredits(
      await this.request(organizationId, bearer, family, "credits"),
      organizationId
    );
  }
  async summary(
    organizationId: number,
    bearer: string
  ): Promise<BillingSummary> {
    const value = await this.request(
      organizationId,
      bearer,
      "browser",
      "summary"
    );
    if (
      !record(value) ||
      value.organization_id !== String(organizationId) ||
      !["free", "pro", "team", "custom"].includes(String(value.plan)) ||
      typeof value.managed_contract !== "boolean" ||
      typeof value.account_present !== "boolean" ||
      (value.plan === "custom") !== value.managed_contract
    )
      throw new BillingConsumerError();
    return {
      organization_id: String(organizationId),
      plan: value.plan as BillingSummary["plan"],
      managed_contract: value.managed_contract,
      account_present: value.account_present,
    };
  }
  async refresh(
    organizationId: number,
    bearer: string,
    timeoutMs = 2_000
  ): Promise<void> {
    await this.request(organizationId, bearer, "browser", "refresh", timeoutMs);
  }
}
