import { createFormsClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const formdata = await req.formData();
  const prompt = String(formdata.get("prompt"));
  const formsClient = await createFormsClient();

  const { data } = await formsClient
    .from("gist")
    .insert({
      data: null,
      prompt: prompt,
    })
    .select("slug")
    .single();

  return NextResponse.redirect(origin + `/playground/forms/${data?.slug}`, {
    status: 303,
  });
}
