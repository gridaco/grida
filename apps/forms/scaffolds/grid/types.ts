import type { FormInputType, GridaSupabase } from "@/types";

export type GFResponseRow = {
  __gf_id: string;
  __gf_display_id: string;
  __gf_created_at: string;
  __gf_customer_id: string | null;
  fields: Record<
    string,
    {
      type?: FormInputType;
      value: any;
      files?: {
        src: string;
        download: string;
        name: string;
      }[];
    }
  >;
};

export type ReferenceTableRow = GridaSupabase.SupabaseUser | any;
