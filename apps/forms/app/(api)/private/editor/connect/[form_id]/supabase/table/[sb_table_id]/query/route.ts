import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import {
  XPostgrestQuery,
  XSupabaseClientQueryBuilder,
} from "@/lib/supabase-postgrest/builder";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { get_grida_table_x_supabase_table_connector } from "@/services/x-supabase";
import type { GridaXSupabase } from "@/types";
import { omit, qboolean } from "@/utils/qs";
import {
  XSupabaseStorageCrossBucketTaskPooler,
  XSupabaseStorageTaskPoolerResult,
} from "@/services/x-supabase/xsb-storage-pooler";

type Context = {
  params: {
    form_id: string;
    sb_table_id: string;
  };
};

const XSB_STORAGE_CONFIG_KEY = "__xsb_storage";

export async function GET(req: NextRequest, context: Context) {
  const cookieStore = cookies();
  const grida_forms_client = createRouteHandlerClient(cookieStore);

  const { form_id, sb_table_id: _sb_table_id } = context.params;
  const sb_table_id = parseInt(_sb_table_id);
  const __q__xsb_storage = req.nextUrl.searchParams.get(XSB_STORAGE_CONFIG_KEY);
  const __xsb_storage = qboolean(__q__xsb_storage);

  const searchParams = omit(
    req.nextUrl.searchParams,
    // not used, only for swr key
    "r",
    // storage config
    XSB_STORAGE_CONFIG_KEY
  );

  const { grida_table, main_supabase_table, x_client, x_storage_client } =
    await get_grida_table_x_supabase_table_connector({
      form_id,
      sb_table_id: sb_table_id,
      client: grida_forms_client,
    });

  const { fields } = grida_table;

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

  let __xsb_storage_files: XSupabaseStorageTaskPoolerResult | null = null;
  if (__xsb_storage) {
    const pooler = new XSupabaseStorageCrossBucketTaskPooler(x_storage_client);
    pooler.queue(
      fields,
      data,
      // FIXME: get pk based on table schema (alternatively, we can use index as well - doesnt have to be a data from a fetched row)
      "id"
    );
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
  const cookieStore = cookies();
  const grida_forms_client = createRouteHandlerClient(cookieStore);

  const { form_id, sb_table_id: _sb_table_id } = context.params;
  const sb_table_id = parseInt(_sb_table_id);

  const { main_supabase_table, x_client } =
    await get_grida_table_x_supabase_table_connector({
      form_id,
      sb_table_id: sb_table_id,
      client: grida_forms_client,
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
  const cookieStore = cookies();
  const grida_forms_client = createRouteHandlerClient(cookieStore);

  const { form_id, sb_table_id: _sb_table_id } = context.params;
  const sb_table_id = parseInt(_sb_table_id);

  const { main_supabase_table, x_client } =
    await get_grida_table_x_supabase_table_connector({
      form_id,
      sb_table_id: sb_table_id,
      client: grida_forms_client,
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
