import React from "react";
import { createServerComponentClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import {
  Sector,
  SectorBlocks,
  SectorDescription,
  SectorHeader,
  SectorHeading,
} from "@/components/preferences";
import { notFound } from "next/navigation";
import { EndingRedirectPreferences } from "@/scaffolds/settings/customize/custom-ending-redirect-preferences";
import { EndingPageI18nOverrides, FormDocument } from "@/types";
import { EndingPagePreferences } from "@/scaffolds/settings/customize/custom-ending-page-preferences";

export default async function FormsCustomizeSettingsPage({
  params,
}: {
  params: { id: string };
}) {
  const cookieStore = cookies();

  const form_id = params.id;

  const supabase = createServerComponentClient(cookieStore);

  // TODO: change to form_document after migration
  const { data, error } = await supabase
    .from("form")
    .select(
      `
        *,
        default_page:form_document!default_form_page_id(
          *
        )
      `
    )
    .eq("id", form_id)
    .single();

  if (!data) {
    return notFound();
  }

  const { title, default_page } = data!;

  const {
    lang,
    is_ending_page_enabled,
    ending_page_template_id,
    ending_page_i18n_overrides,
  } = default_page as any as FormDocument;

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
          <EndingPagePreferences
            form_id={form_id}
            lang={lang}
            title={title}
            init={{
              enabled: is_ending_page_enabled,
              template_id: ending_page_template_id as any,
              i18n_overrides:
                ending_page_i18n_overrides as {} as EndingPageI18nOverrides,
            }}
          />
        </SectorBlocks>
      </Sector>
    </main>
  );
}
