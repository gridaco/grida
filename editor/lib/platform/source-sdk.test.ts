import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock("../supabase/server", () => ({
  service_role: { workspace: { rpc: mocks.rpc } },
}));
beforeEach(() => {
  vi.resetModules();
  mocks.rpc.mockReset();
  mocks.rpc.mockImplementation(async (...args) => ({
    data: { created: true, id: (args[1] as { work_id: string }).work_id },
    error: null,
  }));
  vi.stubEnv("GRIDA_BILLING_OWNER", "grida");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_local_no_network");
  vi.stubEnv("METRONOME_API_TOKEN", "synthetic_no_network");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it.each(["stripe", "metronome"] as const)(
  "%s SDK never retries ambiguous transport and rechecks cached client admission",
  async (provider) => {
    const transport = vi.fn<typeof fetch>(async () => {
      throw new Error("external response lost");
    });
    vi.stubGlobal("fetch", transport);
    const execute =
      provider === "stripe"
        ? () =>
            import("../billing").then(({ stripe }) =>
              stripe.customers.create({ name: "synthetic" })
            )
        : () =>
            import("../billing/metronome").then(({ metronome }) =>
              metronome.v1.usage.ingest({
                usage: [
                  {
                    transaction_id: "original_execution",
                    customer_id: "00000000-0000-4000-8000-000000000001",
                    event_type: "ai.usage",
                    timestamp: new Date().toISOString(),
                    properties: { cost_mills: 1 },
                  },
                ],
              })
            );
    await expect(execute()).rejects.toThrow(
      provider === "stripe" ? "connection to Stripe" : "Connection error"
    );
    expect(transport).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][0]).toBe("platform_source_work_begin");
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    await expect(execute()).rejects.toThrow(
      provider === "stripe" ? "connection to Stripe" : "Connection error"
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(transport).toHaveBeenCalledTimes(1);
  }
);
