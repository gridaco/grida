import type { Metadata } from "next";
import HomePage from "./_page";

export const metadata: Metadata = {
  title: "The Free, Open Canvas — Grida",
  description:
    "Grida is a free, open-source canvas for designing and building web applications with templates.",
  alternates: {
    canonical: "https://grida.co/index/canvas",
  },
};

export default function CanvasIndexPage() {
  return <HomePage />;
}
