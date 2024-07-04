import { client } from "@/lib/supabase/server";
import { SessionStorageServices } from "@/services/form/storage";
import type {
  CreateSessionSignedUploadUrlRequest,
  FormsApiResponse,
  SessionSignedUploadUrlData,
} from "@/types/private/api";
import assert from "assert";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
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

  const body = (await req.json()) as CreateSessionSignedUploadUrlRequest;

  const { file } = body;

  // TODO: validate if anonymous user is owner of this session
  // TODO: validate if session is open

  const { data, error } = await client
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

  const { data: signeduploadurldata, error: signerr } =
    await SessionStorageServices.createSignedUploadUrl({
      session_id: session_id,
      field: field,
      connection: { supabase_connection: form.supabase_connection },
      file: file,
      config: {},
    });

  return NextResponse.json(<FormsApiResponse<SessionSignedUploadUrlData>>{
    data: signeduploadurldata,
    error: signerr,
  });
}

export async function PUT(
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

  const body = (await req.json()) as CreateSessionSignedUploadUrlRequest;

  const { file } = body;

  // TODO: validate if anonymous user is owner of this session
  // TODO: validate if session is open

  const { data, error } = await client
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

  const { data: signeduploadurldata, error: signerr } =
    await SessionStorageServices.createSignedUploadUrl({
      session_id: session_id,
      field: field,
      connection: { supabase_connection: form.supabase_connection },
      file: file,
      config: {
        unique: true,
      },
    });

  if (signerr) {
    console.error("session/sign-upload-urls", error);
    return NextResponse.error();
  }

  return NextResponse.json(<FormsApiResponse<SessionSignedUploadUrlData>>{
    data: signeduploadurldata,
    error: signerr,
  });
}
