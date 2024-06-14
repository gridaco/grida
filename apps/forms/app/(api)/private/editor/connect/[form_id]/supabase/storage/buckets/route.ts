import { parseSupabaseSchema } from "@/lib/supabase-postgrest";
import {
  createRouteHandlerClient,
  grida_xsupabase_client,
} from "@/lib/supabase/server";
import { createXSupabaseClient } from "@/services/x-supabase";
import { GridaSupabase } from "@/types";
import { cookies } from "next/headers";
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
  const form_id = context.params.form_id;
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  const { data: conn } = await supabase
    .from("connection_supabase")
    .select(`*`)
    .eq("form_id", form_id)
    .single();

  if (!conn) {
    return notFound();
  }

  const { supabase_project_id } = conn;

  const { data: supabase_project } = await grida_xsupabase_client
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
