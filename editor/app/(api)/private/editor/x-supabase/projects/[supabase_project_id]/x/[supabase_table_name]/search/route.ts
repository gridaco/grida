import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { XSupabaseClientQueryBuilder } from "@/lib/supabase-postgrest/builder";
import { createRouteHandlerXSBClient } from "@/lib/supabase/server";
import { createXSupabaseClient } from "@/services/x-supabase";
import { omit } from "@/utils/qs";
import type { GridaXSupabase } from "@/types";
import type { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";

type Params = {
  supabase_project_id: number;
  supabase_table_name: string;
};

type Context = {
  params: Promise<Params>;
};

export async function GET(req: NextRequest, context: Context) {
  const searchParams = omit(req.nextUrl.searchParams, "r"); // not used, only for swr key
  const supabase_schema_name = req.headers.get("Accept-Profile") || "public";
  const { supabase_project_id, supabase_table_name } = await context.params;

  const cookieStore = await cookies();
  const client = createRouteHandlerXSBClient(cookieStore);

  // fetch connection
  const { data: connection_ref, error: connection_ref_err } = await client
    .from("supabase_project")
    .select("id, sb_schema_definitions")
    .eq("id", supabase_project_id)
    .single();

  if (!connection_ref) {
    console.error("failed to fetch connection", connection_ref_err);
    return notFound();
  }
  //

  const x_client = await createXSupabaseClient(connection_ref.id, {
    db: {
      schema: supabase_schema_name,
    },
    service_role: true,
  });

  const query = new XSupabaseClientQueryBuilder(x_client);

  query.from(supabase_table_name);
  query.select("*", {
    // use estimated count for performance
    count: "estimated",
  });
  query.fromSearchParams(searchParams);

  const res = await query.done();

  if (res.error) {
    console.error("failed to fetch data", res.error);
  }

  return NextResponse.json({
    ...res,
    meta: {
      schema_name: supabase_schema_name,
      table_name: supabase_table_name,
      table_schema:
        (
          connection_ref.sb_schema_definitions as Record<
            string,
            SupabasePostgRESTOpenApi.SupabaseOpenAPIDefinitionJSONSchema
          >
        )?.[supabase_schema_name]?.[supabase_table_name] || null,
    },
  } satisfies GridaXSupabase.XSBSearchResult);
}
