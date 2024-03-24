import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "../../../form.css";
import { FingerprintProvider } from "@/scaffolds/fingerprint";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Grida Forms",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
      {process.env.NEXT_PUBLIC_GAID && (
        <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GAID} />
      )}
      <FingerprintProvider />
    </html>
  );
}
