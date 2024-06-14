import { grida_xsupabase_client } from "@/lib/supabase/server";
import { secureformsclient } from "@/lib/supabase/vault";
import { SupabaseClient, createClient } from "@supabase/supabase-js";

export async function createXSupabaseClient(
  supabase_project_id: number
): Promise<SupabaseClient<any, any>> {
  // fetch connection table
  const { data: supabase_project, error: supabase_project_err } =
    await grida_xsupabase_client
      .from("supabase_project")
      .select("*, tables:supabase_table(*)")
      .eq("id", supabase_project_id)
      .single();

  if (supabase_project_err || !supabase_project) {
    throw new Error("supabase_project not found");
  }
  const { sb_project_url, sb_anon_key } = supabase_project;

  // TODO: use service key only if configured to do so
  const apiKey =
    (await secureFetchServiceKey(supabase_project.id)) || sb_anon_key;

  const sbclient = createClient(sb_project_url, apiKey);

  return sbclient;
}

async function secureFetchServiceKey(supabase_project_id: number) {
  const { data } = await secureformsclient.rpc(
    "reveal_secret_connection_supabase_service_key",
    {
      p_supabase_project_id: supabase_project_id,
    }
  );

  return data;
}
