import { createRouteHandlerClient } from "@/lib/supabase/server";
import { FormsPageLanguage } from "@/types";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const formdata = await req.formData();

  const cookieStore = cookies();

  const form_id = String(formdata.get("form_id"));

  const __raw_default_form_page_language = formdata.get(
    "default_form_page_language"
  );
  const default_form_page_language = __raw_default_form_page_language
    ? (String(__raw_default_form_page_language) as FormsPageLanguage)
    : undefined;

  if (!form_id) {
    return notFound();
  }

  const supabase = createRouteHandlerClient(cookieStore);

  await supabase
    .from("form")
    .update({
      default_form_page_language: default_form_page_language,
    })
    .eq("id", form_id)
    .single();

  // redirect to the page requested
  return NextResponse.redirect(origin + `/d/${form_id}/settings/customize`, {
    status: 301,
  });
}
