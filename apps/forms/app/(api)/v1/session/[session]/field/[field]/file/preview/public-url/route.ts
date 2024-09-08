import { grida_forms_client } from "@/supabase/server";
import { SessionStorageServices } from "@/services/form/storage";
import { FormsApiResponse, StoragePublicUrlData } from "@/types/private/api";
import assert from "assert";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  context: {
    params: {
      session: string;
      field: string;
    };
  }
) {
  const session_id = context.params.session;
  const field_id = context.params.field;
  const path = req.nextUrl.searchParams.get("path");

  assert(path, "path is required");

  // TODO: validate if anonymous user is owner of this session
  // TODO: validate if session is open

  const { data, error } = await grida_forms_client
    .from("response_session")
    .select(
      `id, form:form( fields:form_field( id, storage ), supabase_connection:connection_supabase(*) )`
    )
    .eq("id", session_id)
    .single();

  if (error || !data) {
    throw error;
  }

  const { form } = data;
  assert(form, "form not found");

  const field = form.fields.find((field) => field.id === field_id);
  assert(field, "form not found");

  const { data: publicurldata } = await SessionStorageServices.getPublicUrl({
    field: field,
    connection: { supabase_connection: form.supabase_connection },
    file: { path: path },
  });

  return NextResponse.json(<FormsApiResponse<StoragePublicUrlData>>{
    data: publicurldata,
    error: null,
  });
}
