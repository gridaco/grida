import { Inter } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { cookies } from "next/headers";
import { getPlatform } from "@/host/platform";
import { cn } from "@/components/lib/utils";
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
        className={cn(
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
            <ThemeProvider>
              <Toaster position="bottom-center" />
              {children}
            </ThemeProvider>
          </div>
        </PlatformProvider>
      </body>
    </html>
  );
}
