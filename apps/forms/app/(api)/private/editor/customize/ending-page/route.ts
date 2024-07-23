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

  const __raw_template_id = formdata.get("template_id");
  const template_id = __raw_template_id ? String(__raw_template_id) : null;

  if (!form_id) {
    return notFound();
  }

  const supabase = createRouteHandlerClient(cookieStore);

  const is_ending_page_enabled = template_id ? true : false;

  await supabase
    .from("form_document")
    .update({
      is_ending_page_enabled: is_ending_page_enabled,
      ending_page_template_id: template_id,
      is_redirect_after_response_uri_enabled:
        // turn off if ending page enabled, otherwise don't change
        is_ending_page_enabled == true ? false : undefined,
    })
    .eq("form_id", form_id);

  // redirect to the page requested
  return NextResponse.redirect(origin + `/d/${form_id}/settings/customize`, {
    status: 301,
  });
}
