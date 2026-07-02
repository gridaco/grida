/**
 * GRIDA-SEC-005 — analytics-free root layout.
 *
 * Root layout (this repo has no top-level `app/layout.tsx`; each route group
 * owns its `<html>`). Deliberately loads NO third-party scripts — no Google
 * Analytics, no Vercel Analytics/Speed Insights — unlike the `(site)` root
 * layout. Pages here carry security-sensitive values in their URL (e.g. the
 * desktop sign-in PKCE challenge) that must not be beaconed to third parties;
 * a pageview capturing that URL would disclose the value. Do not add
 * analytics or any URL-reporting script to this group.
 */
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "../editor.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Grida",
  robots: { index: false, follow: false },
  // No third party ever receives the URL as a Referer either.
  referrer: "no-referrer",
};

export default function UntrackedRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
