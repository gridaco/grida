import { Database } from "@/types/supabase";
import { createClient } from "@supabase/supabase-js";

export const secureformsclient = createClient<Database, "grida_forms_secure">(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_KEY as string,
  {
    db: {
      schema: "grida_forms_secure",
    },
  }
);
