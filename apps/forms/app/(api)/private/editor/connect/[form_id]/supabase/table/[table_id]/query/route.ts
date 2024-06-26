import { FieldSupports } from "@/k/supported_field_types";
import {
  XSupabaseQuery,
  XSupabaseQueryBuilder,
} from "@/lib/supabase-postgrest/builder";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import {
  GridaXSupabaseService,
  createXSupabaseClient,
} from "@/services/x-supabase";
import { FormFieldStorageSchema } from "@/types";

import assert from "assert";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

type Context = {
  params: {
    form_id: string;
    table_id: string;
  };
};

export async function GET(req: NextRequest, context: Context) {
  const _q_limit = req.nextUrl.searchParams.get("limit");
  const limit = _q_limit ? parseInt(_q_limit) : undefined;
  const { form_id, table_id: _table_id } = context.params;
  const table_id = parseInt(_table_id);

  const { main_supabase_table, x_client } =
    await get_forms_x_supabase_table_connector({
      form_id,
      table_id,
    });

  const query = new XSupabaseQueryBuilder(x_client);

  const res = await query
    .from(main_supabase_table.sb_table_name)
    .select("*")
    .limit(limit)
    .done();

  return NextResponse.json(res);
}

export async function PATCH(req: NextRequest, context: Context) {
  const { form_id, table_id: _table_id } = context.params;
  const table_id = parseInt(_table_id);

  const { main_supabase_table, x_client } =
    await get_forms_x_supabase_table_connector({
      form_id,
      table_id,
    });

  const body: XSupabaseQuery.Body = await req.json();

  const query = new XSupabaseQueryBuilder(x_client);

  const res = await query
    .from(main_supabase_table.sb_table_name)
    .update(body.values)
    .fromFilters(body.filters)
    .done();

  return NextResponse.json(res);
}

export async function DELETE(req: NextRequest, context: Context) {
  const { form_id, table_id: _table_id } = context.params;
  const table_id = parseInt(_table_id);

  const { main_supabase_table, x_client } =
    await get_forms_x_supabase_table_connector({
      form_id,
      table_id,
    });

  const body: XSupabaseQuery.Body = await req.json();

  const query = new XSupabaseQueryBuilder(x_client);

  const res = await query
    .from(main_supabase_table.sb_table_name)
    .delete()
    .fromFilters(body.filters)
    .done();

  return NextResponse.json(res);
}

async function get_forms_x_supabase_table_connector({
  form_id,
  table_id,
}: {
  form_id: string;
  table_id: number;
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

  const { fields } = form;

  const file_fields = fields.filter((f) => FieldSupports.file_alias(f.type));

  // file_fields.map(f => (f.storage as {}  as  FormFieldStorageSchema).mode)

  const { supabase_connection } = form;
  assert(supabase_connection, "supabase_connection is required");

  const x = new GridaXSupabaseService();
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

  return { form, main_supabase_table, x_client };
}
