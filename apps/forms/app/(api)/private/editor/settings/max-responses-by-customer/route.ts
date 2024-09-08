import { createRouteHandlerClient } from "@/supabase/server";
import {
  EditorApiResponseOk,
  UpdateFormAccessMaxResponseByCustomerRequest,
} from "@/types/private/api";
import assert from "assert";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const data: UpdateFormAccessMaxResponseByCustomerRequest = await req.json();

  const cookieStore = cookies();

  const { form_id, enabled, max } = data;

  assert(form_id, "form_id is required");

  const supabase = createRouteHandlerClient(cookieStore);

  const { error } = await supabase
    .from("form")
    .update({
      max_form_responses_by_customer: max ?? null,
      is_max_form_responses_by_customer_enabled: enabled,
    })
    .eq("id", form_id)
    .single();

  if (error) {
    console.error(error);
    return notFound();
  }

  return NextResponse.json({
    data: null,
    error: null,
  } satisfies EditorApiResponseOk);
}
