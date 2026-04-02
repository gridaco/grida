import type { Metadata } from "next";
import AffineTransformTool from "./_page";
import Header from "@/www/header";
import Footer from "@/www/footer";

export const metadata: Metadata = {
  title: "Affine Transform Visualizer",
  description:
    "Interactive 2D affine transformation visualizer. Paste a 3x3 or 3x2 matrix or an SVG path, drag handles, and see how translate, rotate, scale, and skew compose. Built for students and graphics developers.",
  keywords:
    "affine transform, matrix, 2D transform, linear algebra, rotation matrix, scale matrix, shear, skew, transformation matrix, visualizer, interactive, computer graphics, CSS transform, SVG path",
  category: "Developer Tools",
  openGraph: {
    title: "Affine Transform Visualizer",
    description:
      "Interactive 2D affine transformation visualizer. Paste a matrix or SVG path, drag handles, and decompose transforms into translate, rotate, scale, and skew.",
    type: "website",
    url: "https://grida.co/tools/affine-transform",
  },
};

export default function AffineTransformToolPage() {
  return (
    <main className="flex flex-col min-h-screen">
      <Header />
      <div className="flex-1 flex flex-col pt-16">
        <div className="container mx-auto px-4 pt-8 pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">
            Affine Transform Visualizer
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Drag handles, tweak sliders, or paste a matrix to visualize 2D
            affine transformations
          </p>
        </div>
        <div className="flex-1 container mx-auto px-4 pb-8">
          <div className="h-full border rounded-xl overflow-hidden bg-background">
            <AffineTransformTool />
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
