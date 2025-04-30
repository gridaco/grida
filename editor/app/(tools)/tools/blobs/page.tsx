import type { Metadata } from "next";
import BlobGeneratorTool from "./_page";
import Header from "@/www/header";
import Footer from "@/www/footer";

export const metadata: Metadata = {
  title: "Blob Generator",
  description: "Generate random blob designs",
  category: "Design Tools",
  keywords:
    "blob, generator, random, design, design tools, online, batch, svg, blob path, metaball",
};

export default function BlobGeneratorToolPage() {
  return (
    <main>
      <Header />
      <div className="py-40 min-h-screen flex flex-col items-center justify-center">
        <BlobGeneratorTool />
      </div>
      <Footer />
    </main>
  );
}
