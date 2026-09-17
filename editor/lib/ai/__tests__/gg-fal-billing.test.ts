// GRIDA-EE: billing — organization-funded media and actual provider charges.
// GRIDA-GG: gateway — synthetic exact-charge receipts; never live provider requests.
// GRIDA-SEC-003 / GRIDA-SEC-006 — receipt identity and bounded, credential-free results.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderHttp } from "@grida/ai";
import { GgFalBilling } from "../gg-fal-billing";

const endpoint = "google/gemini-omni-flash/v1.1/text-to-video";
const requestId = "synthetic-request";
const admin = "synthetic-admin-key";
const request = vi.fn<ProviderHttp["request"]>();
const http = { request } as unknown as ProviderHttp;
const event = (extra: Record<string, unknown> = {}) => ({
  endpoint_id: endpoint,
  request_id: requestId,
  cost_total: 0.0375,
  // Display-rate and receipt-shaped fields cannot replace cost_total.
  output_units: 999,
  unit_price: 999,
  cost_estimate_nano_usd: 999,
  ...extra,
});
const page = (
  events: unknown[] = [event()],
  extra: Record<string, unknown> = {}
) =>
  Response.json({
    billing_events: events,
    has_more: false,
    next_cursor: null,
    ...extra,
  });
const charge = () => GgFalBilling.charge(http, admin, endpoint, requestId);

beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async () => page());
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GgFalBilling exact receipts", () => {
  it("returns only actual nano-USD for the exact selected endpoint and request", async () => {
    expect(await charge()).toBe(37_500_000);
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0]!;
    const parsed = new URL(String(url));
    expect(parsed.origin + parsed.pathname).toBe(
      "https://api.fal.ai/v1/models/billing-events"
    );
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      endpoint_id: endpoint,
      request_id: requestId,
      limit: "2",
    });
    expect(new Headers(options?.headers).get("authorization")).toBe(
      `Key ${admin}`
    );
    expect(options).toMatchObject({
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
    });
  });

  it("preserves an observed zero charge", async () => {
    request.mockImplementation(async () => page([event({ cost_total: 0 })]));
    expect(await charge()).toBe(0);
  });

  it("preflights billing authority with a non-spending empty receipt query", async () => {
    request.mockImplementation(async () => page([]));
    await expect(
      GgFalBilling.preflight(http, admin, endpoint)
    ).resolves.toBeUndefined();
    expect(
      new URL(String(request.mock.calls[0]![0])).searchParams.get("request_id")
    ).toBe("grida-billing-preflight");
    expect(request.mock.calls[0]![1]?.body).toBeUndefined();
  });

  it.each([
    { endpoint_id: "other/model" },
    { request_id: "other-request" },
    { cost_total: -1 },
    { cost_total: "0.0375" },
    { cost_total: null },
    { cost_total: undefined },
    { cost_total: Number.MAX_SAFE_INTEGER },
  ])("rejects unusable receipt facts %j", async (extra) => {
    request.mockImplementation(async () => page([event(extra)]));
    await expect(charge()).rejects.toThrow("usage_unavailable");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("rejects a nonfinite JSON number", async () => {
    request.mockImplementation(
      async () =>
        new Response(
          `{"billing_events":[{"endpoint_id":"${endpoint}","request_id":"${requestId}","cost_total":1e999}],"has_more":false,"next_cursor":null}`
        )
    );
    await expect(charge()).rejects.toThrow("usage_unavailable");
  });

  it.each([
    { events: [event(), event()], extra: {} },
    { events: [event()], extra: { has_more: true } },
    { events: [event()], extra: { next_cursor: "untrusted-cursor" } },
    { events: [event()], extra: { has_more: undefined } },
    { events: [null], extra: {} },
  ])(
    "rejects ambiguous, paginated or malformed receipt pages %#",
    async ({ events, extra }) => {
      request.mockImplementation(async () => page(events, extra));
      await expect(charge()).rejects.toThrow("usage_unavailable");
    }
  );

  it.each([401, 403, 429, 500])(
    "never exposes a provider error body for HTTP %s",
    async (status) => {
      request.mockImplementation(
        async () =>
          new Response("synthetic-private-provider-diagnostic", { status })
      );
      await expect(charge()).rejects.toThrow(/^usage_unavailable$/);
    }
  );

  it("refuses an oversized declared body without reading it", async () => {
    const cancel = vi.fn<() => void>();
    request.mockImplementation(
      async () =>
        new Response(new ReadableStream({ cancel }), {
          headers: { "content-length": "65537" },
        })
    );
    await expect(charge()).rejects.toThrow("usage_unavailable");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("enforces the streamed body bound when no size is declared", async () => {
    const cancel = vi.fn<() => void>();
    request.mockImplementation(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(65_537).fill(32));
            },
            cancel,
          })
        )
    );
    await expect(charge()).rejects.toThrow("usage_unavailable");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("waits for a delayed receipt without turning a missing page into free usage", async () => {
    vi.useFakeTimers();
    request.mockImplementationOnce(async () => page([]));
    const result = charge();
    const assertion = expect(result).resolves.toBe(37_500_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(request).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds missing-receipt polling and clears all timers", async () => {
    vi.useFakeTimers();
    request.mockImplementation(async () => page([]));
    const assertion = expect(charge()).rejects.toThrow("usage_unavailable");
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
    expect(request.mock.calls.length).toBeGreaterThan(1);
    expect(request.mock.calls.length).toBeLessThanOrEqual(20);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a stalled response body when the receipt deadline expires", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn<() => void>();
    request.mockImplementation(
      async () => new Response(new ReadableStream({ cancel }))
    );
    const assertion = expect(charge()).rejects.toBeInstanceOf(Error);
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
