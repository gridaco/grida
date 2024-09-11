import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { FieldSupports } from "@/k/supported_field_types";
import {
  XPostgrestQuery,
  XSupabaseClientQueryBuilder,
} from "@/lib/supabase-postgrest/builder";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import {
  GridaXSupabaseService,
  createXSupabaseClient,
} from "@/services/x-supabase";
import { XSupabase } from "@/services/x-supabase";
import type {
  FormFieldDefinition,
  GridaXSupabase,
  XSupabaseStorageSchema,
} from "@/types";
import assert from "assert";

type Context = {
  params: {
    form_id: string;
    sb_table_id: string;
  };
};

export async function GET(req: NextRequest, context: Context) {
  const searchParams = req.nextUrl.searchParams;
  const { form_id, sb_table_id: _sb_table_id } = context.params;
  const sb_table_id = parseInt(_sb_table_id);

  const { form, main_supabase_table, x_client, x_storage_client } =
    await get_forms_x_supabase_table_connector({
      form_id,
      sb_table_id: sb_table_id,
    });

  const { fields } = form;

  // get and clear route specific query params
  const __refreshkey = searchParams.get("r"); // not used, only for swr key
  searchParams.delete("r");
  //

  const query = new XSupabaseClientQueryBuilder(x_client);

  query.from(main_supabase_table.sb_table_name);
  query.select("*");
  query.fromSearchParams(searchParams);

  const { data, error } = await query.done();

  if (error) {
    console.error("query ERR", error);
    console.error("likely due to malformed query params", {
      searchParams: searchParams.toString(),
    });
  }

  const pooler = new GridaXSupabaseStorageTaskPooler(x_storage_client);
  pooler.queue(data, fields);
  const files = await pooler.resolve();

  // console.log("files", files);

  const datawithstorage = data.map((row: Record<string, any>) => {
    // TODO: get pk based on table schema (read comment in GridaXSupabaseStorageTaskPooler class)
    const pk = row.id;
    return {
      ...row,
      __gf_storage_fields: (files as any)[pk],
    } satisfies GridaXSupabase.XDataRow;
  });

  return NextResponse.json({
    data: datawithstorage,
    error,
  });
}

export async function PATCH(req: NextRequest, context: Context) {
  const { form_id, sb_table_id: _sb_table_id } = context.params;
  const sb_table_id = parseInt(_sb_table_id);

  const { main_supabase_table, x_client } =
    await get_forms_x_supabase_table_connector({
      form_id,
      sb_table_id: sb_table_id,
    });

  const body: XPostgrestQuery.Body = await req.json();

  const query = new XSupabaseClientQueryBuilder(x_client);

  // console.log("PATCH", body.values, body.filters);
  // return NextResponse.json({ ok: true });

  const res = await query
    .from(main_supabase_table.sb_table_name)
    .update(body.values)
    .fromFilters(body.filters)
    .done();

  return NextResponse.json(res);
}

export async function DELETE(req: NextRequest, context: Context) {
  const { form_id, sb_table_id: _sb_table_id } = context.params;
  const sb_table_id = parseInt(_sb_table_id);

  const { main_supabase_table, x_client } =
    await get_forms_x_supabase_table_connector({
      form_id,
      sb_table_id: sb_table_id,
    });

  const body: XPostgrestQuery.Body = await req.json();

  const query = new XSupabaseClientQueryBuilder(x_client);

  const res = await query
    .from(main_supabase_table.sb_table_name)
    .delete({ count: "exact" })
    .fromFilters(body.filters)
    .done();

  return NextResponse.json(res);
}

async function get_forms_x_supabase_table_connector({
  form_id,
  sb_table_id,
}: {
  form_id: string;
  sb_table_id: number;
}) {
  const cookieStore = cookies();
  const grida_forms_client = createRouteHandlerClient(cookieStore);

  const { data: form, error } = await grida_forms_client
    .from("form")
    .select(
      `
        id,
        supabase_connection:connection_supabase(*),
        fields:form_field(*)
      `
    )
    .eq("id", form_id)
    .single();

  if (!form) {
    return notFound();
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

  return { form, main_supabase_table, x_client, x_storage_client };
}

class GridaXSupabaseStorageTaskPooler {
  private tasks: Record<
    string,
    Promise<Record<string, XSupabase.Storage.CreateSignedUrlsResult["data"]>>
  > = {};

  constructor(private readonly storage: XSupabase.Storage.ConnectedClient) {}

  queue(
    rows: ReadonlyArray<Record<string, any>>,
    fields: Pick<FormFieldDefinition, "id" | "storage" | "type">[]
  ) {
    const x_supabase_storage_file_fields = fields.filter(
      (f) =>
        FieldSupports.file_alias(f.type) &&
        (f.storage as XSupabaseStorageSchema)?.type === "x-supabase"
    );

    for (const row of rows) {
      // FIXME: get pk based on table schema (alternatively, we can use index as well - doesnt have to be a data from a fetched row)
      const pk = row.id;
      const task = this.storage.createSignedUrls(
        row,
        x_supabase_storage_file_fields.map((ff) => ({
          ...(ff.storage as XSupabaseStorageSchema),
          id: ff.id,
        }))
      );

      this.tasks[pk] = task;
    }

    return this.tasks;
  }

  async resolve(): Promise<
    Record<
      string,
      Record<
        string,
        | {
            signedUrl: string;
            path: string;
          }[]
        | null
      >
    >
  > {
    const resolvedEntries = await Promise.all(
      Object.entries(this.tasks).map(async ([rowId, task]) => {
        const result = await task;

        const success = Object.entries(result).reduce((acc, [fieldId, r]) => {
          if (r) {
            return {
              ...acc,
              [fieldId]: r.filter((r) => r.signedUrl),
            };
          }

          return acc;
        }, {});

        return [rowId, success];
      })
    );

    return Object.fromEntries(resolvedEntries);
  }
}
