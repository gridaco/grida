import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ToasterWithMax } from "@/components/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import "../../../editor.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Made with Grida",
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
          <ToasterWithMax />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
