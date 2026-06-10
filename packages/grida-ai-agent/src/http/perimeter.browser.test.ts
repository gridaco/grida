/**
 * Browser-engine system harness — the GRIDA-SEC-004 perimeter exercised
 * by the one client class Node tests cannot impersonate: a REAL browser
 * (WG spec docs/wg/ai/agent/daemon.md §conformance, issue #798).
 *
 * Runs inside Chromium (vitest browser mode) against two real AgentHosts
 * booted by `test/browser-harness.global.ts`:
 *
 *   - preflight + Basic-auth fetch from an allowlisted origin works E2E;
 *   - a non-allowlisted origin is refused BY THE BROWSER (CORS);
 *   - header-less `EventSource` attaches via the `auth_token` query on
 *     SSE routes, receives ordered frames, survives detach/reattach;
 *   - the query token never authorizes anything but GET stream routes.
 *
 * This is a system harness for the perimeter contract — not product e2e.
 */
import { describe, expect, inject, it } from "vitest";
import { AgentTransport } from "../transport";
import { AGENT_SESSION_AGENT } from "../protocol/run";
import {
  GRIDA_STATUS_SSE_EVENT,
  type SessionStatus,
} from "../protocol/session-status";

const base = inject("agent_url");
const password = inject("agent_password");
const foreignBase = inject("agent_foreign_url");

const AUTH = AgentTransport.buildBasicAuthHeader(password);
const TOKEN = encodeURIComponent(AgentTransport.buildAuthToken(password));

async function createSession(): Promise<string> {
  const res = await fetch(`${base}/sessions`, {
    method: "POST",
    headers: { authorization: AUTH, "content-type": "application/json" },
    body: JSON.stringify({ agent: AGENT_SESSION_AGENT }),
  });
  expect(res.ok).toBe(true);
  const row = (await res.json()) as { id: string };
  return row.id;
}

/** First status frame off an EventSource, or a labeled failure. */
function firstStatus(
  url: string,
  timeoutMs = 8_000
): Promise<{ status: SessionStatus; source: EventSource }> {
  const source = new EventSource(url);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      source.close();
      reject(new Error("EventSource: no status frame before timeout"));
    }, timeoutMs);
    source.addEventListener(GRIDA_STATUS_SSE_EVENT, (event) => {
      clearTimeout(timer);
      resolve({
        status: JSON.parse((event as MessageEvent).data) as SessionStatus,
        source,
      });
    });
    source.onerror = () => {
      clearTimeout(timer);
      source.close();
      reject(new Error("EventSource: connection refused"));
    };
  });
}

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
        authorization: AgentTransport.buildBasicAuthHeader("imposter"),
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

  it("EventSource to a non-allowlisted daemon never connects", async () => {
    await expect(
      firstStatus(`${foreignBase}/sessions/x/status?auth_token=${TOKEN}`)
    ).rejects.toThrow(/refused/);
  });
});

describe("header-less SSE attach via auth_token (EventSource)", () => {
  it("attaches and receives the current status as the first frame", async () => {
    const id = await createSession();
    const { status, source } = await firstStatus(
      `${base}/sessions/${id}/status?auth_token=${TOKEN}`
    );
    source.close();
    expect(status.state).toBe("idle");
  });

  it("survives detach / reattach (a fresh attach replays current state)", async () => {
    const id = await createSession();
    const first = await firstStatus(
      `${base}/sessions/${id}/status?auth_token=${TOKEN}`
    );
    first.source.close();
    const second = await firstStatus(
      `${base}/sessions/${id}/status?auth_token=${TOKEN}`
    );
    second.source.close();
    expect(second.status.state).toBe("idle");
  });

  it("refuses an attach with no credential", async () => {
    const id = await createSession();
    await expect(firstStatus(`${base}/sessions/${id}/status`)).rejects.toThrow(
      /refused/
    );
  });

  it("refuses an attach with a wrong token", async () => {
    const id = await createSession();
    const wrong = encodeURIComponent(AgentTransport.buildAuthToken("imposter"));
    await expect(
      firstStatus(`${base}/sessions/${id}/status?auth_token=${wrong}`)
    ).rejects.toThrow(/refused/);
  });

  it("the token never authorizes a mutating route", async () => {
    const res = await fetch(`${base}/sessions?auth_token=${TOKEN}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent: AGENT_SESSION_AGENT }),
    });
    expect(res.status).toBe(401);
  });
});

describe("AgentTransport.Client from a real browser", () => {
  // Pins the receiver-binding of the Client's default fetch: a browser
  // throws "Illegal invocation" when the global fetch is invoked with a
  // non-window `this` (e.g. stored on a class property). Node tolerates
  // any receiver, so ONLY this harness can catch a regression.
  it("performs the handshake through the Client", async () => {
    const client = new AgentTransport.Client({ base_url: base, password });
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
      const client = new AgentTransport.Client({ base_url: base, password });
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

  it("creates a session and receives the first status frame", async () => {
    const client = new AgentTransport.Client({ base_url: base, password });
    const row = await client.sessions.create({ agent: AGENT_SESSION_AGENT });
    const controller = new AbortController();
    const status = await new Promise<SessionStatus>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("no status frame before timeout")),
        8_000
      );
      void client.sessions
        .subscribe_status(
          row.id,
          (s) => {
            clearTimeout(timer);
            resolve(s);
          },
          { signal: controller.signal }
        )
        .catch(reject);
    });
    controller.abort();
    expect(status.state).toBe("idle");
  });
});

describe("header-authed SSE attach (fetch streaming)", () => {
  it("delivers the first status frame over a fetch-read stream", async () => {
    const id = await createSession();
    const res = await fetch(`${base}/sessions/${id}/status`, {
      headers: { authorization: AUTH, accept: "text/event-stream" },
    });
    expect(res.ok).toBe(true);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!buffer.includes("\n\n")) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
    }
    await reader.cancel();
    expect(buffer).toContain(`event: ${GRIDA_STATUS_SSE_EVENT}`);
    expect(buffer).toContain('"state":"idle"');
  });
});
