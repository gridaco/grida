import type { IFormField } from "../index";
import { InventoryLevelCommit } from "../inventory";
import * as ERR from "@/k/error";

export type FormSubmitErrorCode =
  | typeof ERR.SERVICE_ERROR.code
  | typeof ERR.MISSING_REQUIRED_HIDDEN_FIELDS.code
  | typeof ERR.UNKNOWN_FIELDS_NOT_ALLOWED.code
  | typeof ERR.FORM_FORCE_CLOSED.code
  | typeof ERR.FORM_CLOSED_WHILE_RESPONDING.code
  | typeof ERR.FORM_RESPONSE_LIMIT_REACHED.code
  | typeof ERR.FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED.code
  | typeof ERR.FORM_SOLD_OUT.code
  | typeof ERR.FORM_OPTION_UNAVAILABLE.code
  | typeof ERR.FORM_SCHEDULE_NOT_IN_RANGE.code;

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
