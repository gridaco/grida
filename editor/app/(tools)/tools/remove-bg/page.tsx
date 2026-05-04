import type { Metadata } from "next";
import Header from "@/www/header";
import Footer from "@/www/footer";
import RemoveBackgroundTool from "./_page";

export const metadata: Metadata = {
  title: "Remove Background — Free AI Background Remover | Grida",
  description:
    "Remove the background from any image instantly with AI. Free online background remover — drop in a JPG or PNG and get a transparent PNG back.",
  keywords: [
    "remove background",
    "background remover",
    "ai background remover",
    "transparent png",
    "image cutout",
    "free background removal",
    "online photo editor",
    "grida tools",
  ],
  openGraph: {
    title: "Remove Background — Free AI Background Remover | Grida",
    description:
      "Drop an image, get a clean transparent PNG. Free AI background remover.",
    type: "website",
    url: "https://grida.co/tools/remove-bg",
  },
  twitter: {
    card: "summary_large_image",
    title: "Remove Background — Free AI Background Remover | Grida",
    description:
      "Drop an image, get a clean transparent PNG. Free AI background remover.",
  },
};

export default function RemoveBackgroundPage() {
  return (
    <main>
      <Header />
      <RemoveBackgroundTool />
      <Footer />
    </main>
  );
}
