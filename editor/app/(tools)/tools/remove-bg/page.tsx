import type { Metadata } from "next";
import Header from "@/www/header";
import Footer from "@/www/footer";
import RemoveBackgroundTool from "./_page";

export const metadata: Metadata = {
  title: "AI Background Remover — Grida",
  description:
    "Remove an image background with AI and download a transparent PNG. Sign in to use prepaid credit from your Grida organization.",
  keywords: [
    "remove background",
    "background remover",
    "ai background remover",
    "transparent png",
    "image cutout",
    "online photo editor",
    "grida tools",
  ],
  alternates: {
    canonical: "https://grida.co/tools/remove-bg",
  },
  openGraph: {
    title: "AI Background Remover — Grida",
    description:
      "Remove an image background with AI using prepaid Grida organization credit.",
    type: "website",
    url: "https://grida.co/tools/remove-bg",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Background Remover — Grida",
    description:
      "Remove an image background with AI using prepaid Grida organization credit.",
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
