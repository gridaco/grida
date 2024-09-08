import { Inter } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { ThemeProvider } from "@/components/theme-provider";
import { ToasterWithMax } from "@/components/toaster";
import clsx from "clsx";
import "../editor.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Grida",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
      </body>
    </html>
  );
}
