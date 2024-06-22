import type { FormInputType, GridaSupabase } from "@/types";

export type GFResponseFieldData = {
  type?: FormInputType;
  value: any;
  option_id?: string | null;
  options?: {
    [key: string]: { value: string; label?: string };
  };
  files?: GFFile[];
};

export type GFFile = {
  src: string;
  srcset: {
    thumbnail: string;
    original: string;
  };
  download: string;
  name: string;
};

export type GFResponseRow = {
  __gf_id: string;
  __gf_display_id: string;
  __gf_created_at: string;
  __gf_customer_id: string | null;
  fields: Record<string, GFResponseFieldData>;
};

export type CFCustomerRow = {
  uid: string;
  email: string | null;
  // name: string;
  phone: string | null;
  // address: string;
  created_at: string;
  last_seen_at: string;
};

export type XSupabaseReferenceTableRow = GridaSupabase.SupabaseUser | any;
