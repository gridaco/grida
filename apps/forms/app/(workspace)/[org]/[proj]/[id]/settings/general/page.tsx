"use client";

import React from "react";
import { Sector, SectorHeader, SectorHeading } from "@/components/preferences";
import { DeleteFormSection } from "@/scaffolds/settings/delete-form/delete-form-section";

export default function FormGeneralSettingsPage() {
  return (
    <main className="max-w-2xl mx-auto">
      <Sector>
        <SectorHeader>
          <SectorHeading className="text-destructive">
            Danger Zone
          </SectorHeading>
        </SectorHeader>
        <DeleteFormSection />
      </Sector>
    </main>
  );
}
