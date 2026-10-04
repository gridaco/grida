import React from "react";
import HomePage from "../_home";

// grida.co/home
export const metadata = {
  title: "An open canvas to design and create — Grida",
  description:
    "An open-source design canvas. Create images, slides, and designs with AI in Grida Desktop for macOS, Windows, and Linux.",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: false,
  },
};

export default function WWWCanonicalHome() {
  return <HomePage />;
}
