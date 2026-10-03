import type { Database } from "@app/database";
import { createClient } from "@supabase/supabase-js";
import { config, fetchWithDeadline } from "./config";

function client<S extends keyof Database>(schema: S) {
  return createClient<Database, S, S>(
    config.supabaseUrl(),
    config.required("SUPABASE_SECRET_KEY"),
    {
      db: { schema },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: fetchWithDeadline },
    }
  );
}
let workspace: ReturnType<typeof client<"public">> | undefined;
let forms: ReturnType<typeof client<"grida_forms">> | undefined;
let ciam: ReturnType<typeof client<"grida_ciam_public">> | undefined;
let www: ReturnType<typeof client<"grida_www">> | undefined;
let commerce: ReturnType<typeof client<"grida_commerce">> | undefined;
let xsb: ReturnType<typeof client<"grida_x_supabase">> | undefined;
let secure: ReturnType<typeof client<"grida_forms_secure">> | undefined;

export const service_role = {
  get workspace() {
    return (workspace ??= client("public"));
  },
  get forms() {
    return (forms ??= client("grida_forms"));
  },
  get ciam() {
    return (ciam ??= client("grida_ciam_public"));
  },
  get www() {
    return (www ??= client("grida_www"));
  },
  get commerce() {
    return (commerce ??= client("grida_commerce"));
  },
  get xsb() {
    return (xsb ??= client("grida_x_supabase"));
  },
};
export function secureFormsClient() {
  return (secure ??= client("grida_forms_secure"));
}
