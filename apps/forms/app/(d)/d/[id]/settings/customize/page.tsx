import React from "react";
import { createServerComponentClient } from "@/lib/supabase/server";
import { FormPageLanguagePreferences } from "@/scaffolds/settings/form-page-language-preferences";
import { EndingRedirectPreferences } from "@/scaffolds/settings/ending-redirect-preferences";
import { cookies } from "next/headers";
import {
  Sector,
  SectorBlocks,
  SectorDescription,
  SectorHeader,
  SectorHeading,
} from "@/components/preferences";
import { notFound } from "next/navigation";
import { CustomPoweredByBrandingPreferences } from "@/scaffolds/settings/custom-powered-by-branding-preferences";
import { CustomSectionStylePreferences } from "@/scaffolds/settings/custom-section-style-preferences";
import { CustomPageBackgroundPreferences } from "@/scaffolds/settings/custom-page-background-preferences";
import { EndingPageI18nOverrides, FormPage } from "@/types";
import { EndingPagePreferences } from "@/scaffolds/settings/ending-page-preferences";

export default async function FormsCustomizeSettingsPage({
  params,
}: {
  params: { id: string };
}) {
  const cookieStore = cookies();

  const form_id = params.id;

  const supabase = createServerComponentClient(cookieStore);

  const { data, error } = await supabase
    .from("form")
    .select(
      `
        *,
        default_page:form_page!default_form_page_id(
          *
        )
      `
    )
    .eq("id", form_id)
    .single();

  if (!data) {
    return notFound();
  }

  const {
    title,
    default_form_page_language,
    is_powered_by_branding_enabled,
    redirect_after_response_uri,
    is_redirect_after_response_uri_enabled,
    default_page,
    is_ending_page_enabled,
    ending_page_template_id,
    ending_page_i18n_overrides,
  } = data!;

  const { background, stylesheet } = default_page as any as FormPage;

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
          <SectorHeading>Ending</SectorHeading>
          <SectorDescription>
            Redirect or show custom page after form submission
          </SectorDescription>
        </SectorHeader>
        <SectorBlocks>
          <EndingRedirectPreferences
            form_id={form_id}
            init={{
              is_redirect_after_response_uri_enabled:
                is_redirect_after_response_uri_enabled,
              redirect_after_response_uri: redirect_after_response_uri ?? "",
            }}
          />
          <EndingPagePreferences
            form_id={form_id}
            lng={default_form_page_language}
            title={title}
            init={{
              enabled: is_ending_page_enabled,
              template_id: ending_page_template_id,
              i18n_overrides:
                ending_page_i18n_overrides as {} as EndingPageI18nOverrides,
            }}
          />
        </SectorBlocks>
      </Sector>
      <Sector>
        <SectorHeader>
          <SectorHeading>Branding</SectorHeading>
          <SectorDescription>
            Opt-out from Grida branding on built-in pages
          </SectorDescription>
        </SectorHeader>
        <CustomPoweredByBrandingPreferences
          form_id={form_id}
          init={{
            is_powered_by_branding_enabled,
          }}
        />
      </Sector>
      <Sector>
        <SectorHeader>
          <SectorHeading>Theme</SectorHeading>
          <SectorDescription>
            Customize Page Themes (only available trhough built-in pages)
          </SectorDescription>
        </SectorHeader>
        <SectorBlocks>
          <CustomPageBackgroundPreferences
            form_id={form_id}
            init={{
              background,
            }}
          />
          <CustomSectionStylePreferences
            form_id={form_id}
            init={{
              background,
              stylesheet,
            }}
          />
        </SectorBlocks>
      </Sector>
    </main>
  );
}
