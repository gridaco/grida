import { service_role } from "../db";
import { SessionStorageServices } from "../services/form/storage";
import { FormsApiResponse, StoragePublicUrlData } from "../types";
import { parse_tmp_storage_object_path } from "../services/form/session-storage";
import type { FormFieldStorageSchema } from "@grida/forms";

type Params = { session: string; field: string };

export async function GET(req: Request, params: Params) {
  const { session: session_id, field: field_id } = params;
  const path = new URL(req.url).searchParams.get("path");

  if (!path)
    return Response.json({ error: "path is required" }, { status: 400 });

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

  const storage = field.storage as FormFieldStorageSchema | null;
  if (storage?.type === "x-supabase" && storage.mode === "direct") {
    if (path !== storage.path) {
      return Response.json({ error: "invalid path" }, { status: 400 });
    }
  } else {
    try {
      const staged = parse_tmp_storage_object_path(path);
      if (staged.session_id !== session_id || staged.field_id !== field_id) {
        return Response.json({ error: "invalid path" }, { status: 400 });
      }
    } catch {
      return Response.json({ error: "invalid path" }, { status: 400 });
    }
  }

  const { data: publicurldata } = await SessionStorageServices.getPublicUrl({
    field: field,
    connection: { supabase_connection: form.supabase_connection },
    file: { path: path },
  });

  return Response.json(<FormsApiResponse<StoragePublicUrlData>>{
    data: publicurldata,
    error: null,
  });
}
