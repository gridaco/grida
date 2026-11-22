"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@app/ui/components/button";
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
      <DesktopUpdateRequired
        requiredVersion={compatibility.desktopVersion}
        downloadHref={downloadHref}
      >
        Bridge protocol {String(status.protocol ?? "unavailable")} · Required{" "}
        {DESKTOP_BRIDGE_PROTOCOL}
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
      <DesktopUpdateRequired
        requiredVersion={compatibility.desktopVersion}
        downloadHref={downloadHref}
      >
        Installed version {installedVersion || "unknown"}
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
  requiredVersion,
  downloadHref,
}: {
  children: ReactNode;
  requiredVersion: string;
  downloadHref: string | null;
}) {
  return (
    <main className="flex h-svh w-full overflow-auto bg-black px-6 py-10 text-center text-neutral-100">
      <div className="m-auto flex w-full max-w-xl flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- static same-origin asset under the Desktop CSP */}
        <img
          src="/brand/grida-symbol-240-dark.svg"
          alt=""
          width={32}
          height={32}
          className="mb-8"
        />
        <h1 className="text-2xl font-medium tracking-tight">
          Update to continue
        </h1>
        <p className="mt-5 max-w-sm text-sm leading-relaxed text-neutral-400">
          Download Grida Desktop {requiredVersion} and reinstall the app.
        </p>
        {downloadHref && (
          <Button
            asChild
            className="mt-8 w-full max-w-xs bg-white text-black hover:bg-neutral-200 focus-visible:ring-white/70"
          >
            <a href={downloadHref} target="_blank" rel="noopener noreferrer">
              Download update
            </a>
          </Button>
        )}
        <footer className="mt-8 max-w-xs space-y-2 text-xs text-neutral-400">
          <p>
            We’ve updated how Grida works with the desktop app. Your installed
            version is no longer compatible.
          </p>
          <p className="tabular-nums">{children}</p>
        </footer>
      </div>
    </main>
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
