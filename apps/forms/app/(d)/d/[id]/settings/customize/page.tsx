import React from "react";
import { createServerComponentClient } from "@/lib/supabase/server";
import { FormPageLanguagePreferences } from "@/scaffolds/settings/customize/custom-form-page-language-preferences";
import { EndingRedirectPreferences } from "@/scaffolds/settings/customize/custom-ending-redirect-preferences";
import { cookies } from "next/headers";
import {
  Sector,
  SectorBlocks,
  SectorDescription,
  SectorHeader,
  SectorHeading,
} from "@/components/preferences";
import { notFound } from "next/navigation";
import { CustomPoweredByBrandingPreferences } from "@/scaffolds/settings/customize/custom-powered-by-branding-preferences";
import { CustomSectionStylePreferences } from "@/scaffolds/settings/customize/custom-section-style-preferences";
import { CustomPageBackgroundPreferences } from "@/scaffolds/settings/customize/custom-page-background-preferences";
import { EndingPageI18nOverrides, FormPage } from "@/types";
import { EndingPagePreferences } from "@/scaffolds/settings/customize/custom-ending-page-preferences";
import { CustomPagePalettePreferences } from "@/scaffolds/settings/customize/custom-page-palette-preference";
import { CustomPageCssPreferences } from "@/scaffolds/settings/customize/custom-page-css-preference";
import { CustomPageFontFamilyPreferences } from "@/scaffolds/settings/customize/custom-page-font-family-preference";
import Link from "next/link";
import { OpenInNewWindowIcon } from "@radix-ui/react-icons";

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
            lang={default_form_page_language}
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
          <CustomPagePalettePreferences
            form_id={form_id}
            init={{
              palette: stylesheet?.palette,
            }}
          />
          <CustomPageFontFamilyPreferences
            form_id={form_id}
            init={{
              "font-family": stylesheet?.["font-family"],
            }}
          />
          <CustomSectionStylePreferences
            form_id={form_id}
            init={{
              section: stylesheet?.section,
            }}
          />
        </SectorBlocks>
      </Sector>
      <Sector>
        <SectorHeader>
          <SectorHeading>Advanced</SectorHeading>
          <SectorDescription>
            Customize Page CSS (only available through built-in pages).
            <br />
            You can Use{" "}
            <Link className="underline" href="/playground" target="_blank">
              Playground
              <OpenInNewWindowIcon className="w-4 h-4 inline align-middle ms-1" />
            </Link>{" "}
            to test your CSS
          </SectorDescription>
        </SectorHeader>
        <SectorBlocks>
          <CustomPageCssPreferences
            form_id={form_id}
            init={{
              custom: stylesheet?.custom,
            }}
          />
        </SectorBlocks>
      </Sector>
    </main>
  );
}
