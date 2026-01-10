import type { Database } from "@app/database";
import { createBrowserClient as _createBrowserClient } from "@supabase/ssr";

const __create_browser_client = <
  SchemaName extends string & keyof Database = "public" extends keyof Database
    ? "public"
    : string & keyof Database,
>(
  schema: SchemaName
) =>
  _createBrowserClient<Database, SchemaName>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      db: {
        schema: schema,
      },
      isSingleton: false,
    }
  );

export const createBrowserClient = () =>
  __create_browser_client<"public">("public");

export const createBrowserLibraryClient = () =>
  __create_browser_client<"grida_library">("grida_library");

export const createBrowserFormsClient = () =>
  __create_browser_client<"grida_forms">("grida_forms");

export const createBrowserCommerceClient = () =>
  __create_browser_client<"grida_commerce">("grida_commerce");

export const createBrowserCanvasClient = () =>
  __create_browser_client<"grida_canvas">("grida_canvas");

export const createBrowserWWWClient = () =>
  __create_browser_client<"grida_www">("grida_www");

export const createBrowserWestReferralClient = () =>
  __create_browser_client<"grida_west_referral">("grida_west_referral");
