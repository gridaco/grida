import type { Metadata } from "next";
import type { ReactNode } from "react";

const canonical = "https://grida.co/packages/@grida/hud";
const title = "@grida/hud — Canvas-based HUD for design tool viewports";
// 159 chars — under Google's 160-char snippet cap.
const description =
  "Canvas-rendered HUD overlay for design-tool viewports. Selection chrome, handles, marquee, vector edit, hit-test — pure-logic state machine, headless core.";

export const metadata: Metadata = {
  metadataBase: new URL("https://grida.co"),
  title,
  description,
  keywords: [
    "hud",
    "canvas hud",
    "selection chrome",
    "hit-test",
    "marquee",
    "vector editor",
    "design tool",
    "react",
    "Grida",
    "@grida/hud",
  ],
  alternates: { canonical },
  openGraph: {
    title,
    description:
      "One Surface, one canvas — selection outlines, resize and rotation handles, marquee, lasso, vector edit chrome, host-fed snap and measurement guides. Headless core, thin React shell.",
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
  name: "@grida/hud",
  description,
  url: canonical,
  codeRepository:
    "https://github.com/gridaco/grida/tree/main/packages/grida-canvas-hud",
  programmingLanguage: ["TypeScript", "JavaScript"],
  runtimePlatform: ["Browser"],
  license: "https://opensource.org/licenses/MIT",
  keywords:
    "hud, canvas, selection chrome, hit-test, marquee, vector editor, design tool, react, headless",
  author: { "@type": "Organization", name: "Grida", url: "https://grida.co" },
  isPartOf: {
    "@type": "SoftwareApplication",
    name: "Grida",
    url: "https://grida.co",
  },
};

export default function HudPackageLayout({
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
