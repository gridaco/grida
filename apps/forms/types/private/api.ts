import type { IFormField } from "../index";
import { InventoryLevelCommit } from "../inventory";

export type FormFieldUpsert = IFormField & {
  form_id: string;
  id?: string;
  options_inventory?: { [option_id: string]: InventoryLevelCommit };
};

export interface EditorApiResponse<T, E = any> {
  data: T;
  error?: E | null;
  message?: string;
}
