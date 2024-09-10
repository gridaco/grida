import { createRouteHandlerFormsClient } from "@/supabase/server";
import type {
  EditorApiResponseOk,
  UpdateFormUnknownFieldsHandlingStrategyRequest,
} from "@/types/private/api";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import assert from "assert";

export const revalidate = 0;

export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const data: UpdateFormUnknownFieldsHandlingStrategyRequest = await req.json();

  const cookieStore = cookies();

  const { form_id, strategy } = data;

  assert(form_id, "form_id is required");

  const supabase = createRouteHandlerFormsClient(cookieStore);

  const { error } = await supabase
    .from("form")
    .update({
      unknown_field_handling_strategy: strategy,
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
