import { createFormsClient } from "@/lib/supabase/server";
import {
  EditorApiResponseOk,
  UpdateFormAccessMaxResponseInTotalRequest,
} from "@/types/private/api";
import assert from "assert";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const data: UpdateFormAccessMaxResponseInTotalRequest = await req.json();

  const { form_id, enabled, max } = data;

  assert(form_id, "form_id is required");

  const formsClient = await createFormsClient();

  const { error } = await formsClient
    .from("form")
    .update({
      max_form_responses_in_total: max ?? null,
      is_max_form_responses_in_total_enabled: enabled,
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
