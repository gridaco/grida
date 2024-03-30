import { createRouteHandlerClient } from "@/lib/supabase/server";
import { FormResponseUnknownFieldHandlingStrategyType } from "@/types";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const formdata = await req.formData();

  const cookieStore = cookies();

  const form_id = String(formdata.get("form_id"));

  const __raw_unknown_field_handling_strategy = formdata.get(
    "unknown_field_handling_strategy"
  );
  const unknown_field_handling_strategy = __raw_unknown_field_handling_strategy
    ? (String(
        __raw_unknown_field_handling_strategy
      ) as FormResponseUnknownFieldHandlingStrategyType)
    : undefined;

  if (!form_id) {
    return notFound();
  }

  const supabase = createRouteHandlerClient(cookieStore);

  await supabase
    .from("form")
    .update({
      unknown_field_handling_strategy: unknown_field_handling_strategy,
    })
    .eq("id", form_id)
    .single();

  // redirect to the page requested
  return NextResponse.redirect(origin + `/d/${form_id}/settings/general`, {
    status: 301,
  });
}
