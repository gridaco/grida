import { service_role } from "../db";
import { SessionStorageServices } from "../services/form/storage";
import type {
  CreateSessionSignedUploadUrlRequest,
  FormsApiResponse,
  SessionSignedUploadUrlData,
} from "../types";

type Params = { session: string; field: string };

export async function POST(req: Request, params: Params) {
  const { session: session_id, field: field_id } = params;

  const body = (await req
    .json()
    .catch(() => null)) as CreateSessionSignedUploadUrlRequest | null;
  const file = body?.file;
  if (!file || typeof file.name !== "string" || !file.name) {
    return Response.json({ error: "file name is required" }, { status: 400 });
  }

  // TODO: validate if anonymous user is owner of this session
  // TODO: validate if session is open

  const { data, error } = await service_role.forms
    .from("response_session")
    .select(
      `id, form:form( fields:attribute( id, storage ), supabase_connection:connection_supabase(*) )`
    )
    .eq("id", session_id)
    .single();

  if (error || !data) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const { form } = data;
  if (!form) return Response.json({ error: "not found" }, { status: 404 });

  const field = form.fields.find((field) => field.id === field_id);
  if (!field) return Response.json({ error: "not found" }, { status: 404 });

  const { data: signeduploadurldata, error: signerr } =
    await SessionStorageServices.createSignedUploadUrl({
      session_id: session_id,
      field: field,
      connection: { supabase_connection: form.supabase_connection },
      file: file,
      config: {},
    });

  if (signerr) {
    return Response.json({ error: "unable to sign upload" }, { status: 500 });
  }
  return Response.json(<FormsApiResponse<SessionSignedUploadUrlData>>{
    data: signeduploadurldata,
    error: signerr,
  });
}

export async function PUT(req: Request, params: Params) {
  const { session: session_id, field: field_id } = params;

  const body = (await req
    .json()
    .catch(() => null)) as CreateSessionSignedUploadUrlRequest | null;
  const file = body?.file;
  if (!file || typeof file.name !== "string" || !file.name) {
    return Response.json({ error: "file name is required" }, { status: 400 });
  }

  // TODO: validate if anonymous user is owner of this session
  // TODO: validate if session is open

  const { data, error } = await service_role.forms
    .from("response_session")
    .select(
      `id, form:form( fields:attribute( id, storage ), supabase_connection:connection_supabase(*) )`
    )
    .eq("id", session_id)
    .single();

  if (error || !data) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const { form } = data;
  if (!form) return Response.json({ error: "not found" }, { status: 404 });

  const field = form.fields.find((field) => field.id === field_id);
  if (!field) return Response.json({ error: "not found" }, { status: 404 });

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
    return Response.json({ error: "internal error" }, { status: 500 });
  }

  return Response.json(<FormsApiResponse<SessionSignedUploadUrlData>>{
    data: signeduploadurldata,
    error: signerr,
  });
}
