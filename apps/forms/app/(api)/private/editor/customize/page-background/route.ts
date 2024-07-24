import { editorlink } from "@/lib/forms/url";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { FormPageBackgroundSchema } from "@/types";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const formdata = await req.formData();

  const cookieStore = cookies();

  const form_id = String(formdata.get("form_id"));

  const __raw_src = formdata.get("src");
  const src = __raw_src ? String(__raw_src) : null;

  if (!form_id) {
    return notFound();
  }

  const supabase = createRouteHandlerClient(cookieStore);

  const background: FormPageBackgroundSchema | null = src
    ? {
        type: "background",
        element: "iframe",
        src,
      }
    : null;

  await supabase
    .from("form_document")
    .update({
      background: background as any,
    })
    // TODO: when we support multiple pages per form, we need to update the query
    .eq("form_id", form_id)
    .single();

  // redirect to the page requested
  return NextResponse.redirect(
    editorlink("settings/customize", { origin, form_id }),
    {
      status: 301,
    }
  );
}
