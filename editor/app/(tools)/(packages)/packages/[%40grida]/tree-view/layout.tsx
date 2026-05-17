import type { Metadata } from "next";
import type { ReactNode } from "react";

const canonical = "https://grida.co/packages/@grida/tree-view";

export const metadata: Metadata = {
  title: "@grida/tree-view — Headless tree-view controller for editors",
  description:
    "Headless, agnostic tree-view controller for editors and IDEs. Zero runtime dependencies, no DOM coupling in the core. Composable drag & drop, virtualization-ready, optional React peer.",
  alternates: {
    canonical,
  },
  openGraph: {
    title: "@grida/tree-view — Headless tree-view controller for editors",
    description:
      "The state machine + math + intents for layer panels, file explorers, and outline views. Zero deps. Production-grown.",
    url: canonical,
    siteName: "Grida",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function TreeViewPackageLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return children;
}
