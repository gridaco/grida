import { client } from "@/lib/supabase/server";
import { FormResponseUnknownFieldHandlingStrategyType } from "@/types";

export async function create_new_form_with_page({
  project_id,
  ...optional
}: {
  project_id: number;
} & Partial<{
  custom_preview_url_path?: string | null;
  custom_publish_url_path?: string | null;
  default_form_page_id?: string | null;
  description?: string | null;
  is_edit_after_submission_allowed?: boolean;
  is_max_form_responses_by_customer_enabled?: boolean;
  is_max_form_responses_in_total_enabled?: boolean;
  is_multiple_response_allowed?: boolean;
  is_redirect_after_response_uri_enabled?: boolean;
  max_form_responses_by_customer?: number | null;
  max_form_responses_in_total?: number | null;
  redirect_after_response_uri?: string | null;
  title?: string;
  unknown_field_handling_strategy?: FormResponseUnknownFieldHandlingStrategyType;
}>) {
  const { data, error } = await client
    .from("form")
    .insert({
      project_id: project_id,
      ...optional,
    })
    .select("*")
    .single();

  if (!data) {
    throw error;
  }

  // create a default page
  const { data: page } = await client
    .from("form_document")
    .insert({
      form_id: data.id,
      name: data.title,
    })
    .select("id")
    .single();

  // link the page to the form
  await client
    .from("form")
    .update({
      default_form_page_id: page!.id,
    })
    .eq("id", data.id);

  return {
    form_id: data.id,
    form_page_id: page!.id,
  };
}

export async function seed_form_page_blocks({
  form_id,
  form_page_id,
}: {
  form_id: string;
  form_page_id: string;
}) {
  // default template blocks
  // 1. section
  // - header block
  // - field block

  const { data: section_block } = await client
    .from("form_block")
    .insert({
      type: "section",
      form_id,
      form_page_id,
      local_index: 0,
    })
    .select("id")
    .single();

  const section_1_id = section_block!.id;

  await client.from("form_block").insert([
    {
      type: "header",
      form_id,
      form_page_id,
      parent_id: section_1_id,
      title_html: "Untitled Section",
      local_index: 0,
    },
    {
      type: "field",
      form_id,
      form_page_id,
      parent_id: section_1_id,
      local_index: 0,
    },
  ]);
}
