import type { Database } from "@/database.types";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export const createClientComponentFormsClient = () =>
  createClientComponentClient<Database, "grida_forms">({
    options: {
      db: {
        schema: "grida_forms",
      },
    },
  });

export const createClientComponentCommerceClient = () =>
  createClientComponentClient<Database, "grida_commerce">({
    options: {
      db: {
        schema: "grida_commerce",
      },
    },
    isSingleton: false,
  });

export const createClientComponentG11nClient = () =>
  createClientComponentClient<Database, "grida_g11n">({
    options: {
      db: {
        schema: "grida_g11n",
      },
    },
  });

export const createClientComponentWorkspaceClient = () =>
  createClientComponentClient<Database, "public">({
    options: {
      db: {
        schema: "public",
      },
    },
    isSingleton: false,
  });
