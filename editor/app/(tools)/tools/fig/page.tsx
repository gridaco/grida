import type { Metadata } from "next";
import FigParserTool from "./_page";

export const metadata: Metadata = {
  title: "Figma .fig File Parser and Viewer | Grida Tools",
  description:
    "Free online tool to parse and inspect Figma .fig files and clipboard data. Explore Kiwi binary format, node hierarchies, and binary blobs. All processing happens locally in your browser for privacy and security.",
  category: "Design Tools",
  keywords:
    "figma, fig file parser, figma file viewer, kiwi format, figma clipboard parser, binary format inspector, design tools, figma file format, kiwi schema, node hierarchy viewer",
  openGraph: {
    title: "Figma .fig File Parser and Viewer",
    description:
      "Parse and inspect Figma .fig files and clipboard data. Explore the internal Kiwi format structure with our free, privacy-focused tool.",
    type: "website",
  },
};

export default function FigParserToolPage() {
  return (
    <main className="h-screen w-screen overflow-hidden">
      <FigParserTool />
    </main>
  );
}
