import { createFormsClient } from "@/lib/supabase/server";
import type {
  EditorApiResponseOk,
  UpdateFormRedirectAfterSubmissionRequest,
} from "@/types/private/api";
import assert from "assert";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const data: UpdateFormRedirectAfterSubmissionRequest = await req.json();

  const {
    form_id,
    is_redirect_after_response_uri_enabled,
    redirect_after_response_uri,
  } = data;

  assert(form_id, "form_id is required");

  const formsClient = await createFormsClient();

  const { error } = await formsClient
    .from("form_document")
    .update({
      redirect_after_response_uri: redirect_after_response_uri,
      is_redirect_after_response_uri_enabled:
        is_redirect_after_response_uri_enabled,
      // disabling the ending page if redirect is enabled
      is_ending_page_enabled: is_redirect_after_response_uri_enabled
        ? false
        : undefined,
    })
    .eq("form_id", form_id)
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
