import type { FormFieldAutocompleteType, FormFieldType } from ".";

export interface JSONForm {
  title: string;
  description: string;
  fields: JSONField[];
}

export interface JSONField {
  name: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  pattern?: string;
  type: FormFieldType;
  options?: JSONOption[];
  autocomplete?: FormFieldAutocompleteType[];
}

export interface JSONOption {
  value: string;
  label?: string;
  src?: string;
  disabled?: boolean;
}
