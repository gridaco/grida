import { grida_xsupabase_client } from "@/lib/supabase/server";
import { secureformsclient } from "@/lib/supabase/vault";
import {
  SchemaTableConnectionXSupabaseMainTableJoint,
  GridaXSupabase,
} from "@/types";
import {
  SupabaseClient,
  SupabaseClientOptions,
  createClient,
} from "@supabase/supabase-js";
import { SupabaseStorageExtensions } from "@/lib/supabase/storage-ext";
import { render } from "@/lib/templating/template";
import type { XSupabaseStorageSchema } from "@/types";
import type { TemplateVariables } from "@/lib/templating";
import type { StorageError } from "@supabase/storage-js";
import assert from "assert";
import "core-js/features/map/group-by";

export async function createXSupabaseClient(
  supabase_project_id: number,
  config?: SupabaseClientOptions<any> & { service_role?: boolean }
): Promise<SupabaseClient<any, any>> {
  // fetch connection table
  const { data: supabase_project, error: supabase_project_err } =
    await grida_xsupabase_client
      .from("supabase_project")
      .select("*, tables:supabase_table(*)")
      .eq("id", supabase_project_id)
      .single();

  if (supabase_project_err || !supabase_project) {
    throw new Error("supabase_project not found");
  }
  const { sb_project_url, sb_anon_key } = supabase_project;

  let serviceRoleKey: string | null = null;
  if (config?.service_role) {
    const { data } = await __dangerously_fetch_secure_service_role_key(
      supabase_project.id
    );
    serviceRoleKey = data;
    assert(serviceRoleKey, "serviceRoleKey is required");
  }

  const apiKey = serviceRoleKey || sb_anon_key;

  const sbclient = createClient(sb_project_url, apiKey, {
    db: config?.db,
  });

  return sbclient;
}

/**
 * This may only be used in a secure context.
 *
 * @deprecated drop this, add a new rpc with rls enabled.
 * FIXME: this is a potential security risk.
 */
export async function __dangerously_fetch_secure_service_role_key(
  supabase_project_id: number
) {
  return secureformsclient.rpc(
    "reveal_secret_connection_supabase_service_key",
    {
      p_supabase_project_id: supabase_project_id,
    }
  );
}

export async function secureCreateServiceKey(
  supabase_project_id: number,
  service_key: string
) {
  return secureformsclient.rpc(
    "create_secret_connection_supabase_service_key",
    {
      p_supabase_project_id: supabase_project_id,
      p_secret: service_key,
    }
  );
}

export class GridaXSupabaseService {
  constructor() {}

  async getXSBMainTableConnectionState(
    conn: SchemaTableConnectionXSupabaseMainTableJoint
  ): Promise<GridaXSupabase.XSupabaseMainTableConnectionState | null> {
    const { supabase_project_id, main_supabase_table_id } = conn;

    const { data: supabase_project, error: supabase_project_err } =
      await grida_xsupabase_client
        .from("supabase_project")
        .select(`*, tables:supabase_table(*)`)
        .eq("id", supabase_project_id)
        .single();

    if (supabase_project_err) console.error(supabase_project_err);
    if (!supabase_project) {
      return null;
    }

    return {
      ...conn,
      supabase_project:
        supabase_project! as {} as GridaXSupabase.SupabaseProject,
      main_supabase_table_id,
      tables: supabase_project!.tables as any as GridaXSupabase.SupabaseTable[],
      main_supabase_table:
        (supabase_project!.tables.find(
          (t) => t.id === main_supabase_table_id
        ) as any as GridaXSupabase.SupabaseTable) || null,
    };
  }
}

export namespace XSupabase {
  //
  //
  export type Client = SupabaseClient<any, any>;

  export namespace Storage {
    export type CreateSignedUrlResult =
      | {
          data: { signedUrl: string };
          error: null;
        }
      | {
          data: null;
          error: StorageError;
        };

    export type CreateSignedUrlsResult =
      | {
          data: {
            error: string | null;
            path: string | null;
            signedUrl: string;
          }[];
          error: null;
        }
      | {
          data: null;
          error: StorageError;
        };

    export class ConnectedClient {
      /**
       * dummy table info since this does not use a table variable
       */
      table_dummy: TemplateVariables.XSupabase.PostgresQuerySelectContext["TABLE"] =
        {
          pks: [] as string[],
        };

      constructor(public readonly storage: SupabaseClient["storage"]) {}

      async exists(storage: XSupabaseStorageSchema, row: Record<string, any>) {
        assert(storage.type === "x-supabase");
        const { bucket, path: pathtemplate } = storage;
        const renderedpath = renderpath(pathtemplate, {
          TABLE: this.table_dummy,
          NEW: row,
          RECORD: row,
        });

        return await SupabaseStorageExtensions.exists(
          this.storage,
          bucket,
          renderedpath
        );
      }

      createSignedUrl(
        row: Record<string, any>,
        fieldstorage: XSupabaseStorageSchema
      ) {
        assert(fieldstorage.type === "x-supabase");
        const { bucket, path: pathtemplate } = fieldstorage;
        const renderedpath = renderpath(pathtemplate, {
          TABLE: this.table_dummy,
          NEW: row,
          RECORD: row,
        });

        return this.storage.from(bucket).createSignedUrl(renderedpath, 60 * 60);
      }

      async createSignedUrls(
        row: Record<string, any>,
        fields: (XSupabaseStorageSchema & { id: string })[]
      ): Promise<Record<string, CreateSignedUrlsResult["data"]>> {
        // group fields by bucket
        const grouped_by_bucket = Map.groupBy(fields, (f) => f.bucket);

        const tasks_by_bucket: Promise<CreateSignedUrlsResult>[] = [];

        // bulk create signed urls by bucket
        Array.from(grouped_by_bucket.entries()).map(
          ([bucket, fields]: [string, XSupabaseStorageSchema[]]) => {
            const paths = fields.map((f) => {
              const renderedpath = renderpath(f.path, {
                TABLE: this.table_dummy,
                NEW: row,
                RECORD: row,
              });
              return renderedpath;
            });
            tasks_by_bucket.push(
              this.storage.from(bucket).createSignedUrls(paths, 60 * 60)
            );
          }
        );

        const resolved_by_bucket = await Promise.all(tasks_by_bucket);

        const result: Record<
          string,
          NonNullable<CreateSignedUrlsResult["data"]>
        > = {};

        resolved_by_bucket.forEach((curr, index) => {
          const bucket = Array.from(grouped_by_bucket.keys())[index];
          const fields = grouped_by_bucket.get(bucket)!;
          if (!curr.error) {
            curr.data.forEach((signedUrl, index) => {
              const field = fields[index];
              if (!result[field.id]) {
                result[field.id] = [];
              }

              result[field.id].push(signedUrl);
            });
          }
        });

        return result;
      }
    }

    export function renderpath<
      R extends Record<string, any> = Record<string, any>,
    >(
      pathtemplate: string,
      data:
        | TemplateVariables.XSupabase.PostgresQueryInsertSelectContext<R>
        | (TemplateVariables.XSupabase.PostgresQueryInsertSelectContext<R> &
            TemplateVariables.CurrentFileContext)
    ) {
      return render(pathtemplate, data, { strict: true });
    }
  }
}
