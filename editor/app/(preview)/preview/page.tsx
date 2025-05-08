"use client";

import { ThemeProvider } from "@/components/theme-provider";
import dynamic from "next/dynamic";
import clsx from "clsx";
import React from "react";

const PlaygroundPreviewSlave = dynamic(
  () => import("@/scaffolds/playground/preview/slave"),
  {
    ssr: false,
  }
);

export default function PlaygroundPreview() {
  return (
    <main
      className={clsx("min-h-screen flex flex-col items-center pt-10 md:pt-16")}
    >
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        storageKey="playground-embed-theme"
        enableSystem
        disableTransitionOnChange
      >
        <PlaygroundPreviewSlave />
      </ThemeProvider>
    </main>
  );
}
