import { createFormsClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import type {
  EditorApiResponseOk,
  UpdateFormMethodRequest,
} from "@/types/private/api";
import assert from "assert";

export async function POST(req: NextRequest) {
  const data: UpdateFormMethodRequest = await req.json();

  const { form_id, method } = data;

  assert(form_id, "form_id is required");

  const formsClient = await createFormsClient();

  const { error } = await formsClient
    .from("form_document")
    .update({
      method: method,
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
