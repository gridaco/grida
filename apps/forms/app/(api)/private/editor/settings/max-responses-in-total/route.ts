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

  const __raw_max_form_responses_in_total = formdata.get(
    "max_form_responses_in_total"
  );
  const max_form_responses_in_total = __raw_max_form_responses_in_total
    ? Number(__raw_max_form_responses_in_total)
    : undefined;

  const __raw_is_max_form_responses_in_total_enabled = formdata.get(
    "is_max_form_responses_in_total_enabled"
  );
  const is_max_form_responses_in_total_enabled =
    String(__raw_is_max_form_responses_in_total_enabled) === "on";

  console.log("POST /private/editor/settings/max-response-in-total", {
    form_id,
    max_form_responses_in_total,
    is_max_form_responses_in_total_enabled,
  });

  if (!form_id) {
    return notFound();
  }

  const supabase = createRouteHandlerClient(cookieStore);

  await supabase
    .from("form")
    .update({
      // this can be NaN
      max_form_responses_in_total: max_form_responses_in_total ?? null,
      is_max_form_responses_in_total_enabled: max_form_responses_in_total
        ? is_max_form_responses_in_total_enabled
        : false,
    })
    .eq("id", form_id)
    .single();

  // redirect to the page requested
  return NextResponse.redirect(origin + `/d/${form_id}/settings/general`, {
    status: 301,
  });
}
