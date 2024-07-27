"use client";

import React from "react";
import {
  Sector,
  SectorBlocks,
  SectorDescription,
  SectorHeader,
  SectorHeading,
} from "@/components/preferences";
import { ClosingFormPreferences } from "@/scaffolds/settings/closing-preference";
import { SchedulingPreferences } from "@/scaffolds/settings/scheduling-preference";
import {
  MaxRespoonses,
  RestrictNumberOfResponseByCustomer,
} from "@/scaffolds/settings/response-preferences";
import { AboutThisForm } from "@/scaffolds/settings/about-this-form";
import { UnknownFieldPreferences } from "@/scaffolds/settings/data-dynamic-field-preferences";
import { FormMethodPreference } from "@/scaffolds/settings/form-method-preference";
import { TrustedOriginPreferences } from "@/scaffolds/settings/trusted-origin-preferences";
import { DeleteFormSection } from "@/scaffolds/settings/delete-form/delete-form-section";
import { useEditorState } from "@/scaffolds/editor";

export default function FormDashboard() {
  const [state, dispatch] = useEditorState();

  const {
    form_title,
    form_id,
    theme: { lang },
    document: { selected_page_id },
  } = state;

  return (
    <main className="max-w-2xl mx-auto">
      <Sector>
        <SectorHeader>
          <SectorHeading>General</SectorHeading>
        </SectorHeader>
        <AboutThisForm form_id={form_id} />
      </Sector>
      <Sector id="access">
        <SectorHeader>
          <SectorHeading>Access</SectorHeading>
          <SectorDescription>
            Manage how responses are collected and protected
          </SectorDescription>
        </SectorHeader>
        <SectorBlocks>
          <ClosingFormPreferences />
          <SchedulingPreferences />
          <RestrictNumberOfResponseByCustomer />
          <MaxRespoonses />
        </SectorBlocks>
      </Sector>
      <Sector>
        <SectorHeader>
          <SectorHeading>Data</SectorHeading>
        </SectorHeader>
        <SectorBlocks>
          <UnknownFieldPreferences />
          <FormMethodPreference />
        </SectorBlocks>
      </Sector>
      <Sector>
        <SectorHeader>
          <SectorHeading>Security</SectorHeading>
          <SectorDescription>
            Configure where the form can be embedded
          </SectorDescription>
        </SectorHeader>
        <TrustedOriginPreferences />
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
