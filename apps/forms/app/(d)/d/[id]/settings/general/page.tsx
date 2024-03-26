import { createServerComponentClient } from "@/lib/supabase/server";
import { UnknownFieldPreferences } from "@/scaffolds/settings/data-unknown-fields";
import { DeleteFormSection } from "@/scaffolds/settings/delete-form/delete-form-section";
import { RedirectPreferences } from "@/scaffolds/settings/redirect-section";
import { TrustedOriginPreferences } from "@/scaffolds/settings/trusted-origins";
import { ResponsePreferences } from "@/scaffolds/settings/response-preference-section";
import { cookies } from "next/headers";
import React from "react";
import {
  Sector,
  SectorDescription,
  SectorHeader,
  SectorHeading,
} from "@/components/preferences";

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

  const { redirect_after_response_uri } = data!;

  return (
    <main className="max-w-2xl mx-auto">
      <Sector>
        <SectorHeader>
          <SectorHeading>Data Integrity</SectorHeading>
        </SectorHeader>
        <UnknownFieldPreferences />
      </Sector>
      <Sector>
        <SectorHeader>
          <SectorHeading>Responses</SectorHeading>
          <SectorDescription>
            Manage how responses are collected and protected
          </SectorDescription>
        </SectorHeader>
        <ResponsePreferences />
      </Sector>
      <Sector>
        <SectorHeader>
          <SectorHeading>Redirection</SectorHeading>
          <SectorDescription>
            Customize redirection url after submission
          </SectorDescription>
        </SectorHeader>
        <RedirectPreferences
          form_id={form_id}
          defaultValue={redirect_after_response_uri ?? ""}
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
