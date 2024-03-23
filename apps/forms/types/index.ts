export type FormFieldType =
  | "text"
  | "textarea"
  | "tel"
  | "url"
  | "checkbox"
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
  | "payment";

export type PlatformPoweredBy = "api" | "grida_forms" | "web_client";

export type NewFormFieldInit = {
  name: string;
  label: string;
  placeholder: string;
  helpText: string;
  type: FormFieldType;
  required: boolean;
  options?: { label?: string | null; value: string }[];
  pattern?: string;
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
    label?: string | null;
    value: string;
  }[];
}

export interface FormBlock {
  id: string;
  form_id: string;
  form_field_id?: string | null;
  type: FormBlockType;
  title_html?: string | null;
  description_html?: string | null;
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
  // not supported yet
  | "group";
// not supported yet
// | "layout"
// not supported yet
// | "divider";

export interface FormResponse {
  browser: string | null;
  created_at: string;
  customer_uuid: string | null;
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
