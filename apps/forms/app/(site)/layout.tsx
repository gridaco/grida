import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/react";
import { ThemeProvider } from "@/components/theme-provider";
import "../editor.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Grida Forms",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
      {process.env.NEXT_PUBLIC_GAID && (
        <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GAID} />
      )}
      <Analytics />
    </html>
  );
}
