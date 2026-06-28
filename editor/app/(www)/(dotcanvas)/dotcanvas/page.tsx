import type { Metadata } from "next";
import Header from "@/www/header";
import Footer from "@/www/footer";
import { GridFrame, GridDivider } from "./_sections/grid";
import Hero from "./_sections/hero";
import Spec from "./_sections/spec";
import { highlightCode } from "./_sections/highlight";
import { MANIFEST_JSONC, USAGE_TS } from "./_sections/content";
import "./_sections/shiki.css";

const DESCRIPTION =
  "The .canvas format: a portable directory of SVG documents plus a .canvas.json manifest (order, layout, skip). dotcanvas is the zero-dependency reader/writer.";

export const metadata: Metadata = {
  metadataBase: new URL("https://grida.co"),
  title: ".canvas — Portable Directory Format | Grida",
  description: DESCRIPTION,
  keywords: [
    "dotcanvas",
    ".canvas format",
    "canvas file format",
    "portable canvas",
    "svg slides",
    "svg board",
    "container format",
    ".canvas.json",
    "json canvas",
    "grida canvas",
    "tolerant reader",
  ],
  alternates: {
    canonical: "https://grida.co/dotcanvas",
  },
  openGraph: {
    title: ".canvas — Portable Directory Format | Grida",
    description:
      "A portable directory of standalone SVG documents plus a .canvas.json manifest. dotcanvas is the zero-dependency reference reader/writer.",
    type: "website",
    url: "https://grida.co/dotcanvas",
  },
  twitter: {
    card: "summary_large_image",
    title: ".canvas — Portable Directory Format | Grida",
    description:
      "A portable .canvas directory of SVG documents + a .canvas.json manifest. Zero-dependency reader/writer.",
  },
};

/** SoftwareApplication rich result for the reference package. */
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "dotcanvas",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Node.js, browser",
  description:
    "Zero-dependency reference reader/writer for the .canvas portable directory format.",
  url: "https://grida.co/dotcanvas",
  softwareVersion: "0.2.0",
  license: "https://opensource.org/licenses/MIT",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  author: { "@type": "Organization", name: "Grida", url: "https://grida.co" },
  codeRepository:
    "https://github.com/gridaco/grida/tree/main/packages/dotcanvas",
};

export default async function DotCanvasPage() {
  const [manifestHtml, usageHtml] = await Promise.all([
    highlightCode(MANIFEST_JSONC, "jsonc"),
    highlightCode(USAGE_TS, "ts"),
  ]);

  return (
    <main className="overflow-x-hidden pt-20 md:pt-28">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <Header />
      <GridFrame className="mb-24">
        <Hero />
        <GridDivider />
        <Spec manifestHtml={manifestHtml} usageHtml={usageHtml} />
      </GridFrame>
      <Footer />
    </main>
  );
}
