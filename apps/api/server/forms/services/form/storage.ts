import { GRIDA_FORMS_RESPONSE_BUCKET } from "../../k/env";
import { service_role } from "../../db";
import { FileStorage, SessionStagedFileStorage } from "./session-storage";
import { createXSupabaseClient } from "../x-supabase/index";
import type { SchemaTableConnectionXSupabaseMainTableJoint } from "../../types";
import type { FormFieldDefinition, FormFieldStorageSchema } from "@grida/forms";
import assert from "assert";

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
      supabase_connection: SchemaTableConnectionXSupabaseMainTableJoint | null;
    };
  }) {
    if (field.storage) {
      const { type, mode, bucket, path } =
        // oxlint-disable-next-line typescript-eslint/no-explicit-any -- field.storage JSON column type mismatch with domain type
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
        service_role.forms,
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
      supabase_connection: SchemaTableConnectionXSupabaseMainTableJoint | null;
    };
  }) {
    //
    if (field.storage) {
      // oxlint-disable-next-line typescript-eslint/no-explicit-any -- field.storage JSON column type mismatch with domain type
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
      const storage = new FileStorage(
        service_role.forms,
        GRIDA_FORMS_RESPONSE_BUCKET
      );

      return storage.getPublicUrl(file.path);
    }
  }
}
