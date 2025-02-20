"use client";

import React from "react";
import {
  Sector,
  SectorBlocks,
  SectorDescription,
  SectorHeader,
  SectorHeading,
} from "@/components/preferences";
import { EndingRedirectPreferences } from "@/scaffolds/settings/customize/custom-ending-redirect-preferences";
import { EndingPagePreferences } from "@/scaffolds/settings/customize/custom-ending-page-preferences";

export default function FormEndEditPage() {
  return (
    <main className="max-w-2xl mx-auto">
      <Sector>
        <SectorHeader>
          <SectorHeading>Ending</SectorHeading>
          <SectorDescription>
            Redirect or show custom page after form submission
          </SectorDescription>
        </SectorHeader>
        <SectorBlocks>
          <EndingRedirectPreferences />
          <EndingPagePreferences />
        </SectorBlocks>
      </Sector>
    </main>
  );
}
