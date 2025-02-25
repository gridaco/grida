"use client";

import { BackgroundGrid } from "@/backgrounds/grid";
import { SupportsDarkMode } from "@/components/dark";
import { Suspense } from "react";

export default function BackgroundGridPage({
  searchParams,
}: {
  searchParams: {
    variant?: "sm" | "base";
  };
}) {
  const { variant } = searchParams;

  return (
    <Suspense>
      <SupportsDarkMode>
        <main className="h-screen w-screen">
          <BackgroundGrid variant={variant} />
        </main>
      </SupportsDarkMode>
    </Suspense>
  );
}
