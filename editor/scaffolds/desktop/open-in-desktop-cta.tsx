"use client";

import Link from "next/link";
import { Download, ExternalLink } from "lucide-react";
import { Button } from "@app/ui/components/button";

/**
 * Rendered by the desktop route layout when the page is loaded outside
 * the desktop app (`window.grida` absent). Per the capability-boundary
 * rule (`docs/wg/desktop/renderer-bridge.md` and `/SECURITY.md`
 * GRIDA-SEC-004), the boundary is **visible**: web visitors get a
 * download CTA, not a degraded editor.
 */
export function OpenInDesktopCta({
  surface = "this page",
  tryWebHref = "/svg",
  downloadHref = "/downloads",
}: {
  /** Human-readable name of the desktop-only surface (e.g. "the SVG workstation"). */
  surface?: string;
  /** Optional href for "Try the web demo" — defaults to the public `/svg` route. */
  tryWebHref?: string | null;
  /** Where the "Download Grida Desktop" button points. */
  downloadHref?: string;
}) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col items-center justify-center px-6 py-10 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Open in Grida Desktop
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {surface} runs inside the Grida Desktop app, which has access to your
        local filesystem, OS keychain, and BYOK AI providers. Your browser
        can&rsquo;t reach those.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <Button asChild size="lg">
          <Link href={downloadHref} prefetch={false}>
            <Download className="size-4" />
            Download Grida Desktop
          </Link>
        </Button>
        {tryWebHref ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={tryWebHref} prefetch={false}>
              Try the web demo
              <ExternalLink className="size-3.5" />
            </Link>
          </Button>
        ) : null}
      </div>
    </main>
  );
}
