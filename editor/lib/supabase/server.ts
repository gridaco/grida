import type { Database } from "@/database.types";
import { Env } from "@/env";
import { createServerComponentClient as _createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { createRouteHandlerClient as _createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient as _createClient } from "@supabase/supabase-js";
import { geolocation } from "@vercel/functions";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

/**
 * @deprecated - deprecation warning for extra security (not actually deprecated)
 */
export const workspaceclient = _createClient<Database, "public">(
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
export const grida_forms_client = _createClient<Database, "grida_forms">(
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
export const grida_storage_client = _createClient<Database, "grida_storage">(
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
export const grida_canvas_client = _createClient<Database, "grida_canvas">(
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
export const grida_sites_client = _createClient<Database, "grida_sites">(
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
export const grida_commerce_client = _createClient<Database, "grida_commerce">(
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
export const grida_west_referral_client = _createClient<
  Database,
  "grida_west_referral"
>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  db: {
    schema: "grida_west_referral",
  },
});

/**
 * @deprecated - deprecation warning for extra security (not actually deprecated)
 */
export const grida_xsupabase_client = _createClient<
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

export const createServerComponentWestReferralClient = (
  cookieStore: ReadonlyRequestCookies
) =>
  _createServerComponentClient<Database, "grida_west_referral">(
    {
      cookies: () => cookieStore,
    },
    {
      options: {
        db: { schema: "grida_west_referral" },
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

export const createRouteHandlerWWWClient = (
  cookieStore: ReadonlyRequestCookies
) =>
  _createRouteHandlerClient<Database, "grida_www">(
    {
      cookies: () => cookieStore,
    },
    {
      options: {
        db: { schema: "grida_www" },
      },
    }
  );

/**
 * supabase read replica clients
 */
export namespace sb.rr {
  interface Request {
    headers: Headers;
    cookies: ReadonlyRequestCookies;
  }

  function supabaseUrl(request: { headers: Headers }) {
    const geo = geolocation(request);
    const region = Env.vercel.region(geo.region);
    const url = Env.supabase.rr(region);
    return url;
  }

  export namespace www {
    /**
     * @deprecated - deprecation warning for extra security (not actually deprecated)
     */
    export function createClient(request: Request) {
      return _createClient<Database, "grida_www">(
        supabaseUrl(request),
        process.env.SUPABASE_SERVICE_KEY!,
        {
          db: {
            schema: "grida_www",
          },
        }
      );
    }

    export function createRouteHandlerClient(request: Request) {
      return _createRouteHandlerClient<Database, "grida_www">(
        {
          cookies: () => request.cookies,
        },
        {
          supabaseUrl: supabaseUrl(request),
          options: {
            db: { schema: "grida_www" },
          },
        }
      );
    }
  }

  export namespace west_referral {
    /**
     * @deprecated - deprecation warning for extra security (not actually deprecated)
     */
    export function createClient(request: Request) {
      return _createClient<Database, "grida_west_referral">(
        supabaseUrl(request),
        process.env.SUPABASE_SERVICE_KEY!,
        {
          db: {
            schema: "grida_west_referral",
          },
        }
      );
    }

    export function createRouteHandlerClient(request: {
      headers: Headers;
      cookies: ReadonlyRequestCookies;
    }) {
      return _createRouteHandlerClient<Database, "grida_west_referral">(
        {
          cookies: () => request.cookies,
        },
        {
          supabaseUrl: supabaseUrl(request),
          options: {
            db: { schema: "grida_west_referral" },
          },
        }
      );
    }
  }
}

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

export const createRouteHandlerWestReferralClient = (
  cookieStore: ReadonlyRequestCookies
) =>
  _createRouteHandlerClient<Database, "grida_west_referral">(
    {
      cookies: () => cookieStore,
    },
    {
      options: {
        db: { schema: "grida_west_referral" },
      },
    }
  );
