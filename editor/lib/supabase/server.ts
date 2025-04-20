import type { Database } from "@/database.types";
import { createClient as _createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const __create_server_client = async <
  SchemaName extends string & keyof Database = "public" extends keyof Database
    ? "public"
    : string & keyof Database,
>(
  schema: SchemaName
) => {
  const cookieStore = await cookies();
  return createServerClient<Database, SchemaName>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: {
        schema: schema,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
};

export async function createClient() {
  return __create_server_client<"public">("public");
}

export async function createFormsClient() {
  return __create_server_client<"grida_forms">("grida_forms");
}

export async function createStorageClient() {
  return __create_server_client<"grida_storage">("grida_storage");
}

export async function createCanvasClient() {
  return __create_server_client<"grida_canvas">("grida_canvas");
}

export async function createWestReferralClient() {
  return __create_server_client<"grida_west_referral">("grida_west_referral");
}

export async function createWWWClient() {
  return __create_server_client<"grida_www">("grida_www");
}

export async function createXSBClient() {
  return __create_server_client<"grida_x_supabase">("grida_x_supabase");
}

const __create_service_role_client = <
  SchemaName extends string & keyof Database = "public" extends keyof Database
    ? "public"
    : string & keyof Database,
>(
  schema: SchemaName
) => {
  return _createClient<Database, SchemaName>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    {
      db: {
        schema: schema,
      },
    }
  );
};

/**
 * @deprecated - deprecation warning for extra security (not actually deprecated)
 */
export const _sr_workspaceclient =
  __create_service_role_client<"public">("public");

/**
 * @deprecated - deprecation warning for extra security (not actually deprecated)
 */
export const _sr_grida_forms_client =
  __create_service_role_client<"grida_forms">("grida_forms");

/**
 * @deprecated - deprecation warning for extra security (not actually deprecated)
 */
export const _sr_grida_storage_client =
  __create_service_role_client<"grida_storage">("grida_storage");

/**
 * @deprecated - deprecation warning for extra security (not actually deprecated)
 */
export const _sr_grida_canvas_client =
  __create_service_role_client<"grida_canvas">("grida_canvas");

/**
 * @deprecated - deprecation warning for extra security (not actually deprecated)
 */
export const _sr_grida_sites_client =
  __create_service_role_client<"grida_sites">("grida_sites");

/**
 * @deprecated - deprecation warning for extra security (not actually deprecated)
 */
export const _sr_grida_commerce_client =
  __create_service_role_client<"grida_commerce">("grida_commerce");

/**
 * @deprecated - deprecation warning for extra security (not actually deprecated)
 */
export const _sr_grida_west_referral_client =
  __create_service_role_client<"grida_west_referral">("grida_west_referral");

/**
 * @deprecated - deprecation warning for extra security (not actually deprecated)
 */
export const _sr_grida_xsupabase_client =
  __create_service_role_client<"grida_x_supabase">("grida_x_supabase");
