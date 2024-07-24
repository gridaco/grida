import { client } from "@/lib/supabase/server";
import { FormResponseUnknownFieldHandlingStrategyType } from "@/types";

export async function create_new_form_with_document({
  project_id,
  ...optional
}: {
  project_id: number;
} & Partial<{
  default_form_page_id?: string | null;
  description?: string | null;
  is_max_form_responses_by_customer_enabled?: boolean;
  is_max_form_responses_in_total_enabled?: boolean;
  max_form_responses_by_customer?: number | null;
  max_form_responses_in_total?: number | null;
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
  const { data: document } = await client
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
      default_form_page_id: document!.id,
    })
    .eq("id", data.id);

  return {
    form_id: data.id,
    form_document_id: document!.id,
  };
}

export async function seed_form_document_blocks({
  form_id,
  form_document_id: form_document_id,
}: {
  form_id: string;
  form_document_id: string;
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
      form_page_id: form_document_id,
      local_index: 0,
    })
    .select("id")
    .single();

  const section_1_id = section_block!.id;

  await client.from("form_block").insert([
    {
      type: "header",
      form_id,
      form_page_id: form_document_id,
      parent_id: section_1_id,
      title_html: "Untitled Section",
      local_index: 0,
    },
    {
      type: "field",
      form_id,
      form_page_id: form_document_id,
      parent_id: section_1_id,
      local_index: 0,
    },
  ]);
}
