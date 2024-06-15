import type { Database } from "@/database.types";
import { grida_xsupabase_client } from "@/lib/supabase/server";
import { secureformsclient } from "@/lib/supabase/vault";
import { ConnectionSupabaseJoint, GridaSupabase } from "@/types";
import { SupabaseClient, createClient } from "@supabase/supabase-js";
import assert from "assert";

export async function createXSupabaseClient(
  supabase_project_id: number,
  config?: { service_role?: boolean }
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

  let serviceRoleKey: string | null = null;
  if (config?.service_role) {
    const { data } = await secureFetchServiceKey(supabase_project.id);
    serviceRoleKey = data;
  }

  if (config?.service_role) {
    assert(serviceRoleKey, "serviceRoleKey is required");
  }

  const apiKey = serviceRoleKey || sb_anon_key;

  const sbclient = createClient(sb_project_url, apiKey);

  return sbclient;
}

export async function secureFetchServiceKey(supabase_project_id: number) {
  return secureformsclient.rpc(
    "reveal_secret_connection_supabase_service_key",
    {
      p_supabase_project_id: supabase_project_id,
    }
  );
}

export async function secureCreateServiceKey(
  supabase_project_id: number,
  service_key: string
) {
  return secureformsclient.rpc(
    "create_secret_connection_supabase_service_key",
    {
      p_supabase_project_id: supabase_project_id,
      p_secret: service_key,
    }
  );
}

export class GridaXSupabaseClient {
  constructor() {}

  async getConnection(
    conn: ConnectionSupabaseJoint
  ): Promise<GridaSupabase.SupabaseConnectionState | null> {
    const { supabase_project_id, main_supabase_table_id } = conn;

    const { data: supabase_project, error: supabase_project_err } =
      await grida_xsupabase_client
        .from("supabase_project")
        .select(`*, tables:supabase_table(*)`)
        .eq("id", supabase_project_id)
        .single();

    if (supabase_project_err) console.error(supabase_project_err);
    if (!supabase_project) {
      return null;
    }

    return {
      ...conn,
      supabase_project: supabase_project! as GridaSupabase.SupabaseProject,
      main_supabase_table_id,
      tables: supabase_project!.tables as GridaSupabase.SupabaseTable[],
      main_supabase_table:
        (supabase_project!.tables.find(
          (t) => t.id === main_supabase_table_id
        ) as GridaSupabase.SupabaseTable) || null,
    };
  }
}
