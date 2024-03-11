import { client } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

export async function GET(request: NextRequest) {
  const project_id = Number(request.nextUrl.searchParams.get("project_id"));

  if (!project_id) {
    return NextResponse.error();
  }

  const origin = request.nextUrl.origin;
  const { data, error } = await client
    .from("form")
    .insert({
      project_id: project_id,
    })
    .select("id")
    .single();

  if (!data) {
    console.error(error);
    return NextResponse.error();
  }

  return NextResponse.redirect(origin + `/d/${data.id}`, {
    status: 301,
  });
}
