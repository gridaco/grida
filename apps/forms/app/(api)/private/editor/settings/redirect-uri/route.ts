import { createRouteHandlerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const formdata = await req.formData();

  const cookieStore = cookies();

  const form_id = String(formdata.get("form_id"));
  const redirect_uri = String(formdata.get("redirect_uri"));

  if (!form_id) {
    return notFound();
  }

  if (redirect_uri == null) {
    return NextResponse.json(
      { error: "redirect_uri is required" },
      { status: 400 }
    );
  }

  const supabase = createRouteHandlerClient(cookieStore);

  await supabase
    .from("form")
    .update({
      redirect_after_response_uri: redirect_uri || null,
    })
    .eq("id", form_id)
    .single();

  // redirect to the page requested
  return NextResponse.redirect(origin + `/d/${form_id}/settings/general`, {
    status: 301,
  });
}
