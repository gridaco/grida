"use client";

import { PlaygroundPreviewSlave } from "@/scaffolds/playground/preview";
import clsx from "clsx";
import { ThemeProvider } from "@/components/theme-provider";

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
