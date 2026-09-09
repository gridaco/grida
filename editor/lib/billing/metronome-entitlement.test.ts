// GRIDA-EE: billing — preserve the legacy gate wrapper without provider I/O.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn<
    (
      name: string,
      input: unknown
    ) => Promise<{
      data: unknown[] | null;
      error: { message: string } | null;
    }>
  >(),
}));
vi.mock("../supabase/server", () => ({ service_role: { workspace: { rpc } } }));
vi.mock("./index", () => ({ stripe: {} }));
vi.mock("@metronome/sdk", () => ({
  default: class {
    constructor() {
      throw new Error("Provider access is forbidden in this test");
    }
  },
}));
import { getEntitlement } from "./metronome";

describe("getEntitlement compatibility", () => {
  beforeEach(() => rpc.mockReset());
  it.each([
    { customer: null, balance: 100, entitled: true, reason: "not_provisioned" },
    { customer: "", balance: 100, entitled: true, reason: "not_provisioned" },
    {
      customer: "synthetic",
      balance: -1,
      entitled: true,
      reason: "below_floor",
    },
    {
      customer: "synthetic",
      balance: 24,
      entitled: false,
      reason: "below_floor",
    },
    {
      customer: "synthetic",
      balance: 25,
      entitled: false,
      reason: "no_balance",
    },
    { customer: "synthetic", balance: 25, entitled: true, reason: undefined },
  ])(
    "retains gate precedence for %#",
    async ({ customer, balance, entitled, reason }) => {
      rpc.mockResolvedValue({
        data: [
          {
            metronome_customer_id: customer,
            cached_balance_cents: balance,
            cached_balance_at: null,
            customer_entitled: entitled,
          },
        ],
        error: null,
      });
      expect(await getEntitlement(42)).toEqual({
        allowed: reason === undefined,
        ...(reason === undefined ? {} : { reason }),
        cachedBalanceCents: customer ? balance : 0,
        cachedAt: null,
      });
      expect(rpc).toHaveBeenCalledExactlyOnceWith(
        "fn_billing_get_metronome_account",
        { p_org: 42 }
      );
    }
  );
  it("keeps missing account behavior", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await getEntitlement(42)).toEqual({
      allowed: false,
      reason: "not_provisioned",
      cachedBalanceCents: 0,
      cachedAt: null,
    });
  });
  it("propagates database failure instead of returning a gate fallback", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "synthetic" } });
    await expect(getEntitlement(42)).rejects.toMatchObject({
      code: "db_error",
    });
  });
});
