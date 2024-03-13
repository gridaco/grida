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

export interface FormFieldDefinition {
  id: string;
  name: string;
  label?: string | null;
  type: FormFieldType;
  placeholder?: string | null;
  required: boolean;
  help_text?: string | null;
}

export type FormBlockType =
  | "section"
  | "group"
  | "field"
  // not supported yet
  | "markdown"
  // not supported yet
  | "layout"
  // not supported yet
  | "divider";
