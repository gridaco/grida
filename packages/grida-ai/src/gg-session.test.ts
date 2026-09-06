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

  it("snapshots input and status metadata without exposing credential fields", () => {
    const session = {
      access_token: "private-token",
      expires_at: NOW + 900_000,
      organization: { id: 7, name: "acme", access_token: "private-token" },
    };
    const current = new GridaGatewaySessionStore();
    current.set(session);
    session.access_token = "changed";
    session.organization.name = "changed";
    const status = current.status(NOW);
    status.organization!.name = "changed-again";
    expect(current.getAccessToken(NOW)).toBe("private-token");
    expect(current.status(NOW)).toEqual({
      active: true,
      expires_at: NOW + 900_000,
      organization: { id: 7, name: "acme" },
    });
    expect(JSON.stringify(current)).toBe("{}");
  });

  it("malformed expiry or empty token cannot become active", () => {
    const current = new GridaGatewaySessionStore();
    for (const expires_at of [NaN, Infinity, NOW + 0.5]) {
      current.set({ access_token: "private-token", expires_at });
      expect(current.status(NOW)).toEqual({ active: false });
    }
    current.set({ access_token: " ", expires_at: NOW + 900_000 });
    expect(current.getAccessToken(NOW)).toBeNull();
  });
});
