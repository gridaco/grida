import type { IpInfo } from "@/clients/ipinfo";
import type palettes from "@/theme/palettes";
import type { tokens } from "@grida/tokens";
import type { FormNotificationRespondentEmailConfig } from "@app/database";
import type { CountryCode } from "libphonenumber-js/core";
import type {
  Appearance,
  FontFamily,
  PageThemeEmbeddedBackgroundData,
  PlatformPoweredBy,
  SchemaMayVaryDocumentServerObject,
  XS3StorageSchema,
  XGridaStorageSchema,
  XSupabaseStorageSchema,
} from "@/types";

type UUID = string;

export type FormMethod = "get" | "post" | "dialog";

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

/**
 * user facing page language
 */
export type FormsPageLanguage =
  | "en"
  | "es"
  | "de"
  | "ja"
  | "fr"
  | "pt"
  | "it"
  | "ko"
  | "ru"
  | "zh"
  | "ar"
  | "hi"
  | "nl";

export type FormResponseUnknownFieldHandlingStrategyType =
  | "accept"
  | "ignore"
  | "reject";

export type FormInputType =
  | "text"
  | "textarea"
  | "richtext"
  | "tel"
  | "url"
  | "checkbox"
  | "checkboxes"
  | "switch"
  | "toggle"
  | "toggle-group"
  | "radio"
  | "number"
  | "date"
  | "datetime-local"
  | "month"
  | "week"
  | "time"
  | "email"
  | "challenge_email"
  | "file"
  | "image"
  | "audio"
  | "video"
  | "select"
  | "latlng"
  | "password"
  | "color"
  | "country"
  | "payment"
  | "hidden"
  | "signature"
  | "range"
  | "search"
  | "json"
  | "canvas";

export type FormFieldAutocompleteType =
  | "off"
  | "on"
  | "name"
  | "honorific-prefix"
  | "given-name"
  | "additional-name"
  | "family-name"
  | "honorific-suffix"
  | "nickname"
  | "email"
  | "username"
  | "new-password"
  | "current-password"
  | "one-time-code"
  | "organization-title"
  | "organization"
  | "street-address"
  | "shipping"
  | "billing"
  | "address-line1"
  | "address-line2"
  | "address-line3"
  | "address-level4"
  | "address-level3"
  | "address-level2"
  | "address-level1"
  | "country"
  | "country-name"
  | "postal-code"
  | "cc-name"
  | "cc-given-name"
  | "cc-additional-name"
  | "cc-family-name"
  | "cc-number"
  | "cc-exp"
  | "cc-exp-month"
  | "cc-exp-year"
  | "cc-csc"
  | "cc-type"
  | "transaction-currency"
  | "transaction-amount"
  | "language"
  | "bday"
  | "bday-day"
  | "bday-month"
  | "bday-year"
  | "sex"
  | "tel"
  | "tel-country-code"
  | "tel-national"
  | "tel-area-code"
  | "tel-local"
  | "tel-extension"
  | "impp"
  | "url"
  | "photo"
  | "webauthn";

export type FormFieldInit = {
  id?: string;
  name: string;
  label: string;
  type: FormInputType;
  placeholder: string;
  required: boolean;
  readonly: boolean;
  help_text: string;
  pattern?: string;
  step?: number;
  min?: number;
  max?: number;
  options?: Option[];
  optgroups?: Optgroup[];
  autocomplete?: FormFieldAutocompleteType[] | null;
  data?: FormFieldDataSchema | null;
  accept?: string | null;
  multiple?: boolean;
  storage?: FormFieldStorageSchema | {} | null;
  reference?: FormFieldReferenceSchema | {} | null;
  v_value?: tokens.TValueExpression | {} | null;
  // options_inventory?: { [option_id: string]: MutableInventoryStock };
};

export interface IFormField {
  name: string;
  label?: string | null;
  type: FormInputType;
  is_array?: boolean;
  placeholder?: string | null;
  required: boolean;
  readonly: boolean;
  help_text?: string | null;
  pattern?: any | null;
  step?: number | null;
  min?: number | null;
  max?: number | null;
  options?: Option[];
  optgroups?: Optgroup[];
  autocomplete?: FormFieldAutocompleteType[] | null;
  data?: FormFieldDataSchema | null;
  accept?: string | null;
  multiple?: boolean | null;
  storage?: FormFieldStorageSchema | {} | null;
  reference?: FormFieldReferenceSchema | {} | null;
  v_value?: tokens.TValueExpression | {} | null;
}

export interface FormFieldDefinition extends IFormField {
  id: UUID;
  local_index: number;
}

export type AttributeDefinition = FormFieldDefinition;

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

export interface IFormBlock<T = FormBlockType> {
  form_field_id?: string | null;
  type: T;
  title_html?: string | null;
  description_html?: string | null;
  body_html?: string | null;
  src?: string | null;
  data: any;
  parent_id?: string | null;
  local_index: number;
  v_hidden?: tokens.BooleanValueExpression | null;
}

export interface FormBlock<T = FormBlockType> extends IFormBlock<T> {
  id: string;
  form_id: string;
  form_page_id: string | null;
  created_at: string;
}

export type Option = {
  id: string;
  label?: string;
  value: string;
  src?: string | null;
  disabled?: boolean | null;
  index?: number;
  optgroup_id?: string | null;
};

export type Optgroup = {
  id: string;
  label?: string;
  disabled?: boolean | null;
  index?: number;
};

export type FormBlockType =
  | "section"
  | "field"
  | "image"
  | "video"
  | "html"
  | "divider"
  | "header"
  | "pdf"
  // not supported yet
  | "group";

export interface FormResponseSession {
  id: string;
  created_at: string;
  customer_id: string | null;
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
  raw: any;
  updated_at: string;
  x_referer: string | null;
  x_useragent: string | null;
  x_ipinfo: IpInfo | null;
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
  value: any;
  form_field_option_id: string | null;
  storage_object_paths: string[] | null;
}

export interface PhoneFieldData {
  /**
   * Defaults the phone input's country selection (E.164 prefix).
   *
   * Stored in `grida_forms.attribute.data` with snake_case naming.
   */
  default_country?: CountryCode | (string & {});
}

export type FormFieldDataSchema = PaymentFieldData | PhoneFieldData | {};

export type FormFieldStorageSchema =
  | XGridaStorageSchema
  | XS3StorageSchema
  | XSupabaseStorageSchema;

export interface FormFieldReferenceSchema {
  type: "x-supabase";
  schema: string;
  table: string;
  column: string;
}

export function isReferenceSchema(ref: any): ref is FormFieldReferenceSchema {
  return (
    ref && "type" in ref && "schema" in ref && "table" in ref && "column" in ref
  );
}

export type PaymentsServiceProviders = "stripe" | "tosspayments";

export interface PaymentFieldData {
  type: "payment";
  service_provider: PaymentsServiceProviders;
}

export type TemplatePageBackgroundSchema = PageThemeEmbeddedBackgroundData;

export type FormPageBackgroundSchema = PageThemeEmbeddedBackgroundData;

export type FormStyleSheetV1Schema = {
  section?: string;
  "font-family"?: FontFamily;
  palette?: keyof typeof palettes;
  appearance?: Appearance;
  custom?: string;
};

export type FormStartPageSchema = SchemaMayVaryDocumentServerObject & {
  template_id: string;
};

export type EndingPageTemplateID = "default" | "receipt01";

export interface EndingPageI18nOverrides {
  $schema: "https://forms.grida.co/schemas/v1/endingpage.json";
  template_id: EndingPageTemplateID;
  overrides: Record<string, string>;
}

export interface CampaignMeta {
  max_form_responses_by_customer: number | null;
  is_max_form_responses_by_customer_enabled: boolean;
  max_form_responses_in_total: number | null;
  is_max_form_responses_in_total_enabled: boolean;
  is_force_closed: boolean;
  is_scheduling_enabled: boolean;
  scheduling_open_at: string | null;
  scheduling_close_at: string | null;
  scheduling_tz?: string;
}

export interface Geo {
  city?: string | undefined;
  country?: string | undefined;
  region?: string | undefined;
  latitude?: string | undefined;
  longitude?: string | undefined;
}
