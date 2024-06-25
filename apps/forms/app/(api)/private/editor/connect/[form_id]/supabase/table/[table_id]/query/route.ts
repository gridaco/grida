import { XSupabaseQueryBuilder } from "@/lib/supabase-postgrest/builder";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import {
  GridaXSupabaseClient,
  createXSupabaseClient,
} from "@/services/x-supabase";

import assert from "assert";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  context: {
    params: {
      form_id: string;
      table_id: string;
    };
  }
) {
  const { form_id, table_id: _table_id } = context.params;
  const table_id = parseInt(_table_id);
  const cookieStore = cookies();
  const grida_forms_client = createRouteHandlerClient(cookieStore);

  const _q_limit = req.nextUrl.searchParams.get("limit");
  const limit = _q_limit ? parseInt(_q_limit) : undefined;

  const { data, error } = await grida_forms_client
    .from("form")
    .select(`id, supabase_connection:connection_supabase(*)`)
    .eq("id", form_id)
    .single();

  if (!data) {
    return notFound();
  }

  const { supabase_connection } = data;
  assert(supabase_connection, "supabase_connection is required");

  const x = new GridaXSupabaseClient();
  const conn = await x.getConnection(supabase_connection);
  assert(conn, "connection fetch failed");
  const { main_supabase_table } = conn;

  assert(main_supabase_table?.id === table_id, "only supports main table atm");

  const x_client = await createXSupabaseClient(
    supabase_connection.supabase_project_id,
    {
      service_role: true,
    }
  );

  const query = new XSupabaseQueryBuilder(x_client);

  const res = await query
    .from(main_supabase_table.sb_table_name)
    .select("*")
    .limit(limit)
    .done();

  return NextResponse.json(res);
}
