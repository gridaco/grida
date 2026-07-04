// GRIDA-EE: billing — see ee-billing
/**
 * GET /desktop/billing/summary.
 *
 * Pins: signed-out is a 200 state (never an error, seam never invoked),
 * the seam result crosses the wire verbatim for the session user, seam
 * failures collapse to an opaque `summary_failed` (internal error text —
 * Metronome/Postgres — must never reach the renderer), and every response
 * is `no-store`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser =
  vi.fn<() => Promise<{ data: { user: { id: string } | null } }>>();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

const getDesktopBillingSummary = vi.fn<(user_id: string) => Promise<unknown>>();
vi.mock("@/lib/desktop/billing", () => ({
  getDesktopBillingSummary: (user_id: string) =>
    getDesktopBillingSummary(user_id),
}));

import { GET } from "./route";

beforeEach(() => {
  getUser.mockReset();
  getDesktopBillingSummary.mockReset();
});

describe("GET /desktop/billing/summary", () => {
  it("responds 200 signed_out without invoking the seam", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ state: "signed_out" });
    expect(getDesktopBillingSummary).not.toHaveBeenCalled();
  });

  it("returns the seam summary verbatim for the session user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const summary = {
      state: "ready",
      organization: { id: 7, name: "acme", display_name: "Acme Inc." },
      plan: "pro",
      credits: {
        balance_cents: 512,
        entitled: true,
        blocked_reason: null,
        as_of: "2026-07-03T00:00:00Z",
      },
      manage_path: "/organizations/acme/settings/billing",
    };
    getDesktopBillingSummary.mockResolvedValue(summary);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(summary);
    expect(getDesktopBillingSummary).toHaveBeenCalledWith("user-1");
  });

  it("collapses seam failures to an opaque summary_failed", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getDesktopBillingSummary.mockRejectedValue(
      new Error("METRONOME_API_TOKEN is required")
    );
    const response = await GET();
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = JSON.stringify(await response.json());
    expect(body).toBe(JSON.stringify({ error: "summary_failed" }));
    expect(body).not.toContain("METRONOME");
  });
});
