import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { FingerprintProvider } from "@/scaffolds/fingerprint";
import "../../../form.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <>{children}</>
      {process.env.NEXT_PUBLIC_GAID && (
        <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GAID} />
      )}
      <Analytics />
      <SpeedInsights />
      <FingerprintProvider />
    </>
  );
}
