import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Grida Embed",
  robots: { index: false, follow: false },
};

/**
 * Shared shell for embeddable surfaces (`/embed/...`).
 * Minimal chrome — no site nav, no analytics — intended for iframes and deep links.
 */
export default function EmbedLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh w-full bg-background text-foreground">{children}</div>
  );
}
