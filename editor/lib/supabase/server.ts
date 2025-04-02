import type { Database } from "@/database.types";
import { createServerComponentClient as _createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { createRouteHandlerClient as _createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

/**
 * @deprecated - deprecation warning for extra security (not actually deprecated)
 */
export const workspaceclient = createClient<Database, "public">(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    db: {
      schema: "public",
    },
  }
);

/**
 * @deprecated - deprecation warning for extra security (not actually deprecated)
 */
export const grida_forms_client = createClient<Database, "grida_forms">(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    db: {
      schema: "grida_forms",
    },
  }
);

/**
 * @deprecated - deprecation warning for extra security (not actually deprecated)
 */
export const grida_storage_client = createClient<Database, "grida_storage">(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    db: {
      schema: "grida_storage",
    },
  }
);

/**
 * @deprecated - deprecation warning for extra security (not actually deprecated)
 */
export const grida_canvas_client = createClient<Database, "grida_canvas">(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    db: {
      schema: "grida_canvas",
    },
  }
);

/**
 * @deprecated - deprecation warning for extra security (not actually deprecated)
 */
export const grida_sites_client = createClient<Database, "grida_sites">(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    db: {
      schema: "grida_sites",
    },
  }
);

/**
 * @deprecated - deprecation warning for extra security (not actually deprecated)
 */
export const grida_commerce_client = createClient<Database, "grida_commerce">(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    db: {
      schema: "grida_commerce",
    },
  }
);

/**
 * @deprecated - deprecation warning for extra security (not actually deprecated)
 */
export const grida_west_client = createClient<Database, "grida_west">(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    db: {
      schema: "grida_west",
    },
  }
);

/**
 * @deprecated - deprecation warning for extra security (not actually deprecated)
 */
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

export const createServerComponentStorageClient = (
  cookieStore: ReadonlyRequestCookies
) =>
  _createServerComponentClient<Database, "grida_storage">(
    {
      cookies: () => cookieStore,
    },
    {
      options: {
        db: { schema: "grida_storage" },
      },
    }
  );

export const createServerComponentCanvasClient = (
  cookieStore: ReadonlyRequestCookies
) =>
  _createServerComponentClient<Database, "grida_canvas">(
    {
      cookies: () => cookieStore,
    },
    {
      options: {
        db: { schema: "grida_canvas" },
      },
    }
  );

export const createServerComponentWestClient = (
  cookieStore: ReadonlyRequestCookies
) =>
  _createServerComponentClient<Database, "grida_west">(
    {
      cookies: () => cookieStore,
    },
    {
      options: {
        db: { schema: "grida_west" },
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

export const createRouteHandlerXSBClient = (
  cookieStore: ReadonlyRequestCookies
) =>
  _createRouteHandlerClient<Database, "grida_x_supabase">(
    {
      cookies: () => cookieStore,
    },
    {
      options: {
        db: { schema: "grida_x_supabase" },
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

export const createRouteHandlerWestClient = (
  cookieStore: ReadonlyRequestCookies
) =>
  _createRouteHandlerClient<Database, "grida_west">(
    {
      cookies: () => cookieStore,
    },
    {
      options: {
        db: { schema: "grida_west" },
      },
    }
  );
