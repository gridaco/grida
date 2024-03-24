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

  return NextResponse.redirect(origin + `/d/${data.id}`, {
    status: 301,
  });
}
