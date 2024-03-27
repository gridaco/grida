import { createServerComponentClient } from "@/lib/supabase/server";
import { UnknownFieldPreferences } from "@/scaffolds/settings/data-unknown-fields";
import { DeleteFormSection } from "@/scaffolds/settings/delete-form/delete-form-section";
import { TrustedOriginPreferences } from "@/scaffolds/settings/trusted-origins";
import { cookies } from "next/headers";
import React from "react";
import {
  Sector,
  SectorBlocks,
  SectorDescription,
  SectorHeader,
  SectorHeading,
} from "@/components/preferences";
import { notFound } from "next/navigation";
import { AboutThisForm } from "@/scaffolds/settings/about-this-form";

export default async function FormGeneralSettingsPage({
  params,
}: {
  params: { id: string };
}) {
  const cookieStore = cookies();

  const form_id = params.id;

  const supabase = createServerComponentClient(cookieStore);

  const { data } = await supabase
    .from("form")
    .select()
    .eq("id", form_id)
    .single();

  if (!data) {
    return notFound();
  }

  const { unknown_field_handling_strategy } = data!;

  return (
    <main className="max-w-2xl mx-auto">
      <Sector>
        <SectorHeader>
          <SectorHeading>General</SectorHeading>
        </SectorHeader>
        <AboutThisForm form_id={form_id} />
      </Sector>
      <Sector>
        <SectorHeader>
          <SectorHeading>Data Integrity</SectorHeading>
        </SectorHeader>
        <UnknownFieldPreferences
          form_id={form_id}
          init={{
            unknown_field_handling_strategy,
          }}
        />
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
          <SectorHeading>Delete Form</SectorHeading>
        </SectorHeader>
        <DeleteFormSection />
      </Sector>
    </main>
  );
}
