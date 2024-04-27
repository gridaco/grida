import { Database } from "@/types/supabase";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export const createClientFormsClient = () =>
  createClientComponentClient<Database, "grida_forms">({
    options: {
      db: {
        schema: "grida_forms",
      },
    },
  });

export const createClientCommerceClient = () =>
  createClientComponentClient<Database, "grida_commerce">({
    options: {
      db: {
        schema: "grida_commerce",
      },
    },
    isSingleton: false,
  });
