import { createFormsClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const formsClient = await createFormsClient();

  const { data, error } = await formsClient
    .from("gist")
    .insert({
      data: {
        ["form.json"]: body.src,
      },
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    return NextResponse.error();
  }
  return NextResponse.json(data);
}
