// GRIDA-SEC-002 —
// see editor/proxy.ts and /SECURITY.md.
//
// The `(insiders)` route group hosts a developer harness with intentionally
// unauthenticated server actions (mutators that take an arbitrary
// `organizationId` as the first argument). It must only ever run in local
// development. The proxy at `editor/proxy.ts` is the primary gate (404s
// every `/insiders/*` request when `NODE_ENV !== "development"`); this
// layout-level `notFound()` is the defense-in-depth fallback for any code
// path that bypasses the proxy.

import { notFound } from "next/navigation";
import { ThemeProvider } from "@/components/theme-provider";
import { Inter } from "next/font/google";
import "../globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Insiders",
  description: "Tools for insiders & local development",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // GRIDA-SEC-002: fail closed when not in local dev.
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
