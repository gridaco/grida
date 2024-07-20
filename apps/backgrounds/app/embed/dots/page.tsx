"use client";

import { DotsBackground } from "@/backgrounds/dots";
import { SupportsDarkMode } from "@/components/dark";
import { Suspense } from "react";

export default function DotsBackgroundPage() {
  return (
    <Suspense>
      <SupportsDarkMode>
        <main className="w-screen h-screen">
          <DotsBackground />
        </main>
      </SupportsDarkMode>
    </Suspense>
  );
}
