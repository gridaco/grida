import { Database } from "@/types/supabase";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export const createClientClient = () =>
  createClientComponentClient<Database, "grida_forms">({
    options: {
      db: {
        schema: "grida_forms",
      },
    },
  });
