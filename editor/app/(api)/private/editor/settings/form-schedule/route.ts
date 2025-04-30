import { createFormsClient } from "@/lib/supabase/server";
import {
  EditorApiResponseOk,
  UpdateFormScheduleRequest,
} from "@/types/private/api";
import assert from "assert";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const data: UpdateFormScheduleRequest = await req.json();

  const { form_id, enabled, open_at, close_at, scheduling_tz } = data;

  assert(form_id, "form_id is required");

  const formsClient = await createFormsClient();

  const { error } = await formsClient
    .from("form")
    .update({
      is_scheduling_enabled: enabled,
      scheduling_open_at: open_at,
      scheduling_close_at: close_at,
      scheduling_tz: scheduling_tz,
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
