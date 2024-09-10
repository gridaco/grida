import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/react";
import "../editor.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <>{children}</>
      {process.env.NEXT_PUBLIC_GAID && (
        <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GAID} />
      )}
      <Analytics />
    </>
  );
}
