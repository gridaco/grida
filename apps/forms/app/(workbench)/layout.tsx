import { GoogleAnalytics } from "@next/third-parties/google";
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
    </>
  );
}
