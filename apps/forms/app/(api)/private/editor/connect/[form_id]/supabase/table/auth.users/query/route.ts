import { grida_forms_client } from "@/lib/supabase/server";
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

  const _q_limit = req.nextUrl.searchParams.get("limit");
  const limit = _q_limit ? parseInt(_q_limit) : undefined;

  // FIXME: Strict Authorization - this route accesses auth.users

  const { data: formref, error: formreferr } = await grida_forms_client
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

  const res = await xclient.auth.admin.listUsers({
    page: 1,
    perPage: limit,
  });

  return NextResponse.json(res);
}
