/**
 * Browser-engine system harness — the GRIDA-SEC-004 perimeter exercised
 * by the one client class Node tests cannot impersonate: a REAL browser
 * (WG spec docs/wg/ai/agent/daemon.md §conformance, issue #798).
 *
 * Runs inside Chromium (vitest browser mode) against two real daemons
 * booted by `test/browser-harness.global.ts`, each mounting the STUB
 * tenant (`test/browser-harness.origins.ts`):
 *
 *   - preflight + Basic-auth fetch from an allowlisted origin works E2E;
 *   - a non-allowlisted origin is refused BY THE BROWSER (CORS);
 *   - header-less `EventSource` attaches via the `auth_token` query on
 *     a tenant-declared SSE route, receives frames, survives
 *     detach/reattach;
 *   - the query token never authorizes anything but GET stream routes.
 *
 * This is a system harness for the perimeter contract — not product e2e.
 */
/// <reference lib="dom" />
import { describe, expect, inject, it } from "vitest";
import { DaemonTransport } from "../transport";
import {
  STUB_ECHO_PATH,
  STUB_SSE_EVENT,
  STUB_STREAM_PATH,
} from "../test/browser-harness.origins";

const base = inject("daemon_url");
const password = inject("daemon_password");
const foreignBase = inject("daemon_foreign_url");

const AUTH = DaemonTransport.buildBasicAuthHeader(password);
const TOKEN = encodeURIComponent(DaemonTransport.buildAuthToken(password));

type StubFrame = { id: string; state: string };

/** First stub frame off an EventSource, or a labeled failure. */
function firstFrame(
  url: string,
  timeoutMs = 8_000
): Promise<{ frame: StubFrame; source: EventSource }> {
  const source = new EventSource(url);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      source.close();
      reject(new Error("EventSource: no frame before timeout"));
    }, timeoutMs);
    source.addEventListener(STUB_SSE_EVENT, (event) => {
      clearTimeout(timer);
      resolve({
        frame: JSON.parse((event as MessageEvent).data) as StubFrame,
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

  it("EventSource to a non-allowlisted daemon never connects", async () => {
    await expect(
      firstFrame(`${foreignBase}${STUB_STREAM_PATH}/x?auth_token=${TOKEN}`)
    ).rejects.toThrow(/refused/);
  });
});

describe("header-less SSE attach via auth_token (EventSource)", () => {
  it("attaches to a tenant-declared stream route and receives the first frame", async () => {
    const { frame, source } = await firstFrame(
      `${base}${STUB_STREAM_PATH}/s1?auth_token=${TOKEN}`
    );
    source.close();
    expect(frame.state).toBe("idle");
    expect(frame.id).toBe("s1");
  });

  it("survives detach / reattach (a fresh attach replays)", async () => {
    const first = await firstFrame(
      `${base}${STUB_STREAM_PATH}/s2?auth_token=${TOKEN}`
    );
    first.source.close();
    const second = await firstFrame(
      `${base}${STUB_STREAM_PATH}/s2?auth_token=${TOKEN}`
    );
    second.source.close();
    expect(second.frame.state).toBe("idle");
  });

  it("refuses an attach with no credential", async () => {
    await expect(firstFrame(`${base}${STUB_STREAM_PATH}/s3`)).rejects.toThrow(
      /refused/
    );
  });

  it("refuses an attach with a wrong token", async () => {
    const wrong = encodeURIComponent(
      DaemonTransport.buildAuthToken("imposter")
    );
    await expect(
      firstFrame(`${base}${STUB_STREAM_PATH}/s4?auth_token=${wrong}`)
    ).rejects.toThrow(/refused/);
  });

  it("the token never authorizes a mutating route", async () => {
    const res = await fetch(`${base}${STUB_ECHO_PATH}?auth_token=${TOKEN}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it("the token never authorizes a daemon route outside the declared set", async () => {
    const res = await fetch(`${base}/workspaces/list?auth_token=${TOKEN}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
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

describe("header-authed SSE attach (fetch streaming)", () => {
  it("delivers the first frame over a fetch-read stream", async () => {
    const res = await fetch(`${base}${STUB_STREAM_PATH}/s5`, {
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
    expect(buffer).toContain(`event: ${STUB_SSE_EVENT}`);
    expect(buffer).toContain('"state":"idle"');
  });
});
