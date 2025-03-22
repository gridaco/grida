import type { Data } from "@/lib/data";
import type {
  FormFieldStorageSchema,
  FormInputType,
  GridaXSupabase,
} from "@/types";

export interface DataGridCellSelectionCursor {
  pk: string | -1;
  column: string;
  cursor_id: string;
  color: string;
}

export interface CellIdentifier {
  /**
   * the column key
   */
  attribute: string;
  /**
   * the primary key value (row id)
   */
  key: string;
}

export type StandaloneFileRefsResolverFn = () => Promise<DataGridFileRef[]>;
export type StandaloneFileRefsResolver = {
  type: "data-grid-file-storage-file-refs-resolver-fn";
  fn: StandaloneFileRefsResolverFn;
};

export type DataGridFileRefsResolverQueryTask = {
  type: "data-grid-file-storage-file-refs-query-task";
  identifier: CellIdentifier;
};

export type DataGridCellFileRefsResolver =
  | StandaloneFileRefsResolver
  | DataGridFileRefsResolverQueryTask
  | DataGridFileRef[]
  | null;

type FileUpsertionUrlResolver =
  // TODO:
  // | ((identifier: CellIdentifier) => Promise<string>)
  string | null;

export type DataGridFileRef = {
  src: string;
  srcset: {
    thumbnail: string;
    original: string;
  };
  download: string;
  upsert?: FileUpsertionUrlResolver;
  name: string;
};

export type DGSystemColumnKey =
  | "__gf_display_id"
  | "__gf_created_at"
  | "__gf_customer_id";

export type DGSystemColumn = {
  key: DGSystemColumnKey;
  name?: string;
};

export type DGColumn = {
  key: string;
  name: string;
  readonly: boolean;
  type?: FormInputType;
  pk: boolean;
  fk: Data.Relation.NonCompositeRelationship | "x-supabase.auth.users" | false;
  storage?: FormFieldStorageSchema | {} | null;
};

export type GFResponseFieldData = {
  type?: FormInputType;
  value: any;
  readonly: boolean;
  multiple: boolean;
  option_id?: string | null;
  options?: {
    [key: string]: { value: string; label?: string };
  };
  files?: DataGridCellFileRefsResolver;
};

export type DGResponseRow = {
  __gf_id: string;
  __gf_display_id: string;
  __gf_created_at?: string;
  __gf_customer_id?: string | null;
  fields: Record<string, GFResponseFieldData>;
  raw: Record<string, any> | null;
};

export type DGCustomerRow = {
  uid: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  // address: string;
  created_at: string;
  last_seen_at: string;
};

export type XSBUserRow = {
  id: string;
  email: string | undefined;
  phone: string | undefined;
  display_name: string | undefined;
  avatar_url: string | undefined;
  providers: GridaXSupabase.SupabaseAuthProvider[];
  created_at: string;
  last_sign_in_at: string | undefined;
};
