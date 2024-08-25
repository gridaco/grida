import { GRIDA_FORMS_RESPONSE_BUCKET } from "@/k/env";
import { UniqueFileNameGenerator } from "@/lib/forms/storage";
import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";
import { grida_forms_client } from "@/lib/supabase/server";
import { TemplateVariables } from "@/lib/templating";
import {
  FileStorage,
  SessionStagedFileStorage,
} from "@/services/form/session-storage";
import {
  GridaXSupabaseService,
  XSupabase,
  createXSupabaseClient,
} from "@/services/x-supabase";
import {
  SchemaTableConnectionXSupabaseMainTableJoint,
  FormFieldDefinition,
  FormFieldStorageSchema,
} from "@/types";
import { CreateSignedUploadUrlRequest } from "@/types/private/api";
import assert from "assert";

export class FieldStorageService {
  constructor(
    readonly field_id: string,
    readonly storage: FormFieldStorageSchema | null,
    readonly supabase_connection: SchemaTableConnectionXSupabaseMainTableJoint | null
  ) {
    //
  }

  private _m_xsupabaseclient: XSupabase.Client | null = null;
  private async getXSupabaseClient() {
    if (this._m_xsupabaseclient) {
      return this._m_xsupabaseclient;
    }

    assert(this.supabase_connection, "supabase_connection not found");

    // can be optimized with the query
    const conn = await new GridaXSupabaseService().getConnection(
      this.supabase_connection
    );

    this._m_xsupabaseclient = await createXSupabaseClient(
      this.supabase_connection.supabase_project_id,
      {
        db: {
          schema: conn?.main_supabase_table?.sb_schema_name,
        },
        service_role: true,
      }
    );

    return this._m_xsupabaseclient;
  }

  private _m_fileStorage: FileStorage | null = null;
  private async getFileStorage() {
    if (this._m_fileStorage) {
      return this._m_fileStorage;
    }

    if (this.storage) {
      if (this.storage.type === "x-supabase") {
        assert(this.supabase_connection, "supabase_connection not found");
        const client = await this.getXSupabaseClient();

        this._m_fileStorage = new FileStorage(client, this.storage.bucket);
        return this._m_fileStorage;
      }

      throw new Error("storage type not supported");
    }

    this._m_fileStorage = new FileStorage(
      grida_forms_client,
      GRIDA_FORMS_RESPONSE_BUCKET
    );
    return this._m_fileStorage;
  }

  async createSignedUploadUrlFromFile(
    row_id: string,
    file: CreateSignedUploadUrlRequest["file"],
    options?: { upsert: boolean }
  ) {
    if (this.storage) {
      switch (this.storage.type) {
        case "x-supabase": {
          const { path: pathtemplate } = this.storage;

          const xclient = await this.getXSupabaseClient();

          const xsupaservice = new GridaXSupabaseService();
          const conn = await xsupaservice.getConnection(
            this.supabase_connection!
          );

          const { sb_table_name, sb_table_schema } = conn?.main_supabase_table!;
          const { pks } =
            SupabasePostgRESTOpenApi.parse_supabase_postgrest_schema_definition(
              sb_table_schema
            );

          const pk = pks[0];
          const { data: row, error } = await xclient
            .from(sb_table_name)
            .select("*")
            .eq(pk, row_id)
            .single();
          if (error) throw error;
          assert(row, "row not found");

          const rowcontext = TemplateVariables.createContext(
            "x-supabase.postgrest_query_insert_select",
            {
              TABLE: { pks },
              RECORD: row,
              NEW: row,
            }
          );

          const filecontext = TemplateVariables.createContext("current_file", {
            file,
          });

          const renderedpath = XSupabase.Storage.renderpath(pathtemplate, {
            ...rowcontext,
            ...filecontext,
          });

          return this.createSignedUploadUrl(renderedpath, options);
        }
        default: {
          throw new Error("storage type not supported");
        }
      }
    } else {
      const basepath = `response/${row_id}/${this.field_id}/`;
      const uniqueFileNameGenerator = new UniqueFileNameGenerator();
      const uniqueFileName = uniqueFileNameGenerator.name(file.name);
      const renderedpath = basepath + uniqueFileName;
      return this.createSignedUploadUrl(renderedpath, options);
    }
  }

  async createSignedUpsertUrlFromPath(path: string) {
    return this.createSignedUploadUrl(path, { upsert: true });
  }

  private async createSignedUploadUrl(
    path: string,
    options?: { upsert: boolean }
  ) {
    const fs = await this.getFileStorage();
    return fs.createSignedUploadUrl(path, options);
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
      supabase_connection: SchemaTableConnectionXSupabaseMainTableJoint | null;
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
        grida_forms_client,
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
        grida_forms_client,
        GRIDA_FORMS_RESPONSE_BUCKET
      );

      return storage.getPublicUrl(file.path);
    }
  }
}

export function parseStorageUrlOptions(searchParams: URLSearchParams) {
  const qwidth = searchParams.get("width");
  const width = Number(qwidth) || undefined;
  const qdownload = searchParams.get("download");
  const download = qdownload === "true" || qdownload === "1";
  const format = download ? "origin" : undefined;
  const options = {
    download: download,
    format: format,
    transform: {
      width: width,
      height: width,
      // resize: width ? ("contain" as const) : undefined,
    },
  };

  return options;
}
