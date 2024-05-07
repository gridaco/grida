import { Database } from "@/types/supabase";
import { createServerComponentClient as _createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { createRouteHandlerClient as _createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

export const client = createClient<Database, "grida_forms">(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    db: {
      schema: "grida_forms",
    },
  }
);

export const workspaceclient = createClient<Database, "public">(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    db: {
      schema: "public",
    },
  }
);

export const grida_commerce_client = createClient<Database, "grida_commerce">(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    db: {
      schema: "grida_commerce",
    },
  }
);

export const createServerComponentClient = (
  cookieStore: ReadonlyRequestCookies
) =>
  _createServerComponentClient<Database, "grida_forms">(
    {
      cookies: () => cookieStore,
    },
    {
      options: {
        db: { schema: "grida_forms" },
      },
    }
  );

export const createRouteHandlerClient = (cookieStore: ReadonlyRequestCookies) =>
  _createRouteHandlerClient<Database, "grida_forms">(
    {
      cookies: () => cookieStore,
    },
    {
      options: {
        db: { schema: "grida_forms" },
      },
    }
  );

export const createRouteHandlerWorkspaceClient = (
  cookieStore: ReadonlyRequestCookies
) =>
  _createRouteHandlerClient<Database, "public">(
    {
      cookies: () => cookieStore,
    },
    {
      options: {
        db: { schema: "public" },
      },
    }
  );
