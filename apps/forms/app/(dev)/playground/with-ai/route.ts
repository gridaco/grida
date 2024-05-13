import { createRouteHandlerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const formdata = await req.formData();
  const prompt = String(formdata.get("prompt"));
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  console.log("prompt", prompt);

  const { data } = await supabase
    .from("gist")
    .insert({
      data: null,
      prompt: prompt,
    })
    .select("slug")
    .single();

  return NextResponse.redirect(origin + `/playground/${data?.slug}`, {
    status: 303,
  });
}
