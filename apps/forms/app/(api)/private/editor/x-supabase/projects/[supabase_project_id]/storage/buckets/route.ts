import { createRouteHandlerXSBClient } from "@/supabase/server";
import { createXSupabaseClient } from "@/services/x-supabase";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

interface Context {
  params: {
    supabase_project_id: number;
  };
}

export async function GET(req: NextRequest, context: Context) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerXSBClient(cookieStore);
  const { supabase_project_id } = context.params;

  // [REQUIRED] RLS gate
  const { data: supabase_project } = await supabase
    .from("supabase_project")
    .select(`*`)
    .eq("id", supabase_project_id)
    .single();

  if (!supabase_project) {
    return notFound();
  }

  const client = await createXSupabaseClient(supabase_project_id, {
    service_role: true,
  });

  return NextResponse.json(await client.storage.listBuckets());
}
