import type { Metadata } from "next";
import type { ReactNode } from "react";

const canonical = "https://grida.co/packages/@grida/tree-view";
const title =
  "@grida/tree-view — Headless React tree-view for shadcn & Tailwind";
// 158 chars — under Google's 160-char snippet cap.
const description =
  "Headless React tree-view controller for editors and IDEs. Zero-dep state machine, composable drag & drop, virtualization-ready. Tailwind + shadcn friendly.";

export const metadata: Metadata = {
  metadataBase: new URL("https://grida.co"),
  title,
  description,
  keywords: [
    // primary
    "tree-view",
    "tree view",
    "tree component",
    "react tree",
    "react tree-view",
    "react tree component",
    // headless / pattern
    "headless",
    "headless ui",
    "headless tree",
    "headless tree-view",
    "headless component",
    "state machine",
    // styling / ecosystem
    "shadcn",
    "shadcn ui",
    "shadcn tree",
    "shadcn tree-view",
    "tailwind",
    "tailwindcss",
    "tailwind tree",
    "radix",
    "lucide",
    // capabilities
    "drag and drop",
    "drag drop tree",
    "virtualization",
    "tanstack virtual",
    "keyboard navigation",
    "type-ahead",
    // surfaces
    "ui",
    "ui library",
    "react",
    "react component",
    "react hooks",
    "layer panel",
    "layers panel",
    "file explorer",
    "outline view",
    "sidebar",
    "workspace sidebar",
    "Notion sidebar",
    "Figma layers",
    "VS Code explorer",
    "Finder",
    "editor",
    "design tool",
    // brand
    "Grida",
    "@grida/tree-view",
  ],
  alternates: { canonical },
  openGraph: {
    title,
    description:
      "One TreeController, many trees — drives a canvas, a file explorer, a workspace sidebar, a desktop. Zero-dep core, Tailwind + shadcn-friendly row renderers, headless drag & drop.",
    url: canonical,
    siteName: "Grida",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    site: "@grida_co",
    creator: "@grida_co",
  },
  robots: {
    index: true,
    follow: true,
  },
};

// JSON-LD: declared as a SoftwareSourceCode so search engines link the
// package landing to its npm + GitHub coordinates.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareSourceCode",
  name: "@grida/tree-view",
  description,
  url: canonical,
  codeRepository:
    "https://github.com/gridaco/grida/tree/main/packages/grida-tree-view",
  programmingLanguage: ["TypeScript", "JavaScript"],
  runtimePlatform: ["Node.js", "Bun", "Deno", "Browser"],
  license: "https://opensource.org/licenses/MIT",
  keywords:
    "tree-view, react, headless, shadcn, tailwindcss, drag and drop, virtualization, layer panel, file explorer",
  author: { "@type": "Organization", name: "Grida", url: "https://grida.co" },
  isPartOf: {
    "@type": "SoftwareApplication",
    name: "Grida",
    url: "https://grida.co",
  },
};

export default function TreeViewPackageLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD payload.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
