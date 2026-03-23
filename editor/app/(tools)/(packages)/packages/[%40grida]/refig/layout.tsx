import type { Metadata } from "next";
import type { ReactNode } from "react";

const canonical = "https://grida.co/packages/@grida/refig";

export const metadata: Metadata = {
  title: "@grida/refig — Headless Figma renderer & browser preview",
  description:
    "Render Figma documents to PNG, JPEG, WebP, PDF, or SVG with @grida/refig. Browser preview for .fig, REST API JSON, or REST archive ZIP. Node.js CLI and library API.",
  alternates: {
    canonical,
  },
  openGraph: {
    title: "@grida/refig — Headless Figma renderer & browser preview",
    description:
      "Render Figma documents to raster or vector formats. Live browser preview plus Node.js CLI and library API.",
    url: canonical,
    siteName: "Grida",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RefigPackageLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return children;
}
