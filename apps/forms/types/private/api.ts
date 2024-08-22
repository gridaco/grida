import type {
  FormFieldDefinition,
  FormMethod,
  FormResponseUnknownFieldHandlingStrategyType,
  IFormField,
} from "../types";
import type { InventoryLevelCommit } from "../inventory";
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

export type EditorApiResponse<T, E = any> = (
  | {
      data: null;
      error: E;
    }
  | { data: T; error?: E | null }
) & { message?: string };

/**
 * use this type when api returns ok without data or throws error
 * 200 or 500 without additional data
 */
export type EditorApiResponseOk<E = any> = EditorApiResponse<null, E>;

export type FormsApiResponse<T, E = any> = (
  | {
      data: null;
      error: E;
    }
  | { data: T; error: null }
) & { message?: string };

export interface CreateSignedUploadUrlRequest {
  file: {
    name: string;
    size: number;
    type: string;
    lastModified: number;
  };
}
export type CreateSessionSignedUploadUrlRequest = CreateSignedUploadUrlRequest;
export interface SignedUploadUrlData {
  signedUrl: string;
  path: string;
  token: string;
}

export type SessionSignedUploadUrlData = SignedUploadUrlData;

export type StoragePublicUrlData = {
  publicUrl: string;
};

export type UpdateFormRedirectAfterSubmissionRequest = {
  form_id: string;
  is_redirect_after_response_uri_enabled: boolean;
  redirect_after_response_uri?: string | null;
};

export type UpdateFormAccessForceClosedRequest = {
  form_id: string;
  closed: boolean;
};

export type UpdateFormAccessMaxResponseByCustomerRequest = {
  form_id: string;
  enabled: boolean;
  max?: number;
};

export type UpdateFormAccessMaxResponseInTotalRequest = {
  form_id: string;
  enabled: boolean;
  max?: number;
};

export type UpdateFormScheduleRequest = {
  form_id: string;
  enabled: boolean;
  open_at?: string | null;
  close_at?: string | null;
  scheduling_tz?: string | null;
};

export type UpdateFormMethodRequest = {
  form_id: string;
  method: FormMethod;
};

export type UpdateFormUnknownFieldsHandlingStrategyRequest = {
  form_id: string;
  strategy?: FormResponseUnknownFieldHandlingStrategyType;
};

export type CreateNewSchemaTableRequest = {
  schema_id: string;
  table_name: string;
  description?: string;
  template?: "cms-starter" | "cms-blog-starter";
};

export type CreateNewSchemaTableResponse = {
  id: string;
  name: string;
  description?: string | null;
  attributes: FormFieldDefinition[];
};

export namespace XSupabasePrivateApiTypes {
  export interface CreateConnectionTableRequestData {
    schema_name: string;
    table_name: string;
  }

  export interface AddSchemaNameRequestData {
    schema_name: string;
  }
}
