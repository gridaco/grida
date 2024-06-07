import React from "react";
import { client } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { EndingPageWithContext } from "@/theme/templates/formcomplete";
import { ssr_page_init_i18n } from "@/i18n/ssr";
import { fmt_local_index } from "@/utils/fmt";
import { EndingPageI18nOverrides } from "@/types";

export default async function SubmitCompletePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: {
    // response id
    rid?: string;
  };
}) {
  const form_id = params.id;
  const response_id = searchParams.rid;

  const { data, error } = await client
    .from("form")
    .select(
      `
        *,
        fields:form_field(*),
        default_page:form_page!default_form_page_id(
          *
        )
      `
    )
    .eq("id", form_id)
    .single();

  if (error || !data) {
    return notFound();
  }

  await ssr_page_init_i18n({ lng: data.default_form_page_language });

  const { title, fields, ending_page_template_id, ending_page_i18n_overrides } =
    data;

  if (!response_id) {
    return notFound();
  }

  const { data: response } = await client
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
    (acc: any, field) => {
      const key = fields.find((f) => f.id === field.form_field_id)?.name;
      if (!key) return acc; // this can't happen - but just in case

      acc[key] =
        // FIXME: need investigation (case:FIELDVAL)
        JSON.parse(field.value as any);
      return acc;
    },
    {} as Record<string, string>
  );

  const { local_index, local_id } = response;

  return (
    <main className="flex items-center justify-center min-h-screen">
      <EndingPageWithContext
        template_id={ending_page_template_id}
        overrides={ending_page_i18n_overrides as {} as EndingPageI18nOverrides}
        context={{
          title: title,
          language: data.default_form_page_language,
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
