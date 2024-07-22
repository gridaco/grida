import { client } from "@/lib/supabase/server";
import { createXSupabaseClient } from "@/services/x-supabase";
import assert from "assert";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  context: {
    params: {
      form_id: string;
    };
  }
) {
  const { form_id } = context.params;

  const _q_page = req.nextUrl.searchParams.get("page");
  const page = _q_page ? parseInt(_q_page) : 1;
  const _q_per_page = req.nextUrl.searchParams.get("per_page");
  const per_page = _q_per_page ? parseInt(_q_per_page) : 50;

  // FIXME: Strict Authorization - this route accesses auth.users

  const { data: formref, error: formreferr } = await client
    .from("form")
    .select(`supabase_connection:connection_supabase(*)`)
    .eq("id", form_id)
    .single();

  if (formreferr) {
    console.error(formreferr);
    return NextResponse.error();
  }

  if (!formref) {
    return notFound();
  }

  const { supabase_connection } = formref!;

  assert(supabase_connection, "supabase_connection is required");

  const xclient = await createXSupabaseClient(
    supabase_connection.supabase_project_id,
    {
      service_role: true,
      db: {
        schema: "auth",
      },
    }
  );

  const res = await client.auth.admin.listUsers({
    page: page,
    perPage: per_page,
  });

  return NextResponse.json(res);
}
