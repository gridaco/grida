import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  XPostgrestQuery,
  XSupabaseClientQueryBuilder,
} from "@/lib/supabase-postgrest/builder";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { get_grida_table_x_supabase_table_connector } from "@/services/x-supabase";
import { omit } from "@/utils/qs";

type Context = {
  params: {
    form_id: string;
    sb_table_id: string;
  };
};

export async function GET(req: NextRequest, context: Context) {
  const cookieStore = cookies();
  const grida_forms_client = createRouteHandlerClient(cookieStore);

  const { form_id, sb_table_id: _sb_table_id } = context.params;
  const sb_table_id = parseInt(_sb_table_id);

  const searchParams = omit(
    req.nextUrl.searchParams,
    // not used, only for swr key
    "r"
  );

  const { main_supabase_table, x_client } =
    await get_grida_table_x_supabase_table_connector({
      form_id,
      sb_table_id: sb_table_id,
      client: grida_forms_client,
    });

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

  return NextResponse.json({
    count,
    data,
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
