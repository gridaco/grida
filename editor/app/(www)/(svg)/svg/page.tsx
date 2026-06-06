import type { Metadata } from "next";
import Header from "@/www/header";
import FooterWithCTA from "@/www/footer-with-cta";
import { GridFrame, GridDivider, GridRow } from "./_sections/grid";
import Hero from "./_sections/hero";
import EditorPreview from "./_sections/editor-preview";
import Statement from "./_sections/statement";
import Agentic from "./_sections/agentic";
import Clean from "./_sections/clean";
import Playground from "./_sections/playground";
import Sdk from "./_sections/sdk";
import { highlightCode } from "./_sections/highlight";
import { AGENTIC_DIFF, SDK_CODE } from "./_sections/content";
import "./_sections/shiki.css";

export const metadata: Metadata = {
  title: "Grida SVG — The Clean SVG Editor & SDK",
  description:
    "A clean, round-trip-faithful SVG editor and headless SDK. Open an SVG, change one thing, save — and the diff is exactly that, nothing else moved. Built for the agentic era, when people and AI edit the same files.",
  keywords: [
    "svg editor",
    "online svg editor",
    "open source svg editor",
    "svg sdk",
    "headless svg editor",
    "svg round trip",
    "clean svg",
    "svg diff",
    "agentic design",
    "ai native design format",
    "svg editor sdk",
    "edit svg without changing markup",
    "grida svg",
    "inkscape alternative",
    "illustrator svg alternative",
  ],
};

export default async function SvgPage() {
  const [diffHtml, codeHtml] = await Promise.all([
    highlightCode(AGENTIC_DIFF, "diff"),
    highlightCode(SDK_CODE, "ts"),
  ]);

  return (
    <main className="overflow-x-hidden pt-20 md:pt-28">
      <Header />
      <GridFrame>
        <Hero />
        <GridDivider />
        {/* Editor preview — full-bleed so it meets the rails. */}
        <EditorPreview />
        {/* Live editor tiles — the GridCells border-t is their top divider. */}
        <Playground />
        <GridDivider />
        <GridRow>
          <Statement />
        </GridRow>
        <GridDivider />
        <GridRow bleed>
          <Agentic diffHtml={diffHtml} />
        </GridRow>
        <GridDivider />
        <GridRow bleed>
          <Clean />
        </GridRow>
        <GridDivider />
        <GridRow>
          <Sdk codeHtml={codeHtml} />
        </GridRow>
      </GridFrame>
      <FooterWithCTA />
    </main>
  );
}
