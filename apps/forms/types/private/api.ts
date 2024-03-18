import type { NewFormFieldInit } from "..";

export type FormFieldUpsert = NewFormFieldInit & {
  form_id: string;
  id?: string;
};

export interface EditorApiResponse<T> {
  data: T;
  message: string;
}
