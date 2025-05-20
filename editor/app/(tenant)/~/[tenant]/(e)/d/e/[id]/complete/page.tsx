import React from "react";
import { service_role } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { EndingPageWithContext } from "@/theme/templates/formcomplete";
import { ssr_page_init_i18n } from "@/i18n/ssr";
import { fmt_local_index } from "@/utils/fmt";
import type {
  FormDocument,
  EndingPageI18nOverrides,
} from "@/grida-forms/hosted/types";
import type { FormLinkURLParams } from "@/host/url";
import { FormValue } from "@/services/form";

type Params = { id: string };

export default async function SubmitCompletePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<FormLinkURLParams["complete"]>;
}) {
  const { id: form_id } = await params;
  const { rid: response_id } = await searchParams;

  const { data, error } = await service_role.forms
    .from("form")
    .select(
      `
        *,
        fields:attribute(*),
        options:option(*),
        default_page:form_document!default_form_page_id(
          *
        )
      `
    )
    .eq("id", form_id)
    .single();

  if (error || !data) {
    console.warn("d/e/[id]/complete form not found: ", error);
    return notFound();
  }

  const { title, fields, options, default_page } = data;
  const { lang, ending_page_template_id, ending_page_i18n_overrides } =
    default_page as unknown as FormDocument;

  await ssr_page_init_i18n({
    lng: lang,
  });

  if (!response_id) {
    return notFound();
  }

  const { data: response } = await service_role.forms
    .from("response")
    .select(
      `
      *,
      fields:response_field(*)
    `
    )
    .eq("id", response_id)
    .single();

  if (!response) {
    console.warn("d/e/[id]/complete response not found: ", response_id);
    return notFound();
  }

  // id:val map
  const responsefields: Record<string, string> = response.fields.reduce(
    (acc: any, response_field) => {
      const field = fields.find((f) => f.id === response_field.form_field_id);
      const key = field?.name;
      if (!key) return acc; // this can't happen - but just in case

      acc[key] = FormValue.parse(response_field.value, {
        type: field.type,
        enums: options,
        multiple: field.multiple,
      }).value;

      return acc;
    },
    {} as Record<string, string>
  );

  const { local_index, local_id } = response;

  return (
    <main className="container mx-auto flex items-center justify-center w-dvw min-h-dvh">
      <EndingPageWithContext
        template_id={ending_page_template_id}
        overrides={ending_page_i18n_overrides as {} as EndingPageI18nOverrides}
        context={{
          title: title,
          language: lang,
          form_title: title,
          response: {
            index: local_index,
            idx: fmt_local_index(local_index),
            short_id: local_id,
          },

          // FIXME:
          fields: responsefields,
          session: {},
          customer: {
            short_id: "",
          },
        }}
      />
    </main>
  );
}
