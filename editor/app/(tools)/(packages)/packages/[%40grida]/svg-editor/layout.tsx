import type { Metadata } from "next";
import type { ReactNode } from "react";

const canonical = "https://grida.co/packages/@grida/svg-editor";
const title = "@grida/svg-editor — Headless, clean SVG editor for the web";
// 157 chars — under Google's 160-char snippet cap.
const description =
  "Headless SVG editor that round-trips by default: open, edit, save, and the diff is exactly your change. Spec demo for each feature. Experimental, MIT.";

export const metadata: Metadata = {
  metadataBase: new URL("https://grida.co"),
  title,
  description,
  keywords: [
    // primary
    "svg editor",
    "svg editor react",
    "headless svg editor",
    "react svg editor",
    "edit svg",
    "svg editing library",
    // pattern / value
    "headless",
    "headless ui",
    "clean svg",
    "round-trip svg",
    "minimal diff svg",
    "svg round trip",
    // capabilities
    "svg selection",
    "svg transform",
    "svg text editing",
    "svg insert shape",
    "svg paint",
    "svg gradients",
    // ecosystem
    "react",
    "typescript",
    "tailwind",
    "canvas editor",
    "design tool",
    "ai editing",
    // brand
    "Grida",
    "@grida/svg-editor",
  ],
  alternates: { canonical },
  openGraph: {
    title,
    description:
      "A clean SVG editor — open a file, edit it, save it, and the diff is exactly the change you made. Headless, backend-agnostic, round-trips by default.",
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
  name: "@grida/svg-editor",
  description,
  url: canonical,
  codeRepository:
    "https://github.com/gridaco/grida/tree/main/packages/grida-svg-editor",
  programmingLanguage: ["TypeScript", "JavaScript"],
  runtimePlatform: ["Browser", "Node.js"],
  license: "https://opensource.org/licenses/MIT",
  keywords:
    "svg editor, headless, react, clean svg, round-trip, typescript, design tool",
  author: { "@type": "Organization", name: "Grida", url: "https://grida.co" },
  isPartOf: {
    "@type": "SoftwareApplication",
    name: "Grida",
    url: "https://grida.co",
  },
};

export default function SvgEditorPackageLayout({
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
