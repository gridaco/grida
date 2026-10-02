import * as ERR from "./constants";
import type { FormSubmitErrorCode } from "./contracts";

export interface FormLinkURLParams {
  alreadyresponded: {
    fingerprint?: string;
    customer_id?: string;
    session_id?: string;
  };
  complete: { rid: string };
  developererror?: {};
  badrequest: { error?: string };
  formclosed: {
    oops?:
      | typeof ERR.FORM_CLOSED_WHILE_RESPONDING.code
      | typeof ERR.FORM_SCHEDULE_NOT_IN_RANGE.code;
  };
  formsoldout?: {};
  formoptionsoldout?: {};
}

type ParamsForState<T extends keyof FormLinkURLParams> =
  T extends keyof FormLinkURLParams ? FormLinkURLParams[T] : never;

type FormLinkParams<T extends keyof FormLinkURLParams> =
  | [host: string, form_id: string, state: T, params: ParamsForState<T>]
  | [host: string, form_id: string, state?: T, params?: ParamsForState<T>];

export function formlink<T extends keyof FormLinkURLParams>(
  ...[host, form_id, state, params]: FormLinkParams<T>
) {
  const q = params
    ? new URLSearchParams(params as Record<string, string>).toString()
    : null;
  let url = state
    ? `${host}/d/e/${form_id}/${state}`
    : `${host}/d/e/${form_id}`;
  if (q) url += `?${q}`;
  return url;
}

export function formerrorlink(
  host: string,
  code: FormSubmitErrorCode,
  data: { form_id: string; [key: string]: string | undefined }
) {
  const { form_id } = data;

  switch (code) {
    case "INTERNAL_SERVER_ERROR":
      return formlink(host, form_id, "developererror");
    case "MISSING_REQUIRED_HIDDEN_FIELDS":
      return formlink(host, form_id, "badrequest", {
        error: ERR.MISSING_REQUIRED_HIDDEN_FIELDS.code,
      });
    case "UNKNOWN_FIELDS_NOT_ALLOWED":
      return formlink(host, form_id, "badrequest", {
        error: ERR.UNKNOWN_FIELDS_NOT_ALLOWED.code,
      });
    case "FORM_FORCE_CLOSED":
      return formlink(host, form_id, "formclosed", {
        oops: ERR.FORM_CLOSED_WHILE_RESPONDING.code,
      });
    case "FORM_CLOSED_WHILE_RESPONDING":
      return formlink(host, form_id, "formclosed", {
        oops: ERR.FORM_CLOSED_WHILE_RESPONDING.code,
      });
    case "FORM_RESPONSE_LIMIT_REACHED":
      return formlink(host, form_id, "formclosed", {
        oops: ERR.FORM_CLOSED_WHILE_RESPONDING.code,
      });
    case "FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED":
      return formlink(host, form_id, "alreadyresponded", {
        fingerprint: data.fingerprint,
        customer_id: data.customer_id,
        session_id: data.session_id,
      });
    case "FORM_SCHEDULE_NOT_IN_RANGE":
      return formlink(host, form_id, "formclosed", {
        oops: ERR.FORM_SCHEDULE_NOT_IN_RANGE.code,
      });
    case "FORM_SOLD_OUT":
      return formlink(host, form_id, "formsoldout");
    case "FORM_OPTION_UNAVAILABLE":
      return formlink(host, form_id, "formoptionsoldout");
    case "CHALLENGE_EMAIL_NOT_VERIFIED":
      return formlink(host, form_id, "badrequest", {
        error: "CHALLENGE_EMAIL_NOT_VERIFIED",
      });
  }
}
