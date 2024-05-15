import React from "react";
import { client } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { EndingPage } from "@/theme/templates/formcomplete";
import { ssr_page_init_i18n } from "../../i18n";
import { fmt_local_index } from "@/utils/fmt";
import FormCompletePageDefault from "@/theme/templates/formcomplete/default";

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

  const { title, ending_page_template_id } = data;

  switch (ending_page_template_id) {
    case undefined:
    case null:
    case "default": {
      return <FormCompletePageDefault form_title={title} />;
    }
  }

  if (!response_id) {
    return notFound();
  }

  const { data: response } = await client
    .from("response")
    .select("*")
    .eq("id", response_id)
    .single();

  if (!response) {
    return notFound();
  }

  const { local_index } = response;

  return (
    <EndingPage
      template_id={ending_page_template_id}
      data={{
        form_title: title,
        response_short_id: fmt_local_index(local_index),
      }}
    />
  );
}
