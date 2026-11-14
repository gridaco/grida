/**
 * Browser-engine system harness — the GRIDA-SEC-004 perimeter exercised
 * by the one client class Node tests cannot impersonate: a REAL browser
 * (WG spec docs/wg/ai/agent/daemon.md §conformance, issue #798).
 *
 * Runs inside Chromium (vitest browser mode) against two real daemons
 * booted by `test/browser-harness.global.ts`:
 *
 *   - preflight + Basic-auth fetch from an allowlisted origin works E2E;
 *   - a non-allowlisted origin is refused BY THE BROWSER (CORS);
 *   - a header-less request carrying the credential in the query string
 *     is refused.
 *
 * This is a system harness for the perimeter contract — not product e2e.
 */
/// <reference lib="dom" />
import { describe, expect, inject, it } from "vitest";
import { DaemonTransport } from "../transport";

const base = inject("daemon_url");
const password = inject("daemon_password");
const foreignBase = inject("daemon_foreign_url");

const AUTH = DaemonTransport.buildBasicAuthHeader(password);
const QUERY_CREDENTIAL = encodeURIComponent(AUTH.slice("Basic ".length));

describe("authenticated fetch from an allowlisted origin", () => {
  it("completes a preflighted handshake end-to-end", async () => {
    const res = await fetch(`${base}/handshake`, {
      method: "POST",
      headers: { authorization: AUTH },
    });
    expect(res.ok).toBe(true);
    const handshake = (await res.json()) as { protocol: number };
    expect(typeof handshake.protocol).toBe("number");
  });

  it("a missing credential is a readable 401 (CORS headers on early returns)", async () => {
    const res = await fetch(`${base}/handshake`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("a wrong credential is a readable 401", async () => {
    const res = await fetch(`${base}/handshake`, {
      method: "POST",
      headers: {
        authorization: DaemonTransport.buildBasicAuthHeader("imposter"),
      },
    });
    expect(res.status).toBe(401);
  });
});

describe("non-allowlisted origin (the browser is the enforcer)", () => {
  it("fetch to a daemon that does not allowlist this origin is blocked", async () => {
    // Same (valid!) credential — the refusal under test is the browser's
    // CORS enforcement, which no forged-header Node test can prove.
    await expect(
      fetch(`${foreignBase}/handshake`, {
        method: "POST",
        headers: { authorization: AUTH },
      })
    ).rejects.toThrow(/fetch/i);
  });
});

describe("header-only credential carriage", () => {
  it("refuses a header-less request carrying the credential in the query", async () => {
    const res = await fetch(
      `${base}/handshake?auth_token=${QUERY_CREDENTIAL}`,
      {
        method: "POST",
      }
    );
    expect(res.status).toBe(401);
  });
});

describe("DaemonTransport.Client from a real browser", () => {
  // Pins the receiver-binding of the Client's default fetch: a browser
  // throws "Illegal invocation" when the global fetch is invoked with a
  // non-window `this` (e.g. stored on a class property). Node tolerates
  // any receiver, so ONLY this harness can catch a regression.
  it("performs the handshake through the Client", async () => {
    const client = new DaemonTransport.Client({ base_url: base, password });
    const handshake = await client.handshake();
    expect(typeof handshake.protocol).toBe("number");
  });

  it("authenticates even when the page's referrer policy is no-referrer", async () => {
    // Pins `referrerPolicy: "unsafe-url"` on the Client's fetch: pages like
    // `/desktop/*` ship `Referrer-Policy: no-referrer` (GRIDA-SEC-004),
    // which would strip the Referer the server's guard requires. The
    // per-request override must win over the document policy.
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);
    try {
      // Control: a bare fetch under this policy really is stripped of its
      // Referer — the guard refuses it (403 "referer required").
      const bare = await fetch(`${base}/handshake`, {
        method: "POST",
        headers: { authorization: AUTH },
      });
      expect(bare.status).toBe(403);
      const client = new DaemonTransport.Client({ base_url: base, password });
      const handshake = await client.handshake();
      expect(typeof handshake.protocol).toBe("number");
    } finally {
      // Removing the meta does NOT re-process the document policy
      // (insertion and content changes do) — restore the default
      // explicitly so later tests keep their Referer.
      meta.content = "strict-origin-when-cross-origin";
      meta.remove();
    }
  });
});
