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

export type NewFormFieldInit = {
  name: string;
  label: string;
  placeholder: string;
  helpText: string;
  type: FormFieldType;
  required: boolean;
  options?: { label: string; value: string }[];
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
}

export type FormBlockType =
  | "section"
  // not supported yet
  | "group"
  | "field";
// not supported yet
// | "markdown"
// not supported yet
// | "layout"
// not supported yet
// | "divider";
