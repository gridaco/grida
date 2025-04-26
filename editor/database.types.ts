// https://supabase.com/docs/reference/javascript/typescript-support#helper-types-for-tables-and-joins
import { MergeDeep } from "type-fest";
import { Database as DatabaseGenerated } from "./database-generated.types";
export { type Json } from "./database-generated.types";

type SystemSchema_Favicon = {
  src: string;
  srcDark?: string | undefined;
};

type DBDocType = DatabaseGenerated["public"]["Enums"]["doctype"];

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
    grida_library: {
      Tables: {
        object: {
          Row: Omit<
            DatabaseGenerated["grida_library"]["Tables"]["object"]["Row"],
            "colors"
          > & {
            color: string;
            colors: string[];
          };
        };
      };
    };
    grida_www: {
      Tables: {
        www: {
          Row: DatabaseGenerated["grida_www"]["Tables"]["www"]["Row"] & {
            favicon: SystemSchema_Favicon | null;
          };
          Insert: DatabaseGenerated["grida_www"]["Tables"]["www"]["Insert"] & {
            favicon?: SystemSchema_Favicon | null;
          };
          Update: DatabaseGenerated["grida_www"]["Tables"]["www"]["Update"] & {
            favicon?: SystemSchema_Favicon | null;
          };
        };
      };
      Views: {
        www_public: DatabaseGenerated["grida_www"]["Views"]["www_public"]["Row"] & {
          Row: {
            id: string;
            name: string;
            favicon: SystemSchema_Favicon | null;
          };
        };
        public_route: {
          Row: DatabaseGenerated["grida_www"]["Views"]["public_route"]["Row"] & {
            id: string;
            type: "page" | "layout";
            route_path: string;
            document_id: string;
            document_type: DBDocType;
          };
        };
      };
    };
    grida_west_referral: {
      Views: {
        campaign_public: {
          Row: DatabaseGenerated["grida_west_referral"]["Views"]["campaign_public"]["Row"] & {
            id: string;
            title: string;
            enabled: boolean;
            description: string | null;
            reward_currency: string;
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
