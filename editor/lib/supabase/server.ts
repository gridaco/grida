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
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
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

/**
 * GRIDA-SEC-004 — Desktop agent sidecar trust boundary.
 *
 * Build a Supabase client that authenticates via an `Authorization: Bearer`
 * header instead of cookies. The token authenticates the **user**; the
 * publishable key authenticates the **app**.
 *
 * Use when a route receives a request from a non-browser client (e.g. the
 * Grida Desktop AgentSidecar) that holds an access token in `auth.json`
 * and cannot present cookies. The cookie path (`createClient()`) is
 * unchanged for browser callers.
 *
 * Route pattern:
 *   const auth = req.headers.get("authorization");
 *   const supabase = auth?.startsWith("Bearer ")
 *     ? createClientFromBearer(auth.slice(7))
 *     : await createClient();
 */
export function createClientFromBearer(token: string) {
  return _createClient<Database, "public">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );
}

export async function createCIAMClient() {
  return __create_server_client<"grida_ciam_public">("grida_ciam_public");
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
    process.env.SUPABASE_SECRET_KEY!,
    {
      db: {
        // oxlint-disable-next-line typescript-eslint/no-explicit-any -- Supabase SDK db.schema expects a looser type than our branded SchemaName
        schema: schema as any,
      },
    }
  );
};

/**
 * Service-role Supabase clients (RLS-bypassing). Per-schema namespace —
 * pick the one matching the table you're querying.
 *
 * Construction is **lazy and memoized per schema**: importing this module
 * is free (does not touch env), and each `service_role.<schema>` is built
 * on first access then cached. Eager top-level construction was a latent
 * landmine for any test or build phase that loads the module without
 * `SUPABASE_SECRET_KEY` set — the import itself would throw.
 *
 * Usage rule: **always reference `service_role.<schema>` inline at every
 * call site.** Do not alias it to a local variable (`const db = service_role.workspace`)
 * or re-export it. The point of the long, explicit name is that any reviewer
 * can grep `service_role` and find every privileged DB touch — aliasing
 * defeats that.
 *
 * @example
 *   await service_role.workspace.from("organization").select("id");   // ✅
 *   const db = service_role.workspace; await db.from(...);             // ❌ defeats grep
 *
 * @deprecated - deprecation warning for extra security (not actually deprecated)
 */
function memo<T>(factory: () => T): () => T {
  let value: T | undefined;
  let initialized = false;
  return () => {
    if (!initialized) {
      value = factory();
      initialized = true;
    }
    return value as T;
  };
}

const _workspace = memo(() => __create_service_role_client<"public">("public"));
const _ciam = memo(() =>
  __create_service_role_client<"grida_ciam_public">("grida_ciam_public")
);
const _library = memo(() =>
  __create_service_role_client<"grida_library">("grida_library")
);
const _forms = memo(() =>
  __create_service_role_client<"grida_forms">("grida_forms")
);
const _storage = memo(() =>
  __create_service_role_client<"grida_storage">("grida_storage")
);
const _canvas = memo(() =>
  __create_service_role_client<"grida_canvas">("grida_canvas")
);
const _sites = memo(() =>
  __create_service_role_client<"grida_sites">("grida_sites")
);
const _commerce = memo(() =>
  __create_service_role_client<"grida_commerce">("grida_commerce")
);
const _west_referral = memo(() =>
  __create_service_role_client<"grida_west_referral">("grida_west_referral")
);
const _xsb = memo(() =>
  __create_service_role_client<"grida_x_supabase">("grida_x_supabase")
);
const _www = memo(() => __create_service_role_client<"grida_www">("grida_www"));

export const service_role = {
  get workspace() {
    return _workspace();
  },
  get ciam() {
    return _ciam();
  },
  get library() {
    return _library();
  },
  get forms() {
    return _forms();
  },
  get storage() {
    return _storage();
  },
  get canvas() {
    return _canvas();
  },
  get sites() {
    return _sites();
  },
  get commerce() {
    return _commerce();
  },
  get west_referral() {
    return _west_referral();
  },
  get xsb() {
    return _xsb();
  },
  get www() {
    return _www();
  },
};
