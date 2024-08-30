import type { FormInputType, GridaXSupabase } from "@/types";

export type GFSystemColumnTypes =
  | "__gf_display_id"
  | "__gf_created_at"
  | "__gf_customer_id";

export type GFSystemColumn = {
  key: GFSystemColumnTypes;
  name?: string;
};

export type GFColumn = {
  key: string;
  name: string;
  readonly: boolean;
  type?: FormInputType;
};

export type GFResponseFieldData = {
  type?: FormInputType;
  value: any;
  readonly?: boolean;
  multiple?: boolean;
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
  upsert?: string;
  name: string;
};

export type GFResponseRow = {
  __gf_id: string;
  __gf_display_id: string;
  __gf_created_at?: string;
  __gf_customer_id?: string | null;
  fields: Record<string, GFResponseFieldData>;
};

export type GRCustomerRow = {
  uid: string;
  email: string | null;
  // name: string;
  phone: string | null;
  // address: string;
  created_at: string;
  last_seen_at: string;
};

export type XSupabaseReferenceTableRow = GridaXSupabase.SupabaseUser | any;
