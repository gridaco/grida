import { Database } from "./supabase";

export type FormFieldType = Database["grida_forms"]["Enums"]["form_field_type"];

export interface FormFieldDefinition {
  name: string;
  label: string;
  type: string;
  placeholder?: string;
  required: boolean;
}
