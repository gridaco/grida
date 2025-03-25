// https://supabase.com/docs/reference/javascript/typescript-support#helper-types-for-tables-and-joins
import { MergeDeep } from "type-fest";
import { Database as DatabaseGenerated } from "./database-generated.types";
export { type Json } from "./database-generated.types";

// Override the type for a specific column in a view:
export type Database = MergeDeep<
  DatabaseGenerated,
  {
    public: {
      Views: {
        customer_with_tags: DatabaseGenerated["public"]["Tables"]["customer"] & {
          tags: string[] | null;
        };
      };
    };
  }
>;
