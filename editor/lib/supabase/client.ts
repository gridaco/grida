import type { Database } from "@/database.types";
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

export const createClientCanvasClient = () =>
  createClientComponentClient<Database, "grida_canvas">({
    options: {
      db: {
        schema: "grida_canvas",
      },
    },
    isSingleton: false,
  });

export const createClientWorkspaceClient = () =>
  createClientComponentClient<Database, "public">({
    options: {
      db: {
        schema: "public",
      },
    },
    isSingleton: false,
  });

export const createClientTokensClient = () =>
  createClientComponentClient<Database, "grida_west">({
    options: {
      db: {
        schema: "grida_west",
      },
    },
    isSingleton: false,
  });
