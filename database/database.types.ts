/**
 * @fileoverview
 * Manual type overrides for the Supabase database schema.
 *
 * ## Role
 * Supabase CLI generates `database-generated.types.ts`, but those types are not always strong enough
 * or may not reflect application-level guarantees. Common cases:
 * - **Views**: view columns are often typed as optional/nullable too broadly by the generator.
 * - **`jsonb` with enforced schema**: when the DB enforces a JSON shape (via constraints/triggers),
 *   we may want a stronger, explicit TypeScript type.
 *
 * This file provides a **manually managed override layer** (via `MergeDeep`) to make development
 * safer and more ergonomic with trusted, strong types.
 *
 * ## Modification policy (important)
 * - **Prefer not to edit this file**. If the generated types are correct, keep them as-is.
 * - **Only add/adjust overrides when you are 100% certain** the runtime data matches the override.
 *   These overrides are **blindly trusted** by TypeScript and can hide real runtime/DB mismatches.
 * - **Best for known generator limitations** (especially **Views**) or well-defined, enforced JSON
 *   shapes. When possible, prefer improving the DB/schema and re-generating types instead.
 */
// https://supabase.com/docs/reference/javascript/typescript-support#helper-types-for-tables-and-joins
import { MergeDeep } from "type-fest";
import {
  Database as DatabaseGenerated,
  type Json,
} from "./database-generated.types";
export { type Json } from "./database-generated.types";

type SystemSchema_Favicon = {
  src: string;
  srcDark?: string | undefined;
};

type DBDocType = DatabaseGenerated["public"]["Enums"]["doctype"];

/**
 * `grida_forms.form.notification_respondent_email`
 *
 * DB-enforced JSON schema (see migration):
 * - optional keys only
 * - no additional properties
 */
export type FormNotificationRespondentEmailConfig = {
  enabled?: boolean;
  from_name?: string | null;
  subject_template?: string | null;
  body_html_template?: string | null;
  reply_to?: string | null;
};

/**
 * `grida_ciam.portal_preset.verification_email_template`
 *
 * DB-enforced JSON schema (same shape as FormNotificationRespondentEmailConfig).
 */
export type PortalPresetVerificationEmailTemplate = {
  enabled?: boolean;
  from_name?: string | null;
  subject_template?: string | null;
  body_html_template?: string | null;
  reply_to?: string | null;
};

/**
 * `grida_ciam.portal_preset.portal_login_page`
 *
 * DB-enforced JSON schema for login page text overrides.
 *
 * The required `template_id` discriminator allows future schema revisions:
 * introduce a new template_id value (e.g. "202607-v2") with its own shape,
 * add it to the union, and the old DB constraint will reject stale rows,
 * forcing an explicit data migration.
 */
export type PortalPresetLoginPage = PortalPresetLoginPage_202602Default;

export type PortalPresetLoginPage_202602Default = {
  template_id: "202602-default";
  email_step_title?: string | null;
  email_step_description?: string | null;
  email_step_button_label?: string | null;
  otp_step_title?: string | null;
  otp_step_description?: string | null;
};

// Override the type for a specific column in a view:
export type Database = MergeDeep<
  DatabaseGenerated,
  {
    public: {};
    // [private]
    grida_ciam: never;
    grida_ciam_public: {
      Views: {
        customer_auth_policy: {
          Row: DatabaseGenerated["grida_ciam"]["Tables"]["customer_auth_policy"]["Row"];
        };
        customer_with_tags: {
          // customer_with_tags + customer + tags (view makes field optional)
          Row: DatabaseGenerated["public"]["Tables"]["customer"]["Row"] & {
            tags: string[];
          };
          /**
           * `customer_with_tags` is a view with an INSTEAD OF INSERT trigger.
           * We model Insert so client code can insert without `any` casts.
           */
          Insert: DatabaseGenerated["public"]["Tables"]["customer"]["Insert"] & {
            tags?: string[] | null;
          };
        };
        portal_preset: {
          // View mirrors the table 1:1; reference the table type and only
          // narrow the two JSONB columns from Json to their enforced shapes.
          Row: Omit<DatabaseGenerated["grida_ciam"]["Tables"]["portal_preset"]["Row"], "verification_email_template" | "portal_login_page"> & {
            verification_email_template: PortalPresetVerificationEmailTemplate;
            portal_login_page: PortalPresetLoginPage;
          };
          Insert: Omit<DatabaseGenerated["grida_ciam"]["Tables"]["portal_preset"]["Insert"], "verification_email_template" | "portal_login_page"> & {
            verification_email_template?: PortalPresetVerificationEmailTemplate;
            portal_login_page?: PortalPresetLoginPage;
          };
          Update: Omit<DatabaseGenerated["grida_ciam"]["Tables"]["portal_preset"]["Update"], "verification_email_template" | "portal_login_page"> & {
            verification_email_template?: PortalPresetVerificationEmailTemplate;
            portal_login_page?: PortalPresetLoginPage;
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
            color: string | null;
            colors: string[];
            categories: string[];
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
    grida_forms: {
      Tables: {
        form: {
          Row: Omit<
            DatabaseGenerated["grida_forms"]["Tables"]["form"]["Row"],
            "notification_respondent_email"
          > & {
            notification_respondent_email: FormNotificationRespondentEmailConfig;
          };
          Insert: Omit<
            DatabaseGenerated["grida_forms"]["Tables"]["form"]["Insert"],
            "notification_respondent_email"
          > & {
            notification_respondent_email?: FormNotificationRespondentEmailConfig;
          };
          Update: Omit<
            DatabaseGenerated["grida_forms"]["Tables"]["form"]["Update"],
            "notification_respondent_email"
          > & {
            notification_respondent_email?: FormNotificationRespondentEmailConfig;
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
