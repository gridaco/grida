import type { Database } from "@app/database";
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

export async function createLibraryClient() {
  return __create_server_client<"grida_library">("grida_library");
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
export namespace service_role {
  export const workspace = __create_service_role_client<"public">("public");
  export const library =
    __create_service_role_client<"grida_library">("grida_library");
  export const forms =
    __create_service_role_client<"grida_forms">("grida_forms");
  export const storage =
    __create_service_role_client<"grida_storage">("grida_storage");
  export const canvas =
    __create_service_role_client<"grida_canvas">("grida_canvas");
  export const sites =
    __create_service_role_client<"grida_sites">("grida_sites");
  export const commerce =
    __create_service_role_client<"grida_commerce">("grida_commerce");
  export const west_referral =
    __create_service_role_client<"grida_west_referral">("grida_west_referral");
  export const xsb =
    __create_service_role_client<"grida_x_supabase">("grida_x_supabase");
  export const www = __create_service_role_client<"grida_www">("grida_www");
}
