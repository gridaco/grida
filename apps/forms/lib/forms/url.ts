import type { FormSubmitErrorCode } from "@/types/private/api";
import * as ERR from "@/k/error";

type BaseEditorLinkParamsOptionalSeed =
  | {
      org: string;
      proj: string;
    }
  | {
      basepath: string;
    };

type BaseEditorLinkParams = {
  origin?: string;
  document_id: string;
} & BaseEditorLinkParamsOptionalSeed;

// Define a type map for each route, associating it with its required parameters
type EditorPageParamsMap = {
  ".": {};
  form: {};
  "form/edit": {};
  settings: {};
  design: {};
  data: {};
  "data/responses": {};
  "data/analytics": {};
  "data/simulator": {};
  "data/table/[tablename]": { tablename: string }; // Requires tablename in addition to shared params
  "data/table/~new": {};
  connect: {};
  "connect/share": {};
  "connect/parameters": {};
  "connect/customer": {};
  "connect/channels": {};
  "connect/store": {};
  "connect/store/get-started": {};
  "connect/store/products": {};
  "connect/database/supabase": {};
};

type EditorPageType = keyof EditorPageParamsMap;

export function editorlink<P extends EditorPageType>(
  page: P,
  {
    origin = "",
    document_id: id,
    ...params
  }: BaseEditorLinkParams & EditorPageParamsMap[P]
) {
  const basepath = editorbasepath(params);
  switch (page) {
    case ".":
      return `${origin}/${basepath}/${id}`;
    case "form":
      return `${origin}/${basepath}/${id}/form`;
    case "form/edit":
      return `${origin}/${basepath}/${id}/form/edit`;
    case "settings":
      return `${origin}/${basepath}/${id}/settings`;
    // case "settings/customize":
    //   return `${origin}/${basepath}/${form_id}/settings/customize`;
    // case "settings/general":
    //   return `${origin}/${basepath}/${form_id}/settings/general`;
    case "design":
      return `${origin}/${basepath}/${id}/design`;
    case "data":
      return `${origin}/${basepath}/${id}/data`;
    case "data/responses":
      return `${origin}/${basepath}/${id}/data/responses`;
    case "data/analytics":
      return `${origin}/${basepath}/${id}/data/analytics`;
    case "data/simulator":
      return `${origin}/${basepath}/${id}/data/simulator`;
    case "connect":
      return `${origin}/${basepath}/${id}/connect`;
    case "connect/share":
      return `${origin}/${basepath}/${id}/connect/share`;
    case "connect/parameters":
      return `${origin}/${basepath}/${id}/connect/parameters`;
    case "connect/customer":
      return `${origin}/${basepath}/${id}/connect/customer`;
    case "connect/channels":
      return `${origin}/${basepath}/${id}/connect/channels`;
    case "connect/store":
      return `${origin}/${basepath}/${id}/connect/store`;
    case "connect/store/get-started":
      return `${origin}/${basepath}/${id}/connect/store/get-started`;
    case "connect/store/products":
      return `${origin}/${basepath}/${id}/connect/store/products`;
    case "connect/database/supabase":
      return `${origin}/${basepath}/${id}/connect/database/supabase`;
    case "data/table/~new":
      return `${origin}/${basepath}/${id}/data/table/~new`;
    case "data/table/[tablename]":
      const { tablename } = params as unknown as { tablename: string };
      return `${origin}/${basepath}/${id}/data/table/${tablename}`;
  }

  return "";
}

export function editorbasepath(
  params:
    | {
        org: string;
        proj: string;
      }
    | {
        basepath: string;
      }
) {
  if ("basepath" in params) return params.basepath;
  return `${params.org}/${params.proj}`;
}

export function resolve_next(
  origin: string,
  uri?: string | null,
  fallback = "/"
) {
  if (!uri) return resolve_next(origin, fallback);
  // Check if the URL is absolute
  const isAbsolute = /^https?:\/\//i.test(uri);

  // If the URL is absolute, return it as is
  if (isAbsolute) {
    return uri;
  }

  // If the URL is relative, combine it with the origin
  const combinedUri = new URL(uri, origin).toString();

  return combinedUri;
}

export interface FormLinkURLParams {
  alreadyresponded: {
    fingerprint?: string;
    customer_id?: string;
    session_id?: string;
  };
  complete: {
    // response id
    rid: string;
  };
  developererror?: {};
  badrequest?: {};
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
  const q = params ? new URLSearchParams(params as any).toString() : null;
  let url = _form_state_link(host, form_id, state);
  if (q) url += `?${q}`;
  return url;
}

function _form_state_link(
  host: string,
  form_id: string,
  state?:
    | "complete"
    | "alreadyresponded"
    | "developererror"
    | "badrequest"
    | "formclosed"
    | "formsoldout"
    | "formoptionsoldout"
) {
  if (state) return `${host}/d/e/${form_id}/${state}`;
  return `${host}/d/e/${form_id}`;
}

export function formerrorlink(
  host: string,
  code: FormSubmitErrorCode,
  data: {
    form_id: string;
    [key: string]: any;
  }
) {
  const { form_id } = data;

  switch (code) {
    case "INTERNAL_SERVER_ERROR": {
      return formlink(host, form_id, "developererror");
    }
    case "MISSING_REQUIRED_HIDDEN_FIELDS": {
      return formlink(host, form_id, "badrequest", {
        error: ERR.MISSING_REQUIRED_HIDDEN_FIELDS.code,
      });
    }
    case "UNKNOWN_FIELDS_NOT_ALLOWED": {
      return formlink(host, form_id, "badrequest", {
        error: ERR.UNKNOWN_FIELDS_NOT_ALLOWED.code,
      });
    }
    case "FORM_FORCE_CLOSED": {
      return formlink(host, form_id, "formclosed", {
        oops: ERR.FORM_CLOSED_WHILE_RESPONDING.code,
      });
    }
    case "FORM_CLOSED_WHILE_RESPONDING": {
      return formlink(host, form_id, "formclosed", {
        oops: ERR.FORM_CLOSED_WHILE_RESPONDING.code,
      });
    }
    case "FORM_RESPONSE_LIMIT_REACHED": {
      return formlink(host, form_id, "formclosed", {
        oops: ERR.FORM_CLOSED_WHILE_RESPONDING.code,
      });
    }
    case "FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED": {
      return formlink(host, form_id, "alreadyresponded", {
        fingerprint: data.fingerprint,
        customer_id: data.customer_id,
        session_id: data.session_id,
      });
    }
    case "FORM_SCHEDULE_NOT_IN_RANGE": {
      return formlink(host, form_id, "formclosed", {
        oops: ERR.FORM_SCHEDULE_NOT_IN_RANGE.code,
      });
    }
    case "FORM_SOLD_OUT": {
      return formlink(host, form_id, "formsoldout");
    }
    case "FORM_OPTION_UNAVAILABLE": {
      return formlink(host, form_id, "formoptionsoldout");
    }
  }
}
