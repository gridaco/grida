"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Dev-only boot: run the PROD `/desktop/*` surfaces in a plain browser
 * against a local agent daemon (issue #798; WG spec
 * docs/wg/ai/agent/daemon.md §the-browser-exception, path 2).
 *
 * There is deliberately no dedicated demo page — the production
 * workstation pages are the dev/test surface. This wrapper runs before
 * {@link DesktopBridgeGate}: when no Electron preload bridge exists and
 * daemon connection facts are present, it installs the web daemon
 * bridge as `window.grida`, then lets the gate render the real pages.
 *
 * How to use:
 *   1. `pnpm --filter @grida/agent cli serve --register \
 *        --allow-origin http://localhost:3000 --allow-referer-path /`
 *   2. open `/desktop/welcome?port=<PORT>#k=<PASSWORD>` (values from the
 *      serve output). The hash fragment keeps the credential out of
 *      server logs.
 *
 * The connection facts persist in `sessionStorage` once the handshake
 * succeeds, so reloads and direct links (e.g. `/desktop/workspace?id=…`)
 * keep working within the tab without re-carrying the params. A failed
 * handshake clears the stored facts and falls through to the gate's
 * normal web fallback.
 *
 * GRIDA-SEC-004 — this path exists only in development builds:
 * `process.env.NODE_ENV` is statically inlined, so production bundles
 * reduce this component to a pass-through and dead-code-eliminate the
 * bridge import. The desktop CSP already admits loopback connects
 * (`connect-src http://127.0.0.1:*`, see `editor/proxy.ts`), and the
 * daemon enforces its own origin allowlist — the browser cannot reach a
 * daemon that didn't opt this origin in at serve time.
 */
export function WebDaemonDevBoot({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV !== "development") return children;
  return <DevBoot>{children}</DevBoot>;
}

const STORAGE_KEY = "grida-dev:agent-daemon";

type StoredFacts = { port: string; k: string };

function DevBoot({ children }: { children: ReactNode }) {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void installFromContext().finally(() => {
      if (!cancelled) setSettled(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirror the gate's pending screen — blank until the install attempt
  // resolves, so the gate's single post-mount snapshot sees the final
  // state instead of racing the async handshake.
  if (!settled) {
    return <main className="min-h-svh w-full bg-background" />;
  }
  return children;
}

async function installFromContext(): Promise<void> {
  // An existing bridge wins: the Electron preload's, or a web bridge
  // already installed by a previous client-side navigation.
  if (window.grida) return;
  const facts = readUrlFacts() ?? readStoredFacts();
  if (!facts) return;
  try {
    const { createWebDaemonBridge } =
      await import("@/lib/agent-chat/web-daemon-bridge");
    const bridge = createWebDaemonBridge({
      base_url: `http://127.0.0.1:${facts.port}`,
      password: facts.k,
    });
    // The handshake proves reachability + credential before the bridge
    // is exposed to the desktop surfaces.
    await bridge.handshake();
    window.grida = bridge;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(facts));
  } catch (err) {
    sessionStorage.removeItem(STORAGE_KEY);
    console.warn("[web-daemon-dev-boot] daemon connect failed:", err);
  }
}

function readUrlFacts(): StoredFacts | null {
  const url = new URL(window.location.href);
  const port = url.searchParams.get("port");
  const k = new URLSearchParams(window.location.hash.replace(/^#/, "")).get(
    "k"
  );
  return port && k ? { port, k } : null;
}

function readStoredFacts(): StoredFacts | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredFacts>;
    return typeof parsed.port === "string" && typeof parsed.k === "string"
      ? { port: parsed.port, k: parsed.k }
      : null;
  } catch {
    return null;
  }
}
