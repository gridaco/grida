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
        customer_with_tags: {
          Row: DatabaseGenerated["public"]["Tables"]["customer"]["Row"] & {
            tags: string[];
          };
        };
      };
    };
    grida_west_referral: {
      Views: {
        campaign_public: {
          Row: DatabaseGenerated["grida_west_referral"]["Views"]["campaign_public"]["Row"] & {
            id: string;
          };
        };
        invitation_public_secure: {
          Row: DatabaseGenerated["grida_west_referral"]["Views"]["invitation_public_secure"]["Row"] & {
            id: string;
            campaign_id: string;
            created_at: string;
            invitee_name: string | null;
            is_claimed: boolean;
            referrer_id: string;
          };
        };
        referrer_public_secure: {
          Row: DatabaseGenerated["grida_west_referral"]["Views"]["referrer_public_secure"]["Row"] & {
            id: string;
            campaign_id: string;
            code: string | null;
            created_at: string;
            referrer_name: string | null;
            invitation_count: number;
          };
        };
      };
    };
  }
>;
