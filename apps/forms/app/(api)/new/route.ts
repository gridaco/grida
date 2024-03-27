import { client } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const project_id = Number(request.nextUrl.searchParams.get("project_id"));

  if (!project_id) {
    return NextResponse.error();
  }

  const { data, error } = await client
    .from("form")
    .insert({
      project_id: project_id,
    })
    .select("*")
    .single();

  if (!data) {
    console.error("error while creating new form", error);
    return NextResponse.error();
  }

  // create a default page
  const { data: page } = await client
    .from("form_page")
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

  try {
    await seed_form_page_blocks({
      form_id: data.id,
      form_page_id: page!.id,
    });
  } catch (e) {
    // this won't be happening
    console.error("error while seeding form page blocks", e);
    // ignore and continue since the form itself is created anyway.
  }

  return NextResponse.redirect(origin + `/d/${data.id}/blocks`, {
    status: 301,
  });
}

async function seed_form_page_blocks({
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
      data: {},
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
      data: {},
      title_html: "Untitled Section",
      local_index: 0,
    },
    {
      type: "field",
      form_id,
      form_page_id,
      parent_id: section_1_id,
      data: {},
      local_index: 0,
    },
  ]);
}
