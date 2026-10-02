import { fetchWithDeadline } from "../../config";
import { service_role } from "../../db";
import { secureFormsClient } from "../../db";
import {
  SchemaTableConnectionXSupabaseMainTableJoint,
  GridaXSupabase,
} from "../../types";
import {
  SupabaseClient,
  SupabaseClientOptions,
  createClient,
} from "@supabase/supabase-js";
import { render } from "@grida/forms/templating";
import type { TemplateVariables } from "@grida/forms/templating";
import assert from "assert";

/**
 * @deprecated - CAUTION: use within the secure context - marked for caution
 * @returns
 */
export async function createXSupabaseClient(
  supabase_project_id: number,
  // oxlint-disable-next-line typescript-eslint/no-explicit-any -- Supabase SDK generic param
  config?: SupabaseClientOptions<any> & { service_role?: boolean }
  // oxlint-disable-next-line typescript-eslint/no-explicit-any -- Supabase SDK generic params
): Promise<SupabaseClient<any, any>> {
  // fetch connection table
  const { data: supabase_project, error: supabase_project_err } =
    await service_role.xsb
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
    const { data } = await __dangerously_fetch_secure_service_role_key(
      supabase_project.id
    );
    serviceRoleKey = data;
    assert(serviceRoleKey, "serviceRoleKey is required");
  }

  const apiKey = serviceRoleKey || sb_anon_key;

  const sbclient = createClient(sb_project_url, apiKey, {
    db: config?.db,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: fetchWithDeadline },
  });

  return sbclient;
}

/**
 * This may only be used in a secure context.
 *
 * @deprecated drop this, add a new rpc with rls enabled.
 * FIXME: this is a potential security risk.
 */
export async function __dangerously_fetch_secure_service_role_key(
  supabase_project_id: number
) {
  return secureFormsClient().rpc(
    "reveal_secret_connection_supabase_service_key",
    {
      p_supabase_project_id: supabase_project_id,
    }
  );
}

export class GridaXSupabaseService {
  constructor() {}

  async getXSBMainTableConnectionState(
    conn: SchemaTableConnectionXSupabaseMainTableJoint
  ): Promise<GridaXSupabase.XSupabaseMainTableConnectionState | null> {
    const { supabase_project_id, main_supabase_table_id } = conn;

    const { data: supabase_project, error: supabase_project_err } =
      await service_role.xsb
        .from("supabase_project")
        .select(`*, tables:supabase_table(*)`)
        .eq("id", supabase_project_id)
        .single();

    if (supabase_project_err || !supabase_project) {
      return null;
    }

    return {
      ...conn,
      supabase_project:
        supabase_project! as {} as GridaXSupabase.SupabaseProject,
      main_supabase_table_id,
      // oxlint-disable-next-line typescript-eslint/no-explicit-any -- Supabase query result type mismatch with domain type
      tables: supabase_project!.tables as any as GridaXSupabase.SupabaseTable[],
      main_supabase_table:
        (supabase_project!.tables.find(
          (t) => t.id === main_supabase_table_id
          // oxlint-disable-next-line typescript-eslint/no-explicit-any -- Supabase query result type mismatch with domain type
        ) as any as GridaXSupabase.SupabaseTable) || null,
    };
  }
}

export namespace XSupabase {
  //
  //
  // oxlint-disable-next-line typescript-eslint/no-explicit-any -- Supabase SDK generic params for dynamic client
  export type Client = SupabaseClient<any, any>;

  export namespace Storage {
    export function renderpath<
      // oxlint-disable-next-line typescript-eslint/no-explicit-any -- TemplateVariables.XSupabase generic constraint uses Record<string, any>
      R extends Record<string, any> = Record<string, any>,
    >(
      pathtemplate: string,
      data:
        | TemplateVariables.XSupabase.PostgresQueryInsertSelectContext<R>
        | (TemplateVariables.XSupabase.PostgresQueryInsertSelectContext<R> &
            TemplateVariables.CurrentFileContext)
    ) {
      return render(pathtemplate, data, { strict: true });
    }
  }
}
