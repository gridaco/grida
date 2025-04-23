import type { Metadata } from "next";
import HalftoneTool from "./_page";
import Header from "@/www/header";
import Footer from "@/www/footer";

export const metadata: Metadata = {
  title: "Halftone Generator Tool",
  description: "Generate halftone patterns from images",
  category: "Design Tools",
  keywords:
    "halftone, generator, pattern, design, design tools, online, batch, svg, halftone pattern",
};

export default function HalftoneToolPage() {
  return (
    <main>
      <Header />
      <div className="py-40 min-h-screen flex flex-col items-center justify-center">
        <HalftoneTool />
      </div>
      <Footer />
    </main>
  );
}
