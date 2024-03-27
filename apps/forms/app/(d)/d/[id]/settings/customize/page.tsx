import { createServerComponentClient } from "@/lib/supabase/server";
import { FormPageLanguagePreferences } from "@/scaffolds/settings/form-page-language";
import { UnknownFieldPreferences } from "@/scaffolds/settings/data-unknown-fields";
import { DeleteFormSection } from "@/scaffolds/settings/delete-form/delete-form-section";
import { RedirectPreferences } from "@/scaffolds/settings/redirect-section";
import { TrustedOriginPreferences } from "@/scaffolds/settings/trusted-origins";
import {
  MaxRespoonses,
  RestrictNumberOfResponseByCustomer,
} from "@/scaffolds/settings/response-preference-section";
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
import { CustomizeBrandingPreferences } from "@/scaffolds/settings/customize-branding-section";

export default async function FormsCustomizeSettingsPage({
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

  const {
    //
    default_form_page_language,
    is_powered_by_branding_enabled,
  } = data!;

  return (
    <main className="max-w-2xl mx-auto">
      <Sector>
        <SectorHeader>
          <SectorHeading>Language</SectorHeading>
        </SectorHeader>
        <FormPageLanguagePreferences
          form_id={form_id}
          init={{
            default_form_page_language,
          }}
        />
      </Sector>
      <Sector>
        <SectorHeader>
          <SectorHeading>Branding</SectorHeading>
        </SectorHeader>
        <CustomizeBrandingPreferences
          form_id={form_id}
          init={{
            is_powered_by_branding_enabled,
          }}
        />
      </Sector>
    </main>
  );
}
