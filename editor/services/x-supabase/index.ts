import { _sr_grida_xsupabase_client } from "@/lib/supabase/server";
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
import type { Database } from "@/database.types";
import "core-js/features/map/group-by";
import { unique } from "@/utils/unique";

/**
 * @deprecated - CAUTION: use within the secure context - marked for caution
 * @returns
 */
export async function createXSupabaseClient(
  supabase_project_id: number,
  config?: SupabaseClientOptions<any> & { service_role?: boolean }
): Promise<SupabaseClient<any, any>> {
  // fetch connection table
  const { data: supabase_project, error: supabase_project_err } =
    await _sr_grida_xsupabase_client
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

export async function get_grida_table_x_supabase_table_connector({
  form_id,
  sb_table_id,
  client,
}: {
  form_id: string;
  sb_table_id: number;
  client: SupabaseClient<Database, "grida_forms">;
}) {
  const { data: form, error } = await client
    .from("form")
    .select(
      `
        id,
        supabase_connection:connection_supabase(*),
        fields:attribute(*)
      `
    )
    .eq("id", form_id)
    .single();

  if (!form) {
    console.error("failed to fetch connection", error);
    throw error;
  }

  const { supabase_connection } = form;
  assert(supabase_connection, "supabase_connection is required");

  const x = new GridaXSupabaseService();
  const conn = await x.getXSBMainTableConnectionState(supabase_connection);
  assert(conn, "connection fetch failed");
  const { main_supabase_table } = conn;

  assert(
    main_supabase_table?.id === sb_table_id,
    "only supports main table atm"
  );

  const x_client = await createXSupabaseClient(
    supabase_connection.supabase_project_id,
    {
      db: {
        schema: main_supabase_table?.sb_schema_name,
      },
      service_role: true,
    }
  );

  const x_storage_client = new XSupabase.Storage.ConnectedClient(
    x_client.storage
  );

  return { grida_table: form, main_supabase_table, x_client, x_storage_client };
}

export class GridaXSupabaseService {
  constructor() {}

  async getXSBMainTableConnectionState(
    conn: SchemaTableConnectionXSupabaseMainTableJoint
  ): Promise<GridaXSupabase.XSupabaseMainTableConnectionState | null> {
    const { supabase_project_id, main_supabase_table_id } = conn;

    const { data: supabase_project, error: supabase_project_err } =
      await _sr_grida_xsupabase_client
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

    /**
     * A bucket info with bucket name required, but other data missing or unknwon
     *
     * This type is required because in Grida XSB Storage can be saved only with the name but without other metadata, e.g. `public`
     * This is because the configuration can change and lead to unidentifiable outcomes.
     *
     * Fetching the bucket info is relatively fast, when other properties are required, we may fetch based on this typings.
     *
     * @see https://supabase.com/docs/reference/javascript/storage-getbucket
     */
    type BucketWithUnknownProperties = {
      bucket: string;
      public: boolean | "unknown";
      file_size_limit?: number | "unknwon";
      allowed_mime_types?: string[] | "unknown";
    };

    type BucketObjectPath = {
      bucket: string;
      path: string;
    };

    type SignedBucketObjectPath = BucketObjectPath & {
      /**
       * the public url will be null if the bucket is not public
       */
      publicUrl: string | null;
      signedUrl: string;
      error: string | null;
    };

    /**
     * As supabase storage api works per bucket, this client is a wrapper around the supabase storage client, which seamlessly handles requests across multiple buckets.
     */
    export class MultiBucketClient {
      constructor(
        public readonly storage: SupabaseClient["storage"],
        public readonly buckets: BucketWithUnknownProperties[],
        readonly alwaysResolveBuckets = true
      ) {}

      async resolveBuckets() {
        const tasks = this.buckets.map((b) => {
          return this.storage.getBucket(b.bucket);
        });

        const resolved = await Promise.all(tasks);

        // once resolved, we can update the buckets with the resolved data
        resolved.forEach((res, index) => {
          if (res.data) {
            this.buckets[index] = {
              ...this.buckets[index],
              ...res.data,
            };
          }
        });
      }

      async createSignedUrls(
        objects: Array<BucketObjectPath>,
        expiresIn: number
      ): Promise<Array<SignedBucketObjectPath>> {
        if (this.alwaysResolveBuckets) {
          await this.resolveBuckets();
        }

        // remove duplicates by (bucket + path)
        objects = unique(objects, (o) => o.bucket + o.path);

        const objects_by_bucket = Map.groupBy(objects, (o) => o.bucket);
        const tasks_by_bucket: Promise<CreateSignedUrlsResult>[] = [];

        // bulk create signed urls by bucket
        for (const entry of Array.from(objects_by_bucket.entries())) {
          const [bucket, bucket_objects] = entry;
          const paths = bucket_objects.map((o) => o.path);
          tasks_by_bucket.push(
            this.storage.from(bucket).createSignedUrls(paths, expiresIn)
          );
        }
        //

        const resolved_by_bucket = await Promise.all(tasks_by_bucket);

        const result: SignedBucketObjectPath[] = [];

        resolved_by_bucket.forEach((curr, index) => {
          const bucket = Array.from(objects_by_bucket.keys())[index];
          const bucket_info = this.buckets.find((b) => b.bucket === bucket);
          assert(bucket_info, `bucket info not found for ${bucket}`);

          const bucket_objects = objects_by_bucket.get(bucket)!;
          if (!curr.error) {
            curr.data.forEach((data, index) => {
              const object = bucket_objects[index];
              result.push({
                bucket,
                path: object.path,
                signedUrl: data.signedUrl,
                error: data.error,
                publicUrl: bucket_info.public
                  ? this.storage.from(bucket).getPublicUrl(object.path).data
                      .publicUrl
                  : null,
              } satisfies SignedBucketObjectPath);
            });
          }
        });

        return result;
      }
      //
    }

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
        storage: XSupabaseStorageSchema
      ) {
        assert(storage.type === "x-supabase");
        const { bucket, path: pathtemplate } = storage;
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
      ): Promise<Record<string, SignedBucketObjectPath[]>> {
        const buckets: BucketWithUnknownProperties[] = Array.from(
          new Set(fields.map((f) => f.bucket))
        ).map((b) => {
          return {
            bucket: b,
            public: "unknown",
          } satisfies BucketWithUnknownProperties;
        });

        const objects: (BucketObjectPath & { field_id: string })[] = fields.map(
          (f) => {
            const renderedpath = renderpath(f.path, {
              TABLE: this.table_dummy,
              NEW: row,
              RECORD: row,
            });

            return {
              bucket: f.bucket,
              path: renderedpath,
              field_id: f.id,
            };
          }
        );

        const mbc = new MultiBucketClient(this.storage, buckets);
        const res = await mbc.createSignedUrls(objects, 60 * 60);

        const result: Record<
          string, // field id
          SignedBucketObjectPath[]
        > = {};

        // find from result and append by field_id
        for (const obj of objects) {
          const { field_id, path, bucket } = obj;
          const signed_objects = res.filter(
            (r) => r.bucket === bucket && r.path === path
          );

          // init
          if (!result[field_id]) {
            result[field_id] = [];
          }

          // append
          result[field_id].push(...signed_objects);
        }

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
