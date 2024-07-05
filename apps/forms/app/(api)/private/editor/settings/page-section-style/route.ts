import { createRouteHandlerClient } from "@/lib/supabase/server";
import { FormStyleSheetV1Schema } from "@/types";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const formdata = await req.formData();

  const cookieStore = cookies();

  const form_id = String(formdata.get("form_id"));

  const __raw_css = formdata.get("css");
  const css = __raw_css ? String(__raw_css) : null;

  if (!form_id) {
    return notFound();
  }

  const supabase = createRouteHandlerClient(cookieStore);

  const { data: old, error } = await supabase
    .from("form_page")
    .select("stylesheet")
    .eq("form_id", form_id)
    .single();

  if (error) {
    console.error(error);
    return NextResponse.error();
  }

  if (!old) {
    return notFound();
  }

  const stylesheet = css
    ? ({
        ...((old.stylesheet as {}) || {}),
        section: css,
      } satisfies FormStyleSheetV1Schema)
    : old;

  await supabase
    .from("form_page")
    .update({
      stylesheet: stylesheet,
    })
    // TODO: when we support multiple pages per form, we need to update the query
    .eq("form_id", form_id)
    .single();

  // redirect to the page requested
  return NextResponse.redirect(origin + `/d/${form_id}/settings/customize`, {
    status: 301,
  });
}
