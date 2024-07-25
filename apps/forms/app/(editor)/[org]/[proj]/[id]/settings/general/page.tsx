"use client";

import React from "react";
import { Sector, SectorHeader, SectorHeading } from "@/components/preferences";
import { DeleteFormSection } from "@/scaffolds/settings/delete-form/delete-form-section";
import { AboutThisForm } from "@/scaffolds/settings/about-this-form";
import { useEditorState } from "@/scaffolds/editor";

export default function FormGeneralSettingsPage() {
  const [state] = useEditorState();
  const { form_id } = state;

  return (
    <main className="max-w-2xl mx-auto">
      <Sector>
        {/* <SectorHeader>
          <SectorHeading>General</SectorHeading>
        </SectorHeader> */}
        <AboutThisForm form_id={form_id} />
      </Sector>
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
