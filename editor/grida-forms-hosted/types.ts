import type { FormNotificationRespondentEmailConfig } from "@app/database";
import type {
  PlatformPoweredBy,
  SchemaMayVaryDocumentServerObject,
} from "@/types";
import type {
  FormResponseUnknownFieldHandlingStrategyType,
  FormBlock,
  FormPageBackgroundSchema,
  FormStyleSheetV1Schema,
  FormsPageLanguage,
  EndingPageI18nOverrides,
  FormMethod,
  FormInputType,
  Geo,
} from "@grida/forms";
export type {
  FormMethod,
  FormsPageLanguage,
  FormResponseUnknownFieldHandlingStrategyType,
  FormInputType,
  FormFieldAutocompleteType,
  FormFieldInit,
  IFormField,
  FormFieldDefinition,
  AttributeDefinition,
  IFormBlock,
  FormBlock,
  Option,
  Optgroup,
  FormBlockType,
  PhoneFieldData,
  FormFieldDataSchema,
  FormFieldStorageSchema,
  FormFieldReferenceSchema,
  PaymentsServiceProviders,
  PaymentFieldData,
  XS3StorageSchema,
  XSupabaseStorageSchema,
  XGridaStorageSchema,
  PageThemeEmbeddedBackgroundData,
  TemplatePageBackgroundSchema,
  FontFamily,
  Appearance,
  FormPageBackgroundSchema,
  FormStyleSheetV1Schema,
  EndingPageTemplateID,
  EndingPageI18nOverrides,
  CampaignMeta,
  Geo,
  FormPaletteName,
  JsonValue,
  JSONValue,
} from "@grida/forms";
export { isReferenceSchema } from "@grida/forms";

export interface Form {
  created_at: string;
  default_form_page_id: string | null;
  description: string | null;
  id: string;
  is_max_form_responses_by_customer_enabled: boolean;
  is_max_form_responses_in_total_enabled: boolean;
  max_form_responses_by_customer: number | null;
  max_form_responses_in_total: number | null;
  /**
   * Admin-configurable respondent email notification settings.
   *
   * Stored in DB as `jsonb`.
   */
  notification_respondent_email: FormNotificationRespondentEmailConfig;
  project_id: number;
  title: string;
  unknown_field_handling_strategy: FormResponseUnknownFieldHandlingStrategyType;
  updated_at: string;
  is_scheduling_enabled: boolean;
  is_force_closed: boolean;
  scheduling_close_at: string | null;
  scheduling_open_at: string | null;
  scheduling_tz: string | null;
}

export interface FormDocument {
  id: string;
  form_id: string;
  name: string;
  blocks: FormBlock[];
  background?: FormPageBackgroundSchema;
  stylesheet?: FormStyleSheetV1Schema;
  is_redirect_after_response_uri_enabled: boolean;
  redirect_after_response_uri: string | null;
  lang: FormsPageLanguage;
  is_powered_by_branding_enabled: boolean;
  is_ending_page_enabled: boolean;
  ending_page_template_id: string | null;
  ending_page_i18n_overrides: EndingPageI18nOverrides | null;
  method: FormMethod;
  start_page: FormStartPageSchema | null;
}

export interface FormResponseSession {
  id: string;
  created_at: string;
  customer_id: string | null;
  // oxlint-disable-next-line no-explicit-any -- DB JSON field; narrowing cascades across 50+ consumers
  raw: Record<string, any> | null;
}

export interface FormResponse {
  id: string;
  local_id: string | null;
  local_index: number;
  browser: string | null;
  created_at: string;
  customer_id: string | null;
  form_id: string;
  ip: string | null;
  platform_powered_by: PlatformPoweredBy | null;
  // oxlint-disable-next-line no-explicit-any -- DB JSON field; narrowing cascades across 50+ consumers
  raw: any;
  updated_at: string;
  x_referer: string | null;
  x_useragent: string | null;
  /** Historical IPinfo payloads remain readable; new responses use geo. */
  x_ipinfo: {
    ip: string;
    city?: string;
    region?: string;
    country?: string;
    loc?: string;
    org?: string;
    postal?: string;
    timezone?: string;
  } | null;
  geo: Geo | null;
}

export interface FormResponseWithFields extends FormResponse {
  fields: FormResponseField[];
}

export interface FormResponseField {
  id: string;
  created_at: string;
  form_field_id: string;
  response_id: string;
  type: FormInputType;
  updated_at: string;
  // oxlint-disable-next-line no-explicit-any -- DB JSON field; narrowing cascades across 50+ consumers
  value: any;
  form_field_option_id: string | null;
  storage_object_paths: string[] | null;
}

export type FormStartPageSchema = SchemaMayVaryDocumentServerObject & {
  template_id: string;
};
