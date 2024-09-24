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

import assert from "assert";
import { omit } from "@/utils/qs";

type Context = {
  params: {
    form_id: string;
    supabase_table_name: string;
  };
};

export async function GET(req: NextRequest, context: Context) {
  const searchParams = omit(req.nextUrl.searchParams, "r"); // not used, only for swr key
  const supabase_schema_name = req.headers.get("Accept-Profile") || "public";
  const { form_id, supabase_table_name } = context.params;

  const cookieStore = cookies();
  const client = createRouteHandlerClient(cookieStore);

  // fetch connection
  const { data: connection_ref, error: connection_ref_err } = await client
    .from("connection_supabase")
    .select(
      `
        *
      `
    )
    .eq("form_id", form_id)
    .single();

  if (!connection_ref) {
    console.error("failed to fetch connection", connection_ref_err);
    return notFound();
  }
  //

  const x = new GridaXSupabaseService();
  const conn = await x.getXSBMainTableConnectionState(connection_ref);
  assert(conn, "connection fetch failed");

  const x_client = await createXSupabaseClient(
    connection_ref.supabase_project_id,
    {
      db: {
        schema: supabase_schema_name,
      },
      service_role: true,
    }
  );

  const query = new XSupabaseClientQueryBuilder(x_client);

  query.from(supabase_table_name);
  query.select("*", {
    // use estimated count for performance
    count: "estimated",
  });
  query.fromSearchParams(searchParams);

  const { data, count, error } = await query.done();

  return NextResponse.json({
    data,
    error,
    count,
  });
}
