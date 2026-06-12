import type { Metadata } from "next";
import type { ReactNode } from "react";

const canonical = "https://grida.co/packages/@grida/number-input";
const title = "@grida/number-input — Headless React hooks for number inputs";
// Under Google's 160-char snippet cap.
const description =
  "Headless React hooks for editor-grade number inputs — step precision, commit safety, mixed values, unit suffixes, scrub gestures, snapping sliders, hex color.";

export const metadata: Metadata = {
  metadataBase: new URL("https://grida.co"),
  title,
  description,
  keywords: [
    "number input",
    "react hooks",
    "headless",
    "scrubbing",
    "pointer lock",
    "slider",
    "hex color input",
    "design tool",
    "Grida",
    "@grida/number-input",
  ],
  alternates: { canonical },
  openGraph: {
    title,
    description:
      "The input behaviors of the Grida editor's properties panel, extracted as hooks — typed parsing, commit/change separation, mixed-value state, drag-to-scrub labels with pointer lock, mark-snapping sliders, and per-channel hex color editing.",
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

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareSourceCode",
  name: "@grida/number-input",
  description,
  url: canonical,
  codeRepository:
    "https://github.com/gridaco/grida/tree/main/packages/grida-number-input",
  programmingLanguage: ["TypeScript", "JavaScript"],
  runtimePlatform: ["Browser"],
  license: "https://opensource.org/licenses/MIT",
  keywords:
    "number input, react hooks, headless, scrubbing, pointer lock, slider, hex color input, design tool",
  author: { "@type": "Organization", name: "Grida", url: "https://grida.co" },
  isPartOf: {
    "@type": "SoftwareApplication",
    name: "Grida",
    url: "https://grida.co",
  },
};

export default function NumberInputPackageLayout({
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
