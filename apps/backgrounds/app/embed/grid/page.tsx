"use client";

import { BackgroundGrid } from "@/backgrounds/grid";
import { SupportsDarkMode } from "@/components/dark";
import { Suspense, use } from "react";

export default function BackgroundGridPage(
  props: {
    searchParams: Promise<{
      variant?: "sm" | "base";
    }>;
  }
) {
  const searchParams = use(props.searchParams);
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
