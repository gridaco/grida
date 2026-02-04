import { createFormsClient } from "@/lib/supabase/server";
import type {
  EditorApiResponseOk,
  UpdateFormNotificationRespondentEmailRequest,
} from "@/types/private/api";
import assert from "assert";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const data: UpdateFormNotificationRespondentEmailRequest = await req.json();

  const {
    form_id,
    enabled,
    from_name,
    subject_template,
    body_html_template,
    reply_to,
  } = data;

  assert(form_id, "form_id is required");

  const formsClient = await createFormsClient();

  const { error } = await formsClient
    .from("form")
    .update({
      notification_respondent_email: {
        enabled,
        from_name: from_name ?? null,
        subject_template: subject_template ?? null,
        body_html_template: body_html_template ?? null,
        reply_to: reply_to ?? null,
      },
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
