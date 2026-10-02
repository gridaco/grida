import type {
  FormFieldDefinition,
  FormMethod,
  FormStartPageSchema,
  FormPageBackgroundSchema,
  FormStyleSheetV1Schema,
  CampaignMeta,
} from "./model";
import type { FormBlockTree } from "./tree";
import type { ClientRenderBlock } from "./render";
import * as ERR from "./constants";
import type {
  FORM_FORCE_CLOSED,
  FORM_OPTION_UNAVAILABLE,
  FORM_RESPONSE_LIMIT_REACHED,
  FORM_SCHEDULE_NOT_IN_RANGE,
  FORM_SOLD_OUT,
  MISSING_REQUIRED_HIDDEN_FIELDS,
  POSSIBLE_CUSTOMER_IDENTITY_FORGE,
  REQUIRED_HIDDEN_FIELD_NOT_USED,
  UUID_FORMAT_MISMATCH,
  VISITORID_FORMAT_MISMATCH,
} from "./constants";

export type PublicFormField = Pick<
  FormFieldDefinition,
  | "id"
  | "local_index"
  | "name"
  | "label"
  | "type"
  | "is_array"
  | "placeholder"
  | "required"
  | "readonly"
  | "help_text"
  | "pattern"
  | "step"
  | "min"
  | "max"
  | "options"
  | "optgroups"
  | "autocomplete"
  | "data"
  | "accept"
  | "multiple"
  | "v_value"
>;

export interface FormClientFetchResponse {
  data: FormAgentPrefetchData | null;
  error: FormClientFetchResponseError | null;
}

/**
 * v1/ prefetch for the form (campaign)
 *
 * includes the render tree and access state
 */
export interface FormAgentPrefetchData {
  title: string;
  session_id: string;
  method: FormMethod;
  start_page: FormStartPageSchema | null;
  tree: FormBlockTree<ClientRenderBlock[]>;
  blocks: ClientRenderBlock[];
  fields: PublicFormField[];
  required_hidden_fields: PublicFormField[];
  lang: string;
  options: {
    is_powered_by_branding_enabled: boolean;
    optimize_for_cjk: boolean;
  };
  background?: FormPageBackgroundSchema;
  stylesheet?: FormStyleSheetV1Schema;
  default_values: { [key: string]: string };
  campaign: CampaignMeta;
  // access
  is_open: boolean;
  customer_access: {
    customer: {
      uid: string;
    } | null;
    is_open: boolean;
    customer_identity_status:
      | "anonymous"
      | "inferred"
      | "identified"
      | "trusted";
    customer_identity_checked_by:
      | "nocheck"
      | "fingerprint"
      | "developer"
      | "system";
    last_customer_response_id: string | null;
  };
}

export type FormClientFetchResponseError =
  | MissingRequiredHiddenFieldsError
  | MaxResponseByCustomerError
  | {
      code:
        | typeof UUID_FORMAT_MISMATCH.code
        | typeof VISITORID_FORMAT_MISMATCH.code
        | typeof POSSIBLE_CUSTOMER_IDENTITY_FORGE.code
        | typeof FORM_RESPONSE_LIMIT_REACHED.code
        | typeof FORM_FORCE_CLOSED.code
        | typeof FORM_SCHEDULE_NOT_IN_RANGE.code
        | typeof FORM_SOLD_OUT.code
        | typeof FORM_OPTION_UNAVAILABLE.code;
      message: string;
    };
export interface MissingRequiredHiddenFieldsError {
  code:
    | typeof MISSING_REQUIRED_HIDDEN_FIELDS.code
    | typeof REQUIRED_HIDDEN_FIELD_NOT_USED.code;
  message: string;
  missing_required_hidden_fields: PublicFormField[];
}

export interface MaxResponseByCustomerError {
  code: "FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED";
  message: string;
  max: number;
  last_response_id?: string;
  customer_id?: string;
  __gf_customer_uuid?: string;
  __gf_fp_fingerprintjs_visitorid?: string;
  __gf_customer_email?: string;
}

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
  | typeof ERR.FORM_SCHEDULE_NOT_IN_RANGE.code
  | typeof ERR.CHALLENGE_EMAIL_NOT_VERIFIED.code;

export type FormsApiResponse<T, E = unknown> = (
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
export interface CreateSessionSignedUploadUrlRequest {
  file: {
    name: string;
    size: number;
    type?: string;
    lastModified?: number;
  };
}
export interface SignedUploadUrlData {
  signedUrl: string;
  path: string;
  token: string;
}

export type SessionSignedUploadUrlData = SignedUploadUrlData;

export type StoragePublicUrlData = {
  publicUrl: string;
};

export type EmailChallengeState =
  | "idle"
  | "challenge-session-started"
  | "challenge-expired"
  | "challenge-failed"
  | "challenge-success"
  | "error";

export type EmailChallengeSessionState = {
  state: EmailChallengeState;
  email: string | null;
  challenge_id: string | null;
  expires_at: string | null;
  verified_at: string | null;
  customer_uid: string | null;
};

export type EmailChallengeProvider = {
  getState(args: {
    sessionId: string;
    fieldId: string;
  }): Promise<EmailChallengeSessionState>;
  start(args: {
    sessionId: string;
    fieldId: string;
    email: string;
  }): Promise<EmailChallengeSessionState>;
  verify(args: {
    sessionId: string;
    fieldId: string;
    challengeId: string;
    otp: string;
  }): Promise<EmailChallengeSessionState>;
};

export type FormSessionData = { id: string; form_id: string };
export type FormSessionResponse = FormsApiResponse<FormSessionData>;
export type FormSubmitResponseData = { id: string; customer_id: string | null };
export interface FormSubmitDiagnostics {
  warning: {
    ignored_keys: { message: string; data: { keys: string[] } };
  } | null;
  info: {
    new_keys: {
      message: string;
      data: { keys: string[]; fields: PublicFormField[] };
    };
  } | null;
}
export type FormSubmitResponse = FormsApiResponse<
  FormSubmitResponseData,
  string
> &
  Partial<FormSubmitDiagnostics>;
export type FormPartialSaveRequest = { value: unknown };
export type FormPartialSaveResponse = { ok: true };
export type FormReferenceSearchMetaResponse = {
  meta: {
    provider: "x-supabase";
    supabase_project_id: number;
    schema_name: string;
    referenced_table: string;
    referenced_column: string;
  };
};
