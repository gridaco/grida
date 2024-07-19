"use client";

import { SupportsDarkMode } from "@/components/dark";
import { AuroraBackground } from "@/backgrounds/aurora";
import { Suspense } from "react";

export default function AuroraBgPage() {
  return (
    <Suspense>
      <SupportsDarkMode>
        <AuroraBackground />
      </SupportsDarkMode>
    </Suspense>
  );
}
