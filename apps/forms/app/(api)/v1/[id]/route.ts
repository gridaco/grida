import { NextRequest, NextResponse } from "next/server";
import {
  FORM_FORCE_CLOSED,
  FORM_OPTION_UNAVAILABLE,
  FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED,
  FORM_RESPONSE_LIMIT_REACHED,
  FORM_SOLD_OUT,
  MISSING_REQUIRED_HIDDEN_FIELDS,
  POSSIBLE_CUSTOMER_IDENTITY_FORGE,
  REQUIRED_HIDDEN_FIELD_NOT_USED,
  UUID_FORMAT_MISMATCH,
  VISITORID_FORMAT_MISMATCH,
} from "@/k/error";
import resources from "@/i18n";
import {
  SYSTEM_GF_CUSTOMER_EMAIL_KEY,
  SYSTEM_GF_CUSTOMER_UUID_KEY,
  SYSTEM_GF_FINGERPRINT_VISITORID_KEY,
} from "@/k/system";
import { FormBlockTree } from "@/lib/forms/types";
import { grida_forms_client } from "@/lib/supabase/server";
import { upsert_customer_with } from "@/services/customer";
import {
  FormFieldOptionsInventoryMap,
  form_field_options_inventory,
  validate_options_inventory,
} from "@/services/form/inventory";
import {
  validate_max_access_by_customer,
  validate_max_access_by_form,
} from "@/services/form/validate-max-access";
import i18next from "i18next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { FormRenderTree, type ClientRenderBlock } from "@/lib/forms";
import type {
  FormFieldDefinition,
  FormMethod,
  FormDocument,
  Option,
  FormsPageLanguage,
} from "@/types";
import { Features } from "@/lib/features/scheduling";
import { requesterurl, resolverurl } from "@/services/form/session-storage";
import { type GFKeys, parseGFKeys } from "@/lib/forms/gfkeys";
import { RawdataProcessing } from "@/lib/forms/rawdata";

export const revalidate = 0;

const cjk = ["ko", "ja"];

interface FormClientFetchResponse {
  data: FormClientFetchResponseData | null;
  error: FormClientFetchResponseError | null;
}

export interface FormClientFetchResponseData {
  title: string;
  session_id: string;
  method: FormMethod;
  tree: FormBlockTree<ClientRenderBlock[]>;
  blocks: ClientRenderBlock[];
  fields: FormFieldDefinition[];
  required_hidden_fields: FormFieldDefinition[];
  lang: string;
  options: {
    is_powered_by_branding_enabled: boolean;
    optimize_for_cjk: boolean;
  };
  background?: FormDocument["background"];
  stylesheet?: FormDocument["stylesheet"];
  default_values: { [key: string]: string };
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
        | typeof FORM_SOLD_OUT.code
        | typeof FORM_OPTION_UNAVAILABLE.code;
      message: string;
    };
export interface MissingRequiredHiddenFieldsError {
  code:
    | typeof MISSING_REQUIRED_HIDDEN_FIELDS.code
    | typeof REQUIRED_HIDDEN_FIELD_NOT_USED.code;
  message: string;
  missing_required_hidden_fields: FormFieldDefinition[];
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

export async function GET(
  req: NextRequest,
  context: {
    params: {
      id: string;
    };
  }
) {
  const response: FormClientFetchResponse = {
    data: null,
    error: null,
  };
  const id = context.params.id;
  const searchParams = req.nextUrl.searchParams;

  let system_keys: GFKeys = {};
  try {
    system_keys = parseGFKeys(searchParams);
  } catch (e) {
    console.error("error while parsing system keys:", e);
    // @ts-ignore
    response.error = e;
  }

  const cookieStore = cookies();
  // TODO: strict with permissions
  const supabase = grida_forms_client;
  // const supabase = createRouteHandlerClient(cookieStore);

  const { data, error } = await supabase
    .from("form")
    .select(
      `
        *,
        fields:form_field(
          *,
          options:form_field_option(*),
          optgroups:optgroup(*)
        ),
        default_page:form_document!default_form_page_id(
          *,
          blocks:form_block(*)
        ),
        store_connection:connection_commerce_store(*)
      `
    )
    .eq("id", id)
    .single();

  error && console.error("v1init", id, error);

  if (!data) {
    return notFound();
  }

  // ==================================================
  // bare setup
  // ==================================================

  const {
    title,

    description,
    default_page,
    fields,
    is_max_form_responses_in_total_enabled,
    max_form_responses_in_total,
    is_max_form_responses_by_customer_enabled,
    max_form_responses_by_customer,
    project_id: __project_id,
    is_force_closed: __is_force_closed,
    is_scheduling_enabled,
    scheduling_open_at,
    scheduling_close_at,
    store_connection,
  } = data;

  const lang: FormsPageLanguage =
    (default_page as unknown as FormDocument | null)?.lang ?? "en";
  const is_powered_by_branding_enabled =
    (default_page as unknown as FormDocument | null)
      ?.is_powered_by_branding_enabled ?? true;
  const method: FormMethod =
    (default_page as unknown as FormDocument | null)?.method ?? "post";

  // load serverside i18n
  await i18next.init({
    lng: lang,
    debug: false,
    resources: resources,
    preload: [lang],
  });

  const page_blocks = (data.default_page as unknown as FormDocument | null)
    ?.blocks;

  const __gf_fp_fingerprintjs_visitorid =
    system_keys[SYSTEM_GF_FINGERPRINT_VISITORID_KEY];
  const __gf_customer_uuid = system_keys[SYSTEM_GF_CUSTOMER_UUID_KEY];
  const __gf_customer_email = system_keys[SYSTEM_GF_CUSTOMER_EMAIL_KEY];

  // endregion

  // ==================================================
  // customer
  // ==================================================

  // fetch customer
  let customer: { uid: string } | null = null;
  if (
    __gf_customer_uuid ||
    __gf_fp_fingerprintjs_visitorid ||
    __gf_customer_email
  ) {
    try {
      customer = await upsert_customer_with({
        project_id: __project_id,
        uuid: __gf_customer_uuid,
        hints: {
          email: __gf_customer_email,
          _fp_fingerprintjs_visitorid: __gf_fp_fingerprintjs_visitorid,
        },
      });
    } catch (e) {
      response.error = POSSIBLE_CUSTOMER_IDENTITY_FORGE;
      console.error("error while upserting customer:", e);
    }
  }

  // ==================================================
  // session
  // ==================================================
  const { data: session, error: session_error } = await supabase
    .from("response_session")
    .upsert(
      {
        id: system_keys.__gf_session ?? undefined,
        form_id: id,
        customer_id: customer?.uid,
      },
      { onConflict: "id" }
    )
    .select()
    .single();

  if (session_error || !session) {
    console.error("error while creating session", session_error);
    return NextResponse.error();
  }

  // endregion

  // store connection - inventory data
  let options_inventory: FormFieldOptionsInventoryMap | null = null;
  if (store_connection) {
    options_inventory = await form_field_options_inventory({
      project_id: __project_id,
      store_id: store_connection.store_id,
    });
  }

  function mkoption(option: Option) {
    const sku = option.id;

    if (options_inventory && option.id in options_inventory) {
      return sku_option(option, options_inventory[sku]);
    }

    return {
      ...option,
      disabled: option.disabled ?? undefined,
    };
  }

  function sku_option(option: Option, available: number): Option {
    const is_inventory_available = available > 0;
    const alert_under = 10;
    const is_alerting_inventory = available <= alert_under;

    return {
      ...option,
      label: is_inventory_available
        ? is_alerting_inventory
          ? `${option.label} (${i18next.t("left_in_stock", { available })})`
          : option.label
        : `${option.label} (${i18next.t("sold_out")})`,
      disabled: !is_inventory_available || (option.disabled ?? undefined),
    };
  }

  const renderer = new FormRenderTree(
    id,
    title,
    description,
    lang,
    fields,
    page_blocks,
    undefined,
    {
      option_renderer: mkoption,
      file_uploader: (field_id: string) => ({
        type: "requesturl",
        request_url: requesterurl({
          session_id: session.id,
          field_id: field_id,
        }),
      }),
      file_resolver: (field_id: string) => ({
        type: "requesturl",
        resolve_url: resolverurl({
          session_id: session.id,
          field_id: field_id,
        }),
      }),
    }
  );

  const required_hidden_fields = fields.filter(
    (f) => f.type === "hidden" && f.required
  );

  const not_included_required_hidden_fields = required_hidden_fields.filter(
    (f) => !renderer.fields({ render: true }).some((rf) => rf.id === f.id)
  );

  const { seed, missing_required_hidden_fields } = parseSeedFromSearchParams({
    searchParams,
    fields,
    required_hidden_fields,
  });

  // ==== validations ====
  // validation execution order matters (does not affect this logic, but logic on the client side, since only one error is shown at a time.
  // to fix this we need to add support for multiple errors in the response, and client side should handle it.

  // access validation - check max response limit
  if (is_max_form_responses_in_total_enabled) {
    const max_access_error = await validate_max_access_by_form({ form_id: id });
    if (max_access_error) {
      switch (max_access_error.code) {
        case "FORM_RESPONSE_LIMIT_REACHED": {
          response.error = max_access_error;
          console.error("session/err", max_access_error);
          break;
        }
        default: {
          return NextResponse.error();
        }
      }
    }
  }

  // data validation - check if all required hidden fields are provided.
  if (not_included_required_hidden_fields.length > 0) {
    // check if required hidden fields are not used.
    response.error = {
      ...REQUIRED_HIDDEN_FIELD_NOT_USED,
      missing_required_hidden_fields: not_included_required_hidden_fields,
    };
  } else {
    // check if required hidden fields are provided.
    // if not, raise developer error.
    if (missing_required_hidden_fields.length) {
      response.error = {
        ...MISSING_REQUIRED_HIDDEN_FIELDS,
        missing_required_hidden_fields,
      };
    }
  }

  // connection status validation - grida_commerce inventory
  if (options_inventory) {
    // TODO: [might have been resolved] we need to pass inventory map witch only present in render_fields (for whole sold out validation)
    const render_options = renderer
      .fields({ render: true })
      .map((f) => f.options ?? [])
      .flat();
    const inventory_access_error = await validate_options_inventory({
      inventory: options_inventory,
      options: render_options,
      config: {
        available_counting_strategy: "sum_positive",
      },
    });

    if (inventory_access_error) {
      console.error("inventory_access_error", {
        keys: Object.keys(options_inventory),
        options: render_options?.length,
        err: inventory_access_error,
      });
      response.error = inventory_access_error;
    }
  }

  // access validation - check if new response is accepted for custoemer
  if (is_max_form_responses_by_customer_enabled) {
    const max_access_by_customer_error = await validate_max_access_by_customer({
      form_id: id,
      customer_id: customer?.uid,
      is_max_form_responses_by_customer_enabled,
      max_form_responses_by_customer,
    });
    if (max_access_by_customer_error) {
      switch (max_access_by_customer_error.code) {
        case "FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED": {
          const error: MaxResponseByCustomerError = {
            ...max_access_by_customer_error,
            customer_id: customer?.uid,
            __gf_customer_email,
            __gf_customer_uuid,
            __gf_fp_fingerprintjs_visitorid,
          };
          console.error("session/err", error);
          response.error = error;
          break;
        }
        default: {
          return NextResponse.error();
        }
      }
    }
  }

  // validation - check if form is force closed
  if (__is_force_closed) {
    response.error = FORM_FORCE_CLOSED;
  }

  // validation - check if form is open by schedule
  if (is_scheduling_enabled) {
    const isopen = Features.schedule_in_range({
      open: scheduling_open_at,
      close: scheduling_close_at,
    });

    if (!isopen) {
      // TODO: need a better error message
      response.error = FORM_FORCE_CLOSED;
    }
  }

  const default_values = merge(
    seed, // seed from search params
    session.raw // data from ongoing session
      ? RawdataProcessing.idkeytonamekey(session.raw as {}, fields)
      : {}
  );

  const is_open = !__is_force_closed && response.error === null;
  const payload: FormClientFetchResponseData = {
    title: title,
    session_id: session.id,
    method,
    tree: renderer.tree(),
    blocks: renderer.blocks(),
    fields: fields,
    required_hidden_fields: required_hidden_fields,
    lang: lang,
    options: {
      is_powered_by_branding_enabled,
      optimize_for_cjk: cjk.includes(lang),
    },
    background: (data.default_page as unknown as FormDocument | null)
      ?.background,
    stylesheet: (data.default_page as unknown as FormDocument | null)
      ?.stylesheet,

    // default value
    default_values: default_values,

    // access
    is_open: is_open,
    customer_access: {
      customer: customer,
      is_open:
        is_open === false
          ? false
          : response.error?.code !==
            FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED.code,
      // TODO:
      customer_identity_status: "anonymous",
      // TODO:
      customer_identity_checked_by: "nocheck",
      last_customer_response_id: null,
    },
  };

  response.data = payload;

  // console.log("v1: response", response);

  return NextResponse.json(response);
}

function merge<A = any, B = any>(a: A, b: B): A & B {
  return { ...a, ...b };
}

function parseSeedFromSearchParams({
  searchParams,
  fields,
  required_hidden_fields,
}: {
  searchParams: URLSearchParams;
  fields: FormFieldDefinition[];
  required_hidden_fields: FormFieldDefinition[];
}) {
  const seed: { [key: string]: string } = {};

  for (const field of fields) {
    const val = searchParams.get(field.name);
    if (val) {
      seed[field.name] = val;
    }
  }

  const missing_required_hidden_fields = required_hidden_fields.filter(
    (field) => !searchParams.get(field.name)
  );

  return { seed, missing_required_hidden_fields };
}
