import { editorlink } from "@/lib/forms/url";
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

  const __raw_redirect_after_response_uri = formdata.get(
    "redirect_after_response_uri"
  );
  const redirect_after_response_uri = __raw_redirect_after_response_uri
    ? String(__raw_redirect_after_response_uri)
    : undefined;

  const __raw_is_redirect_after_response_uri_enabled = formdata.get(
    "is_redirect_after_response_uri_enabled"
  );
  const is_redirect_after_response_uri_enabled =
    String(__raw_is_redirect_after_response_uri_enabled) === "on";

  console.log("POST /private/editor/settings/redirect-uri", {
    form_id,
    redirect_after_response_uri,
    is_redirect_after_response_uri_enabled,
  });

  if (!form_id) {
    return notFound();
  }

  const supabase = createRouteHandlerClient(cookieStore);

  await supabase
    .from("form_document")
    .update({
      redirect_after_response_uri: redirect_after_response_uri,
      is_redirect_after_response_uri_enabled:
        is_redirect_after_response_uri_enabled,
    })
    .eq("form_id", form_id)
    .single();

  // redirect to the page requested
  return NextResponse.redirect(
    editorlink("settings/general", { origin, form_id }),
    {
      status: 301,
    }
  );
}
