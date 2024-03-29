/**
 * user facing page language
 */
export type FormsPageLanguage = "en" | "ko";

export type FormResponseUnknownFieldHandlingStrategyType =
  | "accept"
  | "ignore"
  | "reject";

export type FormFieldType =
  | "text"
  | "textarea"
  | "tel"
  | "url"
  | "checkbox"
  | "checkboxes"
  | "number"
  | "date"
  | "month"
  | "week"
  | "email"
  | "file"
  | "image"
  | "select"
  | "latlng"
  | "password"
  | "color"
  | "radio"
  | "country"
  | "payment"
  | "hidden"
  | "signature";

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

export type PlatformPoweredBy = "api" | "grida_forms" | "web_client";

export type NewFormFieldInit = {
  name: string;
  label: string;
  placeholder: string;
  helpText: string;
  type: FormFieldType;
  required: boolean;
  options?: {
    id: string;
    label?: string;
    value: string;
    index?: number;
  }[];
  pattern?: string;
  autocomplete?: FormFieldAutocompleteType[] | null;
  data?: FormFieldDataSchema | null;
  accept?: string | null;
  multiple?: boolean;
};

export interface FormFieldDefinition {
  id: string;
  name: string;
  label?: string | null;
  type: FormFieldType;
  placeholder?: string | null;
  required: boolean;
  help_text?: string | null;
  pattern?: any | null;
  options?: {
    id: string;
    label?: string;
    value: string;
  }[];
  autocomplete?: FormFieldAutocompleteType[] | null;
  data?: FormFieldDataSchema | null;
  accept?: string | null;
  multiple?: boolean | null;
}

export interface FormPage {
  id: string;
  form_id: string;
  name: string;
  blocks: FormBlock[];
}

export interface FormBlock<T = FormBlockType> {
  id: string;
  form_id: string;
  form_field_id?: string | null;
  form_page_id: string | null;
  type: T;
  title_html?: string | null;
  description_html?: string | null;
  body_html?: string | null;
  src?: string | null;
  data: any;
  created_at: string;
  parent_id?: string | null;
  local_index: number;
}

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

export interface FormResponse {
  browser: string | null;
  created_at: string;
  customer_id: string | null;
  form_id: string | null;
  id: string;
  ip: string | null;
  platform_powered_by: PlatformPoweredBy | null;
  raw: any;
  updated_at: string;
  x_referer: string | null;
  x_useragent: string | null;
  fields?: FormResponseField[];
}

export interface FormResponseField {
  id: string;
  created_at: string;
  form_field_id: string;
  response_id: string;
  type: FormFieldType;
  updated_at: string;
  value: any;
}

export type FormFieldDataSchema = PaymentFieldData | {};

export type PaymentsServiceProviders = "stripe" | "tosspayments";

export interface PaymentFieldData {
  type: "payment";
  service_provider: PaymentsServiceProviders;
}
