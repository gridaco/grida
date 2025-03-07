import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { ToasterWithMax } from "@/components/toaster";
import { cookies } from "next/headers";
import { getPlatform } from "@/host/platform";
import PlatformProvider from "@/host/platform-provider";
import "../editor.css";

const inter = Inter({ subsets: ["latin"] });
// const inconsolata = Inconsolata({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Grida",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const platform = await getPlatform(cookieStore);

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ToasterWithMax position="bottom-center" max={5} />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <PlatformProvider {...platform}>{children}</PlatformProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
