import { IpInfo } from "@/clients/ipinfo";
import type { AST } from "@/types/ast";
import palettes from "@/theme/palettes";

type UUID = string;

export type FormMethod = "get" | "post" | "dialog";

export interface Form {
  created_at: string;
  custom_preview_url_path: string | null;
  custom_publish_url_path: string | null;
  default_form_page_id: string | null;
  default_form_page_language: FormsPageLanguage;
  description: string | null;
  id: string;
  is_edit_after_submission_allowed: boolean;
  is_max_form_responses_by_customer_enabled: boolean;
  is_max_form_responses_in_total_enabled: boolean;
  is_multiple_response_allowed: boolean;
  is_powered_by_branding_enabled: boolean;
  is_redirect_after_response_uri_enabled: boolean;
  max_form_responses_by_customer: number | null;
  max_form_responses_in_total: number | null;
  project_id: number;
  redirect_after_response_uri: string | null;
  title: string;
  unknown_field_handling_strategy: FormResponseUnknownFieldHandlingStrategyType;
  updated_at: string;
  method: FormMethod;
}

export interface Customer {
  uid: string;
  created_at: string;
  last_seen_at: string;
  email: string | null;
  email_provisional: string[];
  phone: string | null;
  phone_provisional: string[];
  uuid: string | null;
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
  | "search";

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

export type PlatformPoweredBy =
  | "api"
  | "grida_forms"
  | "web_client"
  | "simulator";

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
  autocomplete?: FormFieldAutocompleteType[] | null;
  data?: FormFieldDataSchema | null;
  accept?: string | null;
  multiple?: boolean;
  storage?: FormFieldStorageSchema | {} | null;
  reference?: FormFieldReferenceSchema | {} | null;
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
  autocomplete?: FormFieldAutocompleteType[] | null;
  data?: FormFieldDataSchema | null;
  accept?: string | null;
  multiple?: boolean | null;
  storage?: FormFieldStorageSchema | {} | null;
  reference?: FormFieldReferenceSchema | {} | null;
}

export interface FormFieldDefinition extends IFormField {
  id: UUID;
  local_index: number;
}

export interface FormPage {
  id: string;
  form_id: string;
  name: string;
  blocks: FormBlock[];
  background?: FormPageBackgroundSchema;
  stylesheet?: FormStyleSheetV1Schema;
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
  v_hidden?: AST.JSONBooleanValueDescriptor | null;
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
// not supported yet
// | "layout"

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

export type FormFieldDataSchema = PaymentFieldData | {};

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

export type FormFieldStorageSchema =
  | {
      type: "grida";
      bucket: string;
      path: string;
      mode: "direct" | "staged";
    }
  | XS3StorageSchema
  | XSupabaseStorageSchema;

export interface FormFieldReferenceSchema {
  type: "x-supabase";
  schema: string;
  table: string;
  column: string;
}

export type PaymentsServiceProviders = "stripe" | "tosspayments";

export interface PaymentFieldData {
  type: "payment";
  service_provider: PaymentsServiceProviders;
}

export type FormPageBackgroundSchema = FormPageThemeEmbeddedBackgroundData;

export type FormStyleSheetV1Schema = {
  section?: string;
  "font-family"?: "inter" | "lora" | "inconsolata";
  palette?: keyof typeof palettes;
  custom?: string;
};

interface FormPageThemeEmbeddedBackgroundData {
  type: "background";
  element: "iframe" | "img" | "div";
  /**
   * allowed for iframe, img
   */
  src?: string;
  /**
   * allowed for all
   */
  "background-color"?: string;
}

export type EndingPageTemplateID = "default" | "receipt01";

export interface EndingPageI18nOverrides {
  $schema: "https://forms.grida.co/schemas/v1/endingpage.json";
  template_id: EndingPageTemplateID;
  overrides: Record<string, string>;
}

export interface Geo {
  city?: string | undefined;
  country?: string | undefined;
  region?: string | undefined;
  latitude?: string | undefined;
  longitude?: string | undefined;
}

export interface ConnectionSupabaseJoint {
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
  id: number;
  name: string;
  owner_id: string;
}
