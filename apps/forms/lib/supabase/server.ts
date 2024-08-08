import type { Database } from "@/database.types";
import { createServerComponentClient as _createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { createRouteHandlerClient as _createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

export const workspaceclient = createClient<Database, "public">(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    db: {
      schema: "public",
    },
  }
);

export const grida_forms_client = createClient<Database, "grida_forms">(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    db: {
      schema: "grida_forms",
    },
  }
);

export const grida_sites_client = createClient<Database, "grida_sites">(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    db: {
      schema: "grida_sites",
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

export const grida_xsupabase_client = createClient<
  Database,
  "grida_x_supabase"
>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  db: {
    schema: "grida_x_supabase",
  },
});

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

export const createServerComponentWorkspaceClient = (
  cookieStore: ReadonlyRequestCookies
) =>
  _createServerComponentClient<Database, "public">(
    {
      cookies: () => cookieStore,
    },
    {
      options: {
        db: { schema: "public" },
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
