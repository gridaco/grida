import { createXSBClient } from "@/lib/supabase/server";
import { createXSupabaseClient } from "@/services/x-supabase";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { GridaXSupabase } from "@/types";

type Params = { supabase_project_id: number };

interface Context {
  params: Promise<Params>;
}

// [EXTRA SECURITY REQUIRED]
// Special route for fetching auth.users via proxy supabase client, for in-editor use.
// this route is protected via supabase_project access RLS.
export async function GET(req: NextRequest, context: Context) {
  const xsbClient = await createXSBClient();
  const { supabase_project_id } = await context.params;

  const _q_page = req.nextUrl.searchParams.get("page");
  const page = _q_page ? parseInt(_q_page) : undefined;

  const _q_perPage = req.nextUrl.searchParams.get("perPage");
  const perPage = _q_perPage ? parseInt(_q_perPage) : undefined;

  // [REQUIRED] RLS gate
  const { data: supabase_project } = await xsbClient
    .from("supabase_project")
    .select(`*`)
    .eq("id", supabase_project_id)
    .single();

  if (!supabase_project) {
    return notFound();
  }

  const xclient = await createXSupabaseClient(supabase_project_id, {
    service_role: true,
    db: {
      schema: "auth",
    },
  });

  const res = await xclient.auth.admin.listUsers({
    page: page,
    perPage: perPage,
  });

  return NextResponse.json(res satisfies GridaXSupabase.ListUsersResult);
}
