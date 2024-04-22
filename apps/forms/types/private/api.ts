import type { NewFormFieldInit } from "..";

export type FormFieldUpsert = NewFormFieldInit & {
  form_id: string;
  id?: string;
};

export interface EditorApiResponse<T, E = any> {
  data: T;
  error?: E | null;
  message?: string;
}
