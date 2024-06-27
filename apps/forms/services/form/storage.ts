import { GRIDA_FORMS_RESPONSE_BUCKET } from "@/k/env";
import { client } from "@/lib/supabase/server";
import {
  FileStorage,
  SessionStagedFileStorage,
} from "@/services/form/session-storage";
import { createXSupabaseClient } from "@/services/x-supabase";
import { FormFieldStorageSchema } from "@/types";
import assert from "assert";

export function createSignedUploadUrl({}: {
  form_id: string;
  field_id: string;
  path: string;
}) {
  //
}

export async function session_storage_createSignedUploadUrl({
  session_id,
  field_id,
  file,
  config,
}: {
  session_id: string;
  field_id: string;
  file: {
    name: string;
  };
  config?: {
    unique?: boolean;
  };
}) {
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

  if (field.storage) {
    const { type, mode, bucket, path } =
      field.storage as any as FormFieldStorageSchema;

    switch (type) {
      case "x-supabase": {
        assert(form.supabase_connection, "supabase_connection not found");
        const client = await createXSupabaseClient(
          form.supabase_connection.supabase_project_id,
          {
            service_role: true,
          }
        );
        switch (mode) {
          case "direct": {
            const storage = new FileStorage(client, bucket);
            return storage.sign(path);
            break;
          }
          case "staged": {
            const storage = new SessionStagedFileStorage(client, bucket);
            return storage.sessionStagedUploadPresingedUrl(
              {
                field_id: field_id,
                session_id: session_id,
              },
              file.name,
              config?.unique
            );
          }
        }
        break;
      }
      case "grida":
      case "x-s3":
      default:
        throw new Error("storage type not supported");
    }
  } else {
    const storage = new SessionStagedFileStorage(
      client,
      GRIDA_FORMS_RESPONSE_BUCKET
    );

    return storage.sessionStagedUploadPresingedUrl(
      {
        field_id: field_id,
        session_id: session_id,
      },
      file.name,
      config?.unique
    );
  }
}
