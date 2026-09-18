// GRIDA-EE: billing — organization-funded media and actual provider charges.
// GRIDA-GG: gateway — request-specific fal charges, never display-price estimates.
// GRIDA-SEC-003 / GRIDA-SEC-006 — bounded receipts through the fixed server transport.
import "server-only";
import type { ProviderHttp } from "@grida/ai";

/** fal's billing API requires an admin key, isolated from inference and asset requests. */
export namespace GgFalBilling {
  const endpoint = "https://api.fal.ai/v1/models/billing-events";

  /** Verify billing authority before spending. An empty page for this probe is expected. */
  export async function preflight(
    http: ProviderHttp,
    key: string,
    model: string
  ): Promise<void> {
    await page(
      http,
      key,
      model,
      "grida-billing-preflight",
      AbortSignal.timeout(10_000)
    );
  }

  /** Return actual charged nano-USD. A missing receipt is unknown, never a zero-cost success. */
  export async function charge(
    http: ProviderHttp,
    key: string,
    model: string,
    request: string
  ): Promise<number> {
    const controller = new AbortController();
    const signal = controller.signal;
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      for (;;) {
        const events = await page(http, key, model, request, signal);
        if (events.length) {
          const event = events[0];
          if (
            !record(event) ||
            event.endpoint_id !== model ||
            event.request_id !== request ||
            typeof event.cost_total !== "number" ||
            !Number.isFinite(event.cost_total) ||
            event.cost_total < 0
          )
            throw new Error("usage_unavailable");
          // fal reports USD to sub-cent precision. Round floating-point representation
          // to nano-USD, then round the aggregate once at the existing mill ledger seam.
          const nanos = Math.round(event.cost_total * 1e9);
          if (!Number.isSafeInteger(nanos))
            throw new Error("usage_unavailable");
          return nanos;
        }
        await new Promise<void>((resolve, reject) => {
          const abort = () => {
            clearTimeout(timer);
            reject(new Error("usage_unavailable"));
          };
          const timer = setTimeout(() => {
            signal.removeEventListener("abort", abort);
            resolve();
          }, 1_000);
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) abort();
        });
      }
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  async function page(
    http: ProviderHttp,
    key: string,
    model: string,
    request: string,
    signal: AbortSignal
  ): Promise<unknown[]> {
    const url = new URL(endpoint);
    url.search = new URLSearchParams({
      endpoint_id: model,
      request_id: request,
      limit: "2",
    }).toString();
    const response = await http.request(url, {
      headers: { authorization: `Key ${key}`, accept: "application/json" },
      signal,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
    });
    if (
      !response.ok ||
      !response.body ||
      Number(response.headers.get("content-length")) > 64 * 1024
    ) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error("usage_unavailable");
    }
    const reader = response.body.getReader();
    const cancel = () => {
      void reader.cancel().catch(() => undefined);
    };
    signal.addEventListener("abort", cancel, { once: true });
    let size = 0,
      text = "";
    const decoder = new TextDecoder("utf-8", { fatal: true });
    try {
      for (;;) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        size += value.byteLength;
        if (size > 64 * 1024) throw new Error("usage_unavailable");
        text += decoder.decode(value, { stream: true });
      }
      const body: unknown = JSON.parse(text + decoder.decode());
      if (
        !record(body) ||
        !Array.isArray(body.billing_events) ||
        body.billing_events.length > 1 ||
        body.has_more !== false ||
        body.next_cursor != null
      )
        throw new Error("usage_unavailable");
      return body.billing_events;
    } finally {
      signal.removeEventListener("abort", cancel);
      cancel();
      reader.releaseLock();
    }
  }

  function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
