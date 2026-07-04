// GRIDA-GG: provider — see docs/wg/platform/hosted-ai.md
/**
 * GRIDA-SEC-006 — GridaGatewaySessionStore.
 *
 * Pins: in-memory lifecycle (set/read/clear), the 30s expiry slack
 * boundary (expiring-soon reads as ABSENT — resolve-time refusal beats
 * an upstream 401), and that `status()` never contains the token.
 */
import { describe, it, expect } from "vitest";
import { GridaGatewaySessionStore } from "./gg-session";

const NOW = 1_700_000_000_000;

function store(expiresInMs: number): GridaGatewaySessionStore {
  const s = new GridaGatewaySessionStore();
  s.set({
    access_token: "jwt-secret-token",
    expires_at: NOW + expiresInMs,
    organization: { id: 7, name: "acme" },
  });
  return s;
}

describe("GridaGatewaySessionStore", () => {
  it("set → read → clear lifecycle", () => {
    const s = store(900_000);
    expect(s.getAccessToken(NOW)).toBe("jwt-secret-token");
    s.clear();
    expect(s.getAccessToken(NOW)).toBeNull();
    expect(s.status(NOW)).toEqual({ active: false });
    s.clear(); // idempotent
  });

  it("expiry slack: <=30s left reads as absent, 31s reads live", () => {
    expect(store(30_000).getAccessToken(NOW)).toBeNull();
    expect(store(29_000).getAccessToken(NOW)).toBeNull();
    expect(store(31_000).getAccessToken(NOW)).toBe("jwt-secret-token");
    expect(store(-1).getAccessToken(NOW)).toBeNull();
  });

  it("status reports presence + org but NEVER the token", () => {
    const s = store(900_000);
    const status = s.status(NOW);
    expect(status).toEqual({
      active: true,
      expires_at: NOW + 900_000,
      organization: { id: 7, name: "acme" },
    });
    expect(JSON.stringify(status)).not.toContain("jwt-secret-token");
    expect(store(10_000).status(NOW)).toEqual({ active: false });
  });
});
