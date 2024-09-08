import React from "react";
import { grida_forms_client } from "@/supabase/server";
import { notFound } from "next/navigation";
import { EndingPageWithContext } from "@/theme/templates/formcomplete";
import { ssr_page_init_i18n } from "@/i18n/ssr";
import { fmt_local_index } from "@/utils/fmt";
import { EndingPageI18nOverrides, FormDocument } from "@/types";
import type { FormLinkURLParams } from "@/lib/forms/url";
import { FormValue } from "@/services/form";

export default async function SubmitCompletePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: FormLinkURLParams["complete"];
}) {
  const form_id = params.id;
  const response_id = searchParams.rid;

  const { data, error } = await grida_forms_client
    .from("form")
    .select(
      `
        *,
        fields:form_field(*),
        options:form_field_option(*),
        default_page:form_document!default_form_page_id(
          *
        )
      `
    )
    .eq("id", form_id)
    .single();

  if (error || !data) {
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

  const { data: response } = await grida_forms_client
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
    <main className="container mx-auto flex items-center justify-center w-screen h-screen">
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
