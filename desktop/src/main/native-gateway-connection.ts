// GRIDA-SEC-004 / GRIDA-SEC-006 / GRIDA-GG: desktop — native chat bearer custody.
import { createHash } from "node:crypto";
import type {
  DesktopAccountSession,
  DesktopGatewayGrant,
} from "./account-session";
import type { NativeProviderNetwork } from "./native-provider-egress";
import type { NativeAgentLaunch } from "./native-agent-process";

const RENEWAL_MARGIN_MS = 30_000;
const BILLING_TIMEOUT_MS = 12_000;
const BILLING_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_ID = /^req_[A-Za-z0-9_-]{1,124}$/;
const DECIMAL = /^\d+(?:\.\d+)?$/;
type Account = Pick<DesktopAccountSession, "withGatewayGrant">;

export type NativeGatewayJobNetwork = (
  requestId: string,
  bearer: string,
  signal: AbortSignal
) => Promise<Response>;

export type NativeGatewayBilling =
  | { kind: "pending" | "unavailable" }
  | { kind: "settled"; chargedMills: string };

const UNAVAILABLE: NativeGatewayBilling = { kind: "unavailable" };

export class NativeGatewayConnection implements NativeProviderNetwork {
  static readonly billingCapability = "co.grida/gateway/billing-status";
  static readonly billingStatusMethod = "_co.grida/gateway/billing-status";
  static readonly readJobBillingMethod = "_co.grida/gateway/read-job-billing";
  readonly scope: string;
  readonly endpoint: string;
  private readonly target: string;
  private readonly closing = new AbortController();
  #grant: DesktopGatewayGrant | undefined;
  private renewal: Promise<void> | undefined;

  private constructor(
    origin: string,
    private readonly account: Account,
    private readonly network: NativeProviderNetwork,
    private readonly jobNetwork: NativeGatewayJobNetwork | undefined,
    grant: DesktopGatewayGrant
  ) {
    this.endpoint = new URL("/api/v1/ai", origin).href;
    this.target = `${this.endpoint}/chat/completions`;
    this.scope = createHash("sha256")
      .update(
        JSON.stringify([
          "desktop-gateway-chat-v1",
          origin,
          grant.subject,
          grant.organizationId,
        ])
      )
      .digest("hex");
    this.#grant = grant;
  }

  static async open(options: {
    origin: string;
    account: Account;
    network: NativeProviderNetwork;
    jobNetwork?: NativeGatewayJobNetwork;
    organizationId?: number;
    signal?: AbortSignal;
  }): Promise<NativeGatewayConnection> {
    const { origin, account, network, jobNetwork, organizationId, signal } =
      options;
    const base = new URL(origin);
    if (
      base.origin !== origin ||
      (base.protocol !== "https:" &&
        (base.protocol !== "http:" ||
          !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)))
    )
      throw new Error("native_gateway_origin_invalid");
    let captured: DesktopGatewayGrant | undefined;
    await account.withGatewayGrant(
      organizationId,
      (grant) => {
        captured = grant;
      },
      signal
    );
    if (!captured?.isCurrent() || signal?.aborted)
      throw new Error("native_gateway_account_unavailable");
    return new NativeGatewayConnection(
      origin,
      account,
      network,
      jobNetwork,
      captured
    );
  }

  async readJobBilling(
    requestId: string,
    request: AbortSignal
  ): Promise<NativeGatewayBilling> {
    if (!this.jobNetwork || !REQUEST_ID.test(requestId)) return UNAVAILABLE;
    const signal = AbortSignal.any([
      request,
      this.closing.signal,
      AbortSignal.timeout(BILLING_TIMEOUT_MS),
    ]);
    if (signal.aborted) return UNAVAILABLE;
    try {
      const grant = await this.currentGrant();
      if (
        !grant?.isCurrent() ||
        grant.expiresAt <= Date.now() ||
        signal.aborted
      )
        return UNAVAILABLE;
      const response = await this.jobNetwork(requestId, grant.token, signal);
      const value = await readJob(response, signal);
      if (
        signal.aborted ||
        !grant.isCurrent() ||
        grant.expiresAt <= Date.now() ||
        value?.id !== requestId ||
        value.request_id !== requestId
      )
        return UNAVAILABLE;
      const billing = record(value.billing);
      if (billing?.status === "pending" && billing.charged_mills === null)
        return { kind: "pending" };
      if (billing?.status === "settled" && validAmount(billing.charged_mills))
        return { kind: "settled", chargedMills: billing.charged_mills };
    } catch {
      // Never expose response details or credential material.
    }
    return UNAVAILABLE;
  }

  static billingResult(value: unknown): NativeGatewayBilling {
    const result = record(value);
    if (Object.keys(result ?? {}).length === 1 && result?.kind === "pending")
      return { kind: "pending" };
    if (
      Object.keys(result ?? {}).length === 2 &&
      result?.kind === "settled" &&
      validAmount(result.chargedMills)
    )
      return { kind: "settled", chargedMills: result.chargedMills };
    return UNAVAILABLE;
  }

  prepare(target: string, headers: Headers) {
    if (
      target !== this.target ||
      headers.has("authorization") ||
      !this.#grant?.isCurrent() ||
      this.closing.signal.aborted
    )
      return null;
    return async (body: Buffer, request: AbortSignal) => {
      const signal = AbortSignal.any([request, this.closing.signal]);
      if (signal.aborted) return null;
      const grant = await this.currentGrant();
      if (
        !grant?.isCurrent() ||
        grant.expiresAt <= Date.now() ||
        signal.aborted
      )
        return null;
      const authorized = new Headers(headers);
      authorized.set("authorization", `Bearer ${grant.token}`);
      authorized.set("x-grida-billing-receipt", "1");
      let dispatch;
      try {
        dispatch = this.network.prepare(this.target, authorized);
      } catch {
        return null;
      }
      return dispatch ? dispatch(body, signal) : null;
    };
  }

  launch(
    model: string
  ): Pick<
    NativeAgentLaunch,
    | "provider"
    | "endpoint"
    | "model"
    | "providerNetwork"
    | "gatewayScope"
    | "gatewayJobBilling"
  > {
    return {
      provider: "openai-compatible",
      endpoint: this.endpoint,
      model,
      providerNetwork: this,
      gatewayScope: this.scope,
      ...(this.jobNetwork && {
        gatewayJobBilling: this.readJobBilling.bind(this),
      }),
    };
  }

  close(): void {
    this.#grant = undefined;
    this.closing.abort();
  }

  private async currentGrant(): Promise<DesktopGatewayGrant | undefined> {
    const previous = this.#grant;
    if (!previous?.isCurrent()) return;
    if (previous.expiresAt > Date.now() + RENEWAL_MARGIN_MS) return previous;
    this.renewal ??= this.account
      .withGatewayGrant(
        previous.organizationId,
        (next) => {
          if (
            this.closing.signal.aborted ||
            this.#grant !== previous ||
            !previous.isCurrent() ||
            !next.isCurrent() ||
            previous.subject !== next.subject ||
            previous.organizationId !== next.organizationId ||
            next.expiresAt <= Date.now() + RENEWAL_MARGIN_MS
          )
            return;
          this.#grant = next;
        },
        this.closing.signal
      )
      .catch(() => {})
      .finally(() => {
        this.renewal = undefined;
      });
    await this.renewal;
    return this.#grant !== previous ? this.#grant : undefined;
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function validAmount(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && DECIMAL.test(value);
}

async function readJob(response: Response, signal: AbortSignal) {
  const reader = response.body?.getReader();
  if (!reader) return;
  const cancel = () => void reader.cancel().catch(() => {});
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (
      response.redirected ||
      ![200, 202].includes(response.status) ||
      !/^application\/json(?:\s*;|$)/i.test(
        response.headers.get("content-type") ?? ""
      )
    )
      return;
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    let json = "";
    for (;;) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) return record(JSON.parse(json + decoder.decode()));
      bytes += chunk.value.byteLength;
      if (chunk.value.byteLength === 0 || bytes > BILLING_RESPONSE_BYTES)
        return;
      json += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
  }
}
