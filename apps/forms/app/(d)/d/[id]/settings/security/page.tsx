import React from "react";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@/lib/supabase/server";
import {
  Sector,
  SectorBlocks,
  SectorDescription,
  SectorHeader,
  SectorHeading,
} from "@/components/preferences";
import { UnknownFieldPreferences } from "@/scaffolds/settings/data-dynamic-field-preferences";
import { TrustedOriginPreferences } from "@/scaffolds/settings/trusted-origin-preferences";
import { notFound } from "next/navigation";
import { AboutThisForm } from "@/scaffolds/settings/about-this-form";
import { FormMethodPreference } from "@/scaffolds/settings/form-method-preference";

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

  const { unknown_field_handling_strategy, method } = data!;

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
          <SectorHeading>Data</SectorHeading>
        </SectorHeader>
        <SectorBlocks>
          <UnknownFieldPreferences
            form_id={form_id}
            init={{
              unknown_field_handling_strategy,
            }}
          />
          <FormMethodPreference
            form_id={form_id}
            init={{
              method: method,
            }}
          />
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
    </main>
  );
}
