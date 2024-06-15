import type { FormInputType } from "@/types";

export type GFRow = {
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
        name: string;
      }[];
    }
  >;
};
