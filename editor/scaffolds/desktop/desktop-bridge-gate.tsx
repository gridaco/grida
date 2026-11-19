"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DesktopCompatibility } from "@grida/desktop-bridge";
import {
  DESKTOP_BRIDGE_PROTOCOL,
  useDesktopBridgeStatus,
} from "@/lib/desktop/bridge";
import { OpenInDesktopCta } from "./open-in-desktop-cta";

const BRIDGE_SETTLE_DELAY_MS = 150;

/**
 * Render `children` only when the preload bridge and installed app are
 * compatible. Web visitors see the fallback, by default {@link OpenInDesktopCta}.
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
  compatibility,
  fallback,
  surface,
}: {
  children: ReactNode;
  compatibility: DesktopCompatibility.Handshake | null;
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
  if (!compatibility) {
    return (
      <DesktopCompatibilityNotice
        title="Couldn’t check compatibility"
        action={
          <button
            className="mt-6 text-sm font-medium underline"
            type="button"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        }
      >
        Retry the compatibility check to open Grida Desktop.
      </DesktopCompatibilityNotice>
    );
  }
  const downloadHref = DesktopCompatibility.releaseUrl(
    compatibility.desktopVersion
  );
  if (status.kind === "unsupported") {
    return (
      <DesktopUpdateRequired downloadHref={downloadHref}>
        This desktop page needs bridge protocol {DESKTOP_BRIDGE_PROTOCOL}, but
        the running app exposed {String(status.protocol ?? "no protocol")}.
      </DesktopUpdateRequired>
    );
  }
  const bridgeVersion = status.bridge.app?.version;
  const installedVersion =
    typeof bridgeVersion === "string" ? bridgeVersion : "";
  if (
    DesktopCompatibility.requiresUpdate(
      installedVersion,
      compatibility.desktopVersion
    )
  ) {
    return (
      <DesktopUpdateRequired downloadHref={downloadHref}>
        This page requires a newer version of Grida Desktop. Installed version:{" "}
        {installedVersion || "unknown"}.
      </DesktopUpdateRequired>
    );
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

function DesktopUpdateRequired({
  children,
  downloadHref,
}: {
  children: ReactNode;
  downloadHref: string | null;
}) {
  return (
    <DesktopCompatibilityNotice
      title="Update Grida Desktop"
      action={
        downloadHref && (
          <a
            className="mt-6 text-sm font-medium underline"
            href={downloadHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            Download Grida Desktop
          </a>
        )
      }
    >
      {children}
    </DesktopCompatibilityNotice>
  );
}

function DesktopCompatibilityNotice({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col items-center justify-center px-6 py-10 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{children}</p>
      {action}
    </main>
  );
}
