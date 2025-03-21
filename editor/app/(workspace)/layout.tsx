import { Inter } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { ThemeProvider } from "@/components/theme-provider";
import { ToasterWithMax } from "@/components/toaster";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import clsx from "clsx";
import { cookies } from "next/headers";
import { getPlatform } from "@/host/platform";
import PlatformProvider from "@/host/platform-provider";
import "../editor.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Grida",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const platform = await getPlatform(cookieStore);

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={clsx(
          inter.className,
          // to prevent the whole page from scrolling by sr-only or other hidden absolute elements
          "h-screen overflow-hidden"
        )}
      >
        {process.env.NEXT_PUBLIC_GAID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GAID} />
        )}
        <Analytics />
        <SpeedInsights />
        <PlatformProvider {...platform}>
          <div className="h-screen flex flex-col">
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              {children}
              <ToasterWithMax position="bottom-center" max={5} />
            </ThemeProvider>
          </div>
        </PlatformProvider>
      </body>
    </html>
  );
}
