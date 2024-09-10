import type { Database } from "@/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TGridaCommerceSupabaseClient = SupabaseClient<
  Database,
  "grida_commerce"
>;

export type TGridaG11nSupabaseClient = SupabaseClient<Database, "grida_g11n">;

export type TGridaFormsSupabaseClient = SupabaseClient<Database, "grida_forms">;

export type TGridaWorkspaceSupabaseClient = SupabaseClient<Database, "public">;

export type TGridaXSupabaseSupabaseClient = SupabaseClient<
  Database,
  "grida_x_supabase"
>;
