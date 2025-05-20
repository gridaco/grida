import grida from "@grida/schema";

export type PlatformPricingTier =
  | "free"
  | "v0_pro"
  | "v0_team"
  | "v0_enterprise";

export type JSONValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JSONValue | undefined }
  | JSONValue[];

export type UserProfile = {
  uid: string;
  display_name: string;
  avatar_path: string | null;
};

export type PlatformPoweredBy =
  | "api"
  | "grida_forms"
  | "web_client"
  | "simulator";

/**
 * @deprecated not used
 */
export interface XS3StorageSchema {
  type: "x-s3";
  bucket: string;
  path: string;
  mode: "direct" | "staged";
}

export interface XSupabaseStorageSchema {
  type: "x-supabase";
  bucket: string;
  path: string;
  mode: "direct" | "staged";
}

export interface XGridaStorageSchema {
  type: "grida";
  bucket: string;
  path: string;
  mode: "direct" | "staged";
}

export interface PageThemeEmbeddedBackgroundData {
  type: "background";
  element: "iframe" | "img" | "div";
  /**
   * allowed for iframe, img
   */
  src?: string;
  /**
   * allowed for all
   */
  "scenes/change/background-color"?: string;
}

export type TemplatePageBackgroundSchema = PageThemeEmbeddedBackgroundData;

export type FontFamily = "inter" | "lora" | "inconsolata";

export type Appearance = "light" | "dark" | "system";

export type SchemaMayVaryDocumentServerObject =
  grida.program.document.Document & {
    /**
     * [STATIC] do not change the property name - used for versioning
     */
    __schema_version: typeof grida.program.document.SCHEMA_VERSION;
  };

export type CanvasDocumentSnapshotSchema = SchemaMayVaryDocumentServerObject;

export interface Geo {
  city?: string | undefined;
  country?: string | undefined;
  region?: string | undefined;
  latitude?: string | undefined;
  longitude?: string | undefined;
}

export interface SchemaTableConnectionXSupabaseMainTableJoint {
  created_at: string;
  form_id: string;
  id: number;
  main_supabase_table_id: number | null;
  supabase_project_id: number;
}

export interface Organization {
  avatar_path: string | null;
  created_at: string;
  email: string | null;
  blog: string | null;
  description: string | null;
  display_name: string;
  display_plan: PlatformPricingTier;
  id: number;
  name: string;
  owner_id: string;
}

export type OrganizationWithMembers = Organization & {
  members: OrganizationMember[];
};

export type OrganizationWithAvatar = Organization & {
  avatar_url: string | null;
};

export interface OrganizationMember {
  id: number;
  user_id: string;
  created_at: string;
  organization_id: number;
}

export interface Project {
  id: number;
  name: string;
  organization_id: number;
  created_at: string;
}

export type GDocumentType =
  | "v0_form"
  /**
   * @deprecated
   */
  | "v0_site"
  | "v0_schema"
  | "v0_bucket"
  | "v0_canvas"
  | "v0_campaign_referral";

export interface GDocument {
  id: string;
  created_at: string;
  updated_at: string;
  project_id: number;
  organization_id: number;
  doctype: GDocumentType;
  title: string;
  is_public: boolean;
  form_id: string | null;
  has_connection_supabase: boolean;
  responses: number | null;
  max_responses: number | null;
}
