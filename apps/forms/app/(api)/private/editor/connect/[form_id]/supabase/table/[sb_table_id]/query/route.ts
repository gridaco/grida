import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
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
import type { GridaXSupabase } from "@/types";
import assert from "assert";
import { omit, qboolean } from "@/utils/qs";
import {
  GridaXSupabaseStorageTaskPooler,
  GridaXSupabaseStorageTaskPoolerResult,
} from "@/services/x-supabase/xsb-storage-pooler";

type Context = {
  params: {
    form_id: string;
    sb_table_id: string;
  };
};

const XSB_STORAGE_CONFIG_KEY = "__xsb_storage";

export async function GET(req: NextRequest, context: Context) {
  const __q__xsb_storage = req.nextUrl.searchParams.get(XSB_STORAGE_CONFIG_KEY);
  const __xsb_storage = qboolean(__q__xsb_storage);

  const searchParams = omit(
    req.nextUrl.searchParams,
    // not used, only for swr key
    "r",
    // storage config
    XSB_STORAGE_CONFIG_KEY
  );
  const { form_id, sb_table_id: _sb_table_id } = context.params;
  const sb_table_id = parseInt(_sb_table_id);

  const { form, main_supabase_table, x_client, x_storage_client } =
    await get_forms_x_supabase_table_connector({
      form_id,
      sb_table_id: sb_table_id,
    });

  const { fields } = form;

  const query = new XSupabaseClientQueryBuilder(x_client);

  query.from(main_supabase_table.sb_table_name);
  query.select("*", {
    // use estimated count for performance
    count: "estimated",
  });
  query.fromSearchParams(searchParams);

  const { data, count, error } = await query.done();

  if (error) {
    console.error("query ERR", error);
    console.error("likely due to malformed query params", {
      searchParams: searchParams.toString(),
    });
  }

  let __xsb_storage_files: GridaXSupabaseStorageTaskPoolerResult | null = null;
  if (__xsb_storage) {
    const pooler = new GridaXSupabaseStorageTaskPooler(x_storage_client);
    pooler.queue(fields, data);
    __xsb_storage_files = await pooler.resolve();
  }

  // console.log("files", files);

  const datawithstorage = data.map((row: Record<string, any>) => {
    // TODO: get pk based on table schema (read comment in GridaXSupabaseStorageTaskPooler class)
    const pk = row.id;
    return {
      ...row,
      __gf_storage_fields: __xsb_storage_files ? __xsb_storage_files[pk] : null,
    } satisfies GridaXSupabase.XDataRow;
  });

  return NextResponse.json({
    count,
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

/**
 *
 * [SECURE]
 *
 * RLS Protected
 *
 * @returns
 */
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
        fields:attribute(*)
      `
    )
    .eq("id", form_id)
    .single();

  if (!form) {
    console.error("failed to fetch connection", error);
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
