import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "../form.css";

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
      <body className={inter.className}>{children}</body>
    </html>
  );
}
