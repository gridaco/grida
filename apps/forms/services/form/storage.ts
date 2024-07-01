import { GRIDA_FORMS_RESPONSE_BUCKET } from "@/k/env";
import { client } from "@/lib/supabase/server";
import {
  FileStorage,
  SessionStagedFileStorage,
} from "@/services/form/session-storage";
import { createXSupabaseClient } from "@/services/x-supabase";
import {
  ConnectionSupabaseJoint,
  FormFieldDefinition,
  FormFieldStorageSchema,
} from "@/types";
import assert from "assert";

export async function createSignedUploadUrl({
  form,
  field_id,
  file,
  options,
}: {
  field_id: string;
  file: { path: string };
  form: {
    id: string;
    fields: FormFieldDefinition[];
    supabase_connection: ConnectionSupabaseJoint | null;
  };
  options?: {
    upsert: boolean;
  };
}) {
  const field = form.fields.find((field) => field.id === field_id);
  assert(field, "field not found");

  if (field.storage) {
    const {
      type,
      bucket,
      path: pathtemplate,
      mode,
    } = field.storage as any as FormFieldStorageSchema;

    if (options?.upsert) {
      switch (type) {
        case "x-supabase": {
          assert(form.supabase_connection, "supabase_connection not found");
          const client = await createXSupabaseClient(
            form.supabase_connection.supabase_project_id,
            {
              service_role: true,
            }
          );

          const storage = new FileStorage(client, bucket);
          return storage.createSignedUploadUrl(file.path, {
            upsert: true,
          });
        }
        case "grida":
        case "x-s3":
        default:
          throw new Error("storage type not supported");
      }
    } else {
      // non upsert operation is not supported yet.
      throw new Error("not implemented");
    }
  } else {
    throw new Error("not implemented");

    const storage = new FileStorage(client, GRIDA_FORMS_RESPONSE_BUCKET);

    return storage.createSignedUploadUrl(file.path, options);
  }
}

export namespace SessionStorageServices {
  export async function createSignedUploadUrl({
    session_id,
    field,
    file,
    config,
    connection,
  }: {
    session_id: string;
    field: Pick<FormFieldDefinition, "id" | "storage">;
    file: {
      name: string;
    };
    config?: {
      unique?: boolean;
    };
    connection: {
      supabase_connection: ConnectionSupabaseJoint | null;
    };
  }) {
    if (field.storage) {
      const { type, mode, bucket, path } =
        field.storage as any as FormFieldStorageSchema;

      switch (type) {
        case "x-supabase": {
          assert(
            connection.supabase_connection,
            "supabase_connection not found"
          );
          const client = await createXSupabaseClient(
            connection.supabase_connection.supabase_project_id,
            {
              service_role: true,
            }
          );
          switch (mode) {
            case "direct": {
              const storage = new FileStorage(client, bucket);
              return storage.createSignedUploadUrl(path);
              break;
            }
            case "staged": {
              const storage = new SessionStagedFileStorage(client, bucket);
              return storage.createStagedSignedUploadUrl(
                {
                  field_id: field.id,
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

      return storage.createStagedSignedUploadUrl(
        {
          field_id: field.id,
          session_id: session_id,
        },
        file.name,
        config?.unique
      );
    }
  }

  export async function getPublicUrl({
    field,
    file,
    connection,
  }: {
    field: Pick<FormFieldDefinition, "id" | "storage">;
    file: {
      path: string;
    };
    connection: {
      supabase_connection: ConnectionSupabaseJoint | null;
    };
  }) {
    //
    if (field.storage) {
      const { type, bucket } = field.storage as any as FormFieldStorageSchema;

      switch (type) {
        case "x-supabase": {
          assert(
            connection.supabase_connection,
            "supabase_connection not found"
          );
          const client = await createXSupabaseClient(
            connection.supabase_connection.supabase_project_id,
            {
              // we don't need service role here - we are getting public url (does not require api request)
              service_role: false,
            }
          );

          const storage = new FileStorage(client, bucket);
          return storage.getPublicUrl(file.path);
        }
        case "grida":
        case "x-s3":
        default:
          throw new Error("storage type not supported");
      }
    } else {
      const storage = new FileStorage(client, GRIDA_FORMS_RESPONSE_BUCKET);

      return storage.getPublicUrl(file.path);
    }
  }
}
