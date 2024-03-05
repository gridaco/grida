import { client } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const { data, error } = await client
    .from("form")
    .insert({
      project_id: 2,
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
