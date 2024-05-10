import type { FormFieldAutocompleteType, FormInputType } from ".";

export interface JSONForm {
  title?: string;
  name: string;
  description?: string;
  action?: string;
  enctype?:
    | "application/x-www-form-urlencoded"
    | "multipart/form-data"
    | "text/plain";
  method?: "get" | "post" | "dialog";
  novalidate?: boolean;
  target?: "_blank" | "_self" | "_parent" | "_top";
  fields?: JSONField[];
}

export interface JSONField {
  name: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  pattern?: string;
  type: FormInputType;
  options?: JSONOptionLike[];
  multiple?: boolean;
  autocomplete?: FormFieldAutocompleteType | FormFieldAutocompleteType[];
}

export type JSONOptionLike = JSONOption | string | number;

export interface JSONOption {
  value: string;
  label?: string;
  src?: string;
  disabled?: boolean;
}
