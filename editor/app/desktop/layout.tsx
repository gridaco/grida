import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DesktopBridgeGate } from "@/scaffolds/desktop/desktop-bridge-gate";
import "../editor.css";

/**
 * Root layout for the Grida Desktop workstation routes (`/desktop/*`).
 *
 * Grida's `app/` directory has **no shared root layout**; each top-level
 * segment defines its own `<html>` + `<body>` and pulls in the editor's
 * global stylesheet (see `editor/CLAUDE.md` and `(canvas)/layout.tsx`
 * for the canonical sibling shape). Without the `<html>`/`<body>` tags
 * here Next.js bails with `NEXT_MISSING_ROOT_TAGS` and refuses to
 * inject stylesheet links — exactly the bug we shipped past in the
 * first cut of this layout.
 *
 * All `/desktop/*` pages then pass through {@link DesktopBridgeGate}:
 * inside Electron the gate renders the workstation chrome; on the web
 * it falls back to `<OpenInDesktopCta />`. The per-request CSP for
 * `/desktop/*` is set in `editor/proxy.ts` (nonce + `'strict-dynamic'`)
 * — that's the layer-5 piece of GRIDA-SEC-004; the bridge gate is
 * layer-1.
 *
 * We deliberately do NOT wire `PlatformProvider`/`useHost` here — the
 * old "am I in the wrapper" surface lives on under `editor/host/` but
 * is not the desktop bridge. Desktop code reads `useDesktopBridge()`
 * from `@/lib/desktop/bridge`.
 */

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Grida Desktop",
  robots: { index: false, follow: false },
};

export default async function DesktopRootLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Pulled from the request headers `editor/proxy.ts` sets — see
  // GRIDA-SEC-004. `next-themes` injects a synchronous theme-detection
  // script before paint to avoid FOUC; without a nonce that script is
  // blocked by the strict CSP. Passing the nonce through the
  // `ThemeProvider` is the canonical fix.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.className} h-svh overflow-hidden bg-background`}
      >
        <ThemeProvider nonce={nonce}>
          <TooltipProvider>
            <DesktopBridgeGate>{children}</DesktopBridgeGate>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
