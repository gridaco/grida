"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  DESKTOP_BRIDGE_PROTOCOL,
  useDesktopBridgeStatus,
} from "@/lib/desktop/bridge";
import { OpenInDesktopCta } from "./open-in-desktop-cta";

const BRIDGE_SETTLE_DELAY_MS = 150;

/**
 * Render `children` only when the desktop bridge is present
 * (`window.grida` exposed by the Electron preload). Web visitors see
 * the fallback — by default {@link OpenInDesktopCta}.
 *
 * Gate **all** `/desktop/*` content through this component. The bridge
 * snapshot is intentionally ambiguous during SSR/hydration: `null`
 * means "unknown yet" before the first client-side check, but "not in
 * desktop" after that check. Keep both the desktop content and the web
 * fallback hidden until the ambiguity is resolved, otherwise Electron
 * windows can flash the web CTA for one frame before the preload bridge
 * is observed. GRIDA-SEC-004.
 */
export function DesktopBridgeGate({
  children,
  fallback,
  surface,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  /** Forwarded to the default CTA when `fallback` is omitted. */
  surface?: string;
}) {
  const status = useDesktopBridgeStatus();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (status.kind !== "missing") {
      setChecked(true);
      return;
    }
    const timer = window.setTimeout(
      () => setChecked(true),
      BRIDGE_SETTLE_DELAY_MS
    );
    return () => window.clearTimeout(timer);
  }, [status.kind]);

  if (!checked) {
    return <DesktopBridgePending />;
  }

  if (status.kind === "missing") {
    return fallback ?? <OpenInDesktopCta surface={surface} />;
  }
  if (status.kind === "unsupported") {
    return <UnsupportedDesktopBridge protocol={status.protocol} />;
  }
  return children;
}

function DesktopBridgePending() {
  return (
    <main
      aria-label="Loading Grida Desktop"
      className="min-h-svh w-full bg-background"
    />
  );
}

function UnsupportedDesktopBridge({ protocol }: { protocol: unknown }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col items-center justify-center px-6 py-10 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Update Grida Desktop
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        This desktop page needs bridge protocol {DESKTOP_BRIDGE_PROTOCOL}, but
        the running app exposed {String(protocol ?? "no protocol")}.
      </p>
    </main>
  );
}
