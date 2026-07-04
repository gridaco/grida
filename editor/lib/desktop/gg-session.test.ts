// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: desktop — see docs/wg/platform/hosted-ai.md
/**
 * Renderer token-lifecycle owner.
 *
 * Pins: single-flight mint, the 5-min refresh window (fresh sessions
 * are one compare, no IO), 401→signed_out / 409→no_organization with a
 * daemon clear, unsupported bridge = all no-ops, never-throws, the
 * token is pushed to the daemon but NOT retained renderer-side, and
 * the message-substring error detectors.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const set_session = vi.fn<(s: unknown) => Promise<void>>();
const clear_session = vi.fn<() => Promise<void>>();
let bridgeCloud: object | null = {
  set_session,
  clear_session,
  status: async () => ({ active: false }),
};
vi.mock("@/lib/desktop/bridge", () => ({
  getDesktopBridge: () => (bridgeCloud ? { gg: bridgeCloud } : null),
}));

import * as gridaGateway from "./gg-session";

const realFetch = globalThis.fetch;
const fetchMock = vi.fn<() => Promise<Response>>();

function mintOk(expiresInMs = 900_000): void {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        token: "jwt-abc",
        expires_at: new Date(Date.now() + expiresInMs).toISOString(),
        organization: { id: 7, name: "acme" },
      }),
      { status: 200 }
    )
  );
}

beforeEach(() => {
  gridaGateway.__unsafe_reset_for_tests();
  bridgeCloud = { set_session, clear_session, status: async () => ({}) };
  set_session.mockReset().mockResolvedValue(undefined);
  clear_session.mockReset().mockResolvedValue(undefined);
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("ensureFresh", () => {
  it("mints, pushes to the daemon, retains only expiry+org", async () => {
    mintOk();
    const state = await gridaGateway.ensureFresh();
    expect(state.kind).toBe("active");
    expect(fetchMock).toHaveBeenCalledWith("/desktop/auth/token", {
      method: "POST",
    });
    expect(set_session).toHaveBeenCalledTimes(1);
    const pushed = set_session.mock.calls[0]![0] as { access_token: string };
    expect(pushed.access_token).toBe("jwt-abc");
    // Renderer-side state never contains the token.
    expect(JSON.stringify(gridaGateway.peek())).not.toContain("jwt-abc");
  });

  it("is a no-op while >5min remain; re-mints when close to expiry", async () => {
    mintOk(900_000);
    await gridaGateway.ensureFresh();
    await gridaGateway.ensureFresh();
    expect(fetchMock).toHaveBeenCalledTimes(1); // fresh → one compare

    gridaGateway.__unsafe_reset_for_tests();
    mintOk(4 * 60_000); // less than the 5-min slack
    await gridaGateway.ensureFresh();
    await gridaGateway.ensureFresh(); // near-expiry → re-mint
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("single-flight: concurrent callers share one mint", async () => {
    mintOk();
    await Promise.all([
      gridaGateway.ensureFresh(),
      gridaGateway.ensureFresh(),
      gridaGateway.ensureFresh(),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("401 → signed_out + daemon clear; 409 → no_organization", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    expect((await gridaGateway.ensureFresh()).kind).toBe("signed_out");
    expect(clear_session).toHaveBeenCalled();
    expect(set_session).not.toHaveBeenCalled();

    gridaGateway.__unsafe_reset_for_tests();
    fetchMock.mockResolvedValue(new Response("{}", { status: 409 }));
    expect((await gridaGateway.ensureFresh()).kind).toBe("no_organization");
  });

  it("never throws: network failure degrades to error state", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    expect((await gridaGateway.ensureFresh()).kind).toBe("error");
  });

  it("unsupported bridge: everything is a no-op", async () => {
    bridgeCloud = null;
    expect(gridaGateway.isSupported()).toBe(false);
    expect((await gridaGateway.ensureFresh()).kind).toBe("unsupported");
    await gridaGateway.clear(); // must not throw
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("error detectors (contextBridge-flattened messages)", () => {
  it("detect by leading literal code substring", () => {
    expect(
      gridaGateway.isGgTokenExpired(
        new Error("gg_token_expired: the Grida session token is missing")
      )
    ).toBe(true);
    expect(gridaGateway.isGgTokenExpired("gg_token_expired")).toBe(true);
    expect(
      gridaGateway.isGgInsufficientCredits(new Error("insufficient_credits"))
    ).toBe(true);
    expect(gridaGateway.isGgTokenExpired(new Error("other"))).toBe(false);
    expect(gridaGateway.isGgInsufficientCredits(undefined)).toBe(false);
  });
});
