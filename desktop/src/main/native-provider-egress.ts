// GRIDA-SEC-004 / GRIDA-SEC-008 / GRIDA-SEC-014 — bounded native provider HTTP.
import { allowsLlamaCppInputCounting } from "@grida/agent";
import { CHATGPT_RESPONSES_URL } from "../chatgpt-configuration";
const UPLOAD_LIMIT = 1024 * 1024;
const RESPONSE_LIMIT = 4 * 1024 * 1024;
const UPLOAD_CHUNK = 64 * 1024;
const READ_CHUNK = 32 * 1024;
const MAX_EXCHANGES = 8;
const MAX_TIMEOUT_MS = 120_000;

type Protocol =
  | "openai-compatible"
  | "responses"
  | "anthropic"
  | "gemini"
  | "chatgpt-subscription";
type Reply =
  | { status: "accepted" | "unavailable" | "interrupted" | "end" }
  | { status: "chunk"; data: string }
  | {
      status: "ready";
      httpStatus: number;
      requestId: string | null;
      retryAfterMs: number | null;
    };
// A null result is a refusal before a provider request started.
type Dispatch = (body: Buffer, signal: AbortSignal) => Promise<Response | null>;

/** Trusted main-process network authority. Preparation must verify the live
 * grant without dispatching a request. The returned closure is used once. */
export type NativeProviderNetwork = {
  prepare(target: string, headers: Headers): Dispatch | null;
};

type Exchange = {
  target: string;
  headers: Headers;
  phase: "upload" | "dispatch" | "stream";
  controller: AbortController;
  timer: ReturnType<typeof setTimeout>;
  uploaded: Buffer[];
  requestBytes: number;
  maxResponseBytes: number;
  reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  remainder: Uint8Array;
  responseBytes: number;
  reading: boolean;
};

export class NativeProviderEgress {
  static readonly capability = "co.grida/provider/egress";
  static readonly exchangeMethod = "_co.grida/provider/exchange";
  static readonly cancelMethod = "_co.grida/provider/cancel";

  private readonly exchanges = new Map<string, Exchange>();
  private readonly targets: Map<string, string>;
  private closed = false;

  constructor(
    private readonly network: NativeProviderNetwork,
    private readonly protocol: Protocol,
    endpoint: string,
    model: string,
    llamaCppInputCount?: true,
    private readonly gatewayCeilings?: true
  ) {
    this.targets = providerTargets(
      protocol,
      endpoint,
      model,
      llamaCppInputCount
    );
    if (gatewayCeilings) {
      if (protocol !== "openai-compatible" || llamaCppInputCount)
        throw new Error("native_gateway_ceiling_profile_invalid");
      this.targets.set(
        new URL(`${endpoint.replace(/\/$/, "")}/chat/completions/capped`).href,
        "text/event-stream"
      );
    }
  }

  async exchange(value: unknown): Promise<Reply> {
    const input = object(value);
    const id = input?.id;
    if (this.closed || !input || !exchangeId(id)) {
      return { status: "unavailable" };
    }
    const current = this.exchanges.get(id);
    if (input.action === "open") return this.open(id, input);
    if (!current) return { status: "unavailable" };
    if (input.action === "append" && current.phase === "upload") {
      const next = decode(input.data);
      if (!next || current.requestBytes + next.length > UPLOAD_LIMIT) {
        this.end(id, current);
        return { status: "unavailable" };
      }
      current.requestBytes += next.length;
      current.uploaded.push(next);
      return { status: "accepted" };
    }
    if (input.action === "dispatch" && current.phase === "upload") {
      return await this.dispatch(id, current);
    }
    if (
      input.action === "read" &&
      current.phase === "stream" &&
      !current.reading
    ) {
      return await this.read(id, current);
    }
    return { status: "interrupted" };
  }

  cancel(value: unknown): void {
    const id = object(value)?.id;
    if (!exchangeId(id)) return;
    const current = this.exchanges.get(id);
    if (current) this.end(id, current);
  }

  close(): void {
    this.closed = true;
    for (const [id, exchange] of this.exchanges) this.end(id, exchange);
  }

  private open(id: string, input: Record<string, unknown>): Reply {
    const { target, timeoutMs, maxResponseBytes } = input;
    if (
      this.exchanges.has(id) ||
      this.exchanges.size >= MAX_EXCHANGES ||
      typeof target !== "string" ||
      !boundedInteger(timeoutMs, MAX_TIMEOUT_MS) ||
      !boundedInteger(maxResponseBytes, RESPONSE_LIMIT)
    )
      return { status: "unavailable" };
    const accept = this.targets.get(target);
    const headers = accept
      ? providerHeaders(
          this.protocol,
          accept,
          input.headers,
          this.gatewayCeilings && target.endsWith("/chat/completions/capped")
            ? true
            : undefined
        )
      : undefined;
    const initial = decode(input.initial);
    if (!headers || !initial) return { status: "unavailable" };
    const exchange: Exchange = {
      target,
      headers,
      phase: "upload",
      controller: new AbortController(),
      timer: setTimeout(() => this.end(id, exchange), timeoutMs),
      uploaded: [initial],
      requestBytes: initial.length,
      maxResponseBytes,
      reader: undefined,
      remainder: new Uint8Array(),
      responseBytes: 0,
      reading: false,
    };
    this.exchanges.set(id, exchange);
    return { status: "accepted" };
  }

  private async dispatch(id: string, exchange: Exchange): Promise<Reply> {
    exchange.phase = "dispatch";
    let dispatch: Dispatch | null;
    try {
      dispatch = this.network.prepare(exchange.target, exchange.headers);
    } catch {
      dispatch = null;
    }
    if (!dispatch) {
      this.end(id, exchange);
      return { status: "unavailable" };
    }
    const body = Buffer.concat(exchange.uploaded, exchange.requestBytes);
    exchange.uploaded.length = 0;
    try {
      const response = await dispatch(body, exchange.controller.signal);
      if (!response) {
        this.end(id, exchange);
        return { status: "unavailable" };
      }
      if (this.exchanges.get(id) !== exchange) {
        await response.body?.cancel().catch(() => {});
        return { status: "interrupted" };
      }
      // Manual redirects return their status. No second request is issued.
      exchange.reader = response.body?.getReader();
      exchange.phase = "stream";
      const requestId = response.headers.get(
        this.protocol === "anthropic" ? "request-id" : "x-request-id"
      );
      const retryAfter = response.headers.get("retry-after");
      const retryAfterMs =
        retryAfter && /^\d{1,12}$/.test(retryAfter)
          ? Number(retryAfter) * 1000
          : null;
      return {
        status: "ready",
        httpStatus: response.status,
        requestId:
          requestId && /^[a-z0-9_.:-]{1,128}$/i.test(requestId)
            ? requestId
            : null,
        retryAfterMs,
      };
    } catch {
      this.end(id, exchange);
      return { status: "interrupted" };
    }
  }

  private async read(id: string, exchange: Exchange): Promise<Reply> {
    exchange.reading = true;
    try {
      while (exchange.remainder.length === 0) {
        const next = await exchange.reader?.read();
        if (this.exchanges.get(id) !== exchange)
          return { status: "interrupted" };
        if (!next || next.done) {
          this.end(id, exchange);
          return { status: "end" };
        }
        exchange.responseBytes += next.value.length;
        if (exchange.responseBytes > exchange.maxResponseBytes) {
          this.end(id, exchange);
          return { status: "interrupted" };
        }
        exchange.remainder = next.value;
      }
      const chunk = exchange.remainder.subarray(0, READ_CHUNK);
      exchange.remainder = exchange.remainder.subarray(chunk.length);
      return { status: "chunk", data: Buffer.from(chunk).toString("base64") };
    } catch {
      this.end(id, exchange);
      return { status: "interrupted" };
    } finally {
      exchange.reading = false;
    }
  }

  private end(id: string, exchange: Exchange): void {
    if (this.exchanges.get(id) !== exchange) return;
    this.exchanges.delete(id);
    clearTimeout(exchange.timer);
    exchange.controller.abort();
    void exchange.reader?.cancel().catch(() => {});
  }
}

function providerTargets(
  protocol: Protocol,
  endpoint: string,
  model: string,
  llamaCppInputCount?: true
) {
  const base = new URL(endpoint);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error("native_provider_endpoint_invalid");
  if (
    llamaCppInputCount &&
    (protocol !== "openai-compatible" || !allowsLlamaCppInputCounting(base))
  )
    throw new Error("native_provider_input_count_unavailable");
  const prefix = base.pathname.replace(/\/$/, "");
  const routes = new Map<string, string>();
  const target = (suffix: string) => {
    const next = new URL(base);
    next.pathname = `${prefix}/${suffix}`;
    return next;
  };
  if (protocol === "openai-compatible") {
    routes.set(target("chat/completions").href, "text/event-stream");
    if (llamaCppInputCount)
      routes.set(
        target("chat/completions/input_tokens").href,
        "application/json"
      );
  } else if (protocol === "responses") {
    routes.set(target("responses").href, "text/event-stream");
    routes.set(target("responses/input_tokens").href, "application/json");
  } else if (protocol === "chatgpt-subscription") {
    if (`${endpoint}/responses` !== CHATGPT_RESPONSES_URL)
      throw new Error("native_provider_subscription_endpoint_invalid");
    routes.set(CHATGPT_RESPONSES_URL, "text/event-stream");
  } else if (protocol === "anthropic") {
    routes.set(target("messages").href, "text/event-stream");
  } else {
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(model))
      throw new Error("native_provider_model_invalid");
    const next = target(`models/${model}:streamGenerateContent`);
    next.searchParams.set("alt", "sse");
    routes.set(next.href, "text/event-stream");
  }
  return routes;
}

function providerHeaders(
  protocol: Protocol,
  accept: string,
  raw: unknown,
  capped?: true
) {
  if (!Array.isArray(raw) || raw.length > (capped ? 5 : 4)) return;
  const credential =
    protocol === "anthropic"
      ? "x-api-key"
      : protocol === "gemini"
        ? "x-goog-api-key"
        : "authorization";
  const allowed = new Set(["content-type", "accept"]);
  if (protocol !== "chatgpt-subscription") allowed.add(credential);
  if (protocol === "anthropic") allowed.add("anthropic-version");
  if (capped) allowed.add("x-gg-max-cost-mills");
  const headers = new Headers();
  for (const field of raw) {
    if (!Array.isArray(field) || field.length !== 2) return;
    const [name, value] = field;
    if (
      typeof name !== "string" ||
      !allowed.has(name) ||
      headers.has(name) ||
      typeof value !== "string" ||
      value.length === 0 ||
      value.length > 16_384 ||
      /[^\x20-\x7e]/.test(value)
    )
      return;
    headers.set(name, value);
  }
  if (
    headers.get("content-type") !== "application/json" ||
    headers.get("accept") !== accept ||
    (capped && !validCostCeiling(headers.get("x-gg-max-cost-mills"))) ||
    (protocol === "anthropic" &&
      headers.get("anthropic-version") !== "2023-06-01") ||
    (credential === "authorization" &&
      headers.has(credential) &&
      !/^Bearer [^ ]+$/.test(headers.get(credential)!))
  )
    return;
  return headers;
}

function validCostCeiling(value: string | null): boolean {
  return (
    value !== null &&
    value.length <= 64 &&
    /^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/.test(value) &&
    /[1-9]/.test(value)
  );
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function exchangeId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
}

function boundedInteger(value: unknown, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= max
  );
}

function decode(value: unknown): Buffer | undefined {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil(UPLOAD_CHUNK / 3) * 4
  )
    return;
  const bytes = Buffer.from(value, "base64");
  if (
    bytes.length &&
    bytes.length <= UPLOAD_CHUNK &&
    bytes.toString("base64") === value
  )
    return bytes;
}
