import {
  FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED,
  FORM_RESPONSE_LIMIT_REACHED,
  MISSING_REQUIRED_HIDDEN_FIELDS,
  UUID_FORMAT_MISMATCH,
} from "@/k/error";
import {
  SYSTEM_GF_CUSTOMER_UUID_KEY,
  SYSTEM_GF_KEY_STARTS_WITH,
} from "@/k/system";
import { blockstree } from "@/lib/forms/tree";
import { FormBlockTree } from "@/lib/forms/types";
import { client } from "@/lib/supabase/server";
import { upsert_customer_with } from "@/services/customer";
import {
  FormBlock,
  FormBlockType,
  FormFieldDataSchema,
  FormFieldDefinition,
  FormFieldType,
  FormPage,
} from "@/types";
import { is_uuid_v4 } from "@/utils/is";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

interface FormClientFetchResponse {
  data: FormClientFetchResponseData | null;
  error: FormClientFetchResponseError | null;
}

export interface FormClientFetchResponseData {
  title: string;
  tree: FormBlockTree<ClientRenderBlock[]>;
  blocks: ClientRenderBlock[];
  fields: FormFieldDefinition[];
  required_hidden_fields: FormFieldDefinition[];
  lang: string;
  options: {
    is_powered_by_branding_enabled: boolean;
  };
  background?: FormPage["background"];
  stylesheet?: FormPage["stylesheet"];
  default_values: { [key: string]: string };
  // access
  is_closed: boolean;
  is_closed_for_customer: boolean;
  customer_identity_status: "anonymous" | "inferred" | "identified" | "trusted";
  customer_identity_checked_by: "fingerprint" | "developer" | "system";
  last_customer_response_id: string | null;
}

export type FormClientFetchResponseError =
  | MissingRequiredHiddenFieldsError
  | MaxResponseByCustomerError
  | {
      code: string;
      message: string;
    };
export interface MissingRequiredHiddenFieldsError {
  code: "MISSING_REQUIRED_HIDDEN_FIELDS";
  message: string;
  missing_required_hidden_fields: FormFieldDefinition[];
}

export interface MaxResponseByCustomerError {
  code: "FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED";
  message: string;
  max: number;
  last_response_id: string;
}

export type ClientRenderBlock =
  | ClientFieldRenderBlock
  | ClientSectionRenderBlock
  | ClientHtmlRenderBlock
  | ClientImageRenderBlock
  | ClientVideoRenderBlock
  | ClientDividerRenderBlock
  | ClientHeaderRenderBlock
  | ClientPdfRenderBlock;

interface BaseRenderBlock {
  id: string;
  type: FormBlockType;
  local_index: number;
  parent_id: string | null;
}

interface ClientFieldRenderBlock extends BaseRenderBlock {
  type: "field";
  field: {
    id: string;
    type: FormFieldType;
    name: string;
    label?: string;
    help_text?: string;
    min?: number;
    max?: number;
    pattern?: string;
    required?: boolean;
    minlength?: number;
    maxlength?: number;
    placeholder?: string;
    options?: {
      id: string;
      label?: string;
      value: string;
      index: number;
    }[];
    autocomplete?: string;
    data?: FormFieldDataSchema | null;
    accept?: string;
    multiple?: boolean;
  };
}
export interface ClientSectionRenderBlock extends BaseRenderBlock {
  type: "section";
  children?: ClientRenderBlock[];
  attributes?: {
    contains_payment: boolean;
  };
}

interface ClientHtmlRenderBlock extends BaseRenderBlock {
  type: "html";
  html: string;
}
interface ClientImageRenderBlock extends BaseRenderBlock {
  type: "image";
  src: string;
}

interface ClientVideoRenderBlock extends BaseRenderBlock {
  type: "video";
  src: string;
}

interface ClientPdfRenderBlock extends BaseRenderBlock {
  type: "pdf";
  data: string;
}

interface ClientDividerRenderBlock extends BaseRenderBlock {
  type: "divider";
}

interface ClientHeaderRenderBlock extends BaseRenderBlock {
  type: "header";
  title_html?: string | null;
  description_html?: string | null;
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

  const __keys = Array.from(req.nextUrl.searchParams.keys());
  const system_gf_keys: string[] = __keys.filter((key) =>
    key.startsWith(SYSTEM_GF_KEY_STARTS_WITH)
  );

  // system keys validation
  if (system_gf_keys.includes(SYSTEM_GF_CUSTOMER_UUID_KEY)) {
    if (!is_uuid_v4(searchParams.get(SYSTEM_GF_CUSTOMER_UUID_KEY) as string)) {
      response.error = UUID_FORMAT_MISMATCH;
    }
  }
  //

  const cookieStore = cookies();
  // TODO: strict with permissions
  const supabase = client;
  // const supabase = createRouteHandlerClient(cookieStore);

  const { data, error } = await supabase
    .from("form")
    .select(
      `
        *,
        fields:form_field(
          *,
          options:form_field_option(*)
        ),
        default_page:form_page!default_form_page_id(
          *,
          blocks:form_block(*)
        )
      `
    )
    .eq("id", id)
    .single();

  error && console.error(id, error);

  if (!data) {
    return notFound();
  }

  const {
    title,
    default_page,
    fields,
    is_powered_by_branding_enabled,
    default_form_page_language,
    is_max_form_responses_in_total_enabled,
    max_form_responses_in_total,
    is_max_form_responses_by_customer_enabled,
    max_form_responses_by_customer,
    project_id: __project_id,
  } = data;

  const page_blocks = (data.default_page as unknown as FormPage).blocks;

  // @ts-ignore
  let render_blocks: ClientRenderBlock[] = page_blocks
    ?.map((block: FormBlock) => {
      const is_field = block.type === "field";
      const field = is_field
        ? fields.find((f: any) => f.id === block.form_field_id) ?? null
        : null;

      if (is_field) {
        // assert fiel to be not null
        if (!field) {
          return null; // this will be filtered out
        }
        return <ClientFieldRenderBlock>{
          id: block.id,
          type: "field",
          field: {
            ...field,
            options: field.options.sort((a, b) => a.index - b.index),
            required: field.required ?? undefined,
            multiple: field.multiple ?? undefined,
            autocomplete: field.autocomplete?.join(" ") ?? null,
          },
          local_index: block.local_index,
          parent_id: block.parent_id,
        };
      }

      switch (block.type) {
        case "html": {
          return <ClientHtmlRenderBlock>{
            id: block.id,
            type: "html",
            html: block.body_html,
            local_index: block.local_index,
            parent_id: block.parent_id,
          };
        }
        case "header": {
          return <ClientHeaderRenderBlock>{
            id: block.id,
            type: "header",
            local_index: block.local_index,
            parent_id: block.parent_id,
            title_html: block.title_html,
            description_html: block.description_html,
          };
        }
        case "image":
        case "video": {
          return <ClientImageRenderBlock>{
            id: block.id,
            type: block.type,
            src: block.src,
            local_index: block.local_index,
            parent_id: block.parent_id,
          };
        }
        case "pdf": {
          return <ClientPdfRenderBlock>{
            id: block.id,
            type: "pdf",
            // for pdf, as the standard is <object> we use data instead of src
            data: block.src,
            local_index: block.local_index,
            parent_id: block.parent_id,
          };
        }
        case "section": {
          const children_ids = page_blocks.filter(
            (b) => b.parent_id === block.id
          );

          const contains_payment = children_ids.some(
            (b) =>
              b.type === "field" &&
              fields.find((f) => f.id === b.form_field_id)?.type === "payment"
          );

          return <ClientSectionRenderBlock>{
            id: block.id,
            type: "section",
            local_index: block.local_index,
            attributes: {
              contains_payment,
            },
          };
        }
        case "divider":
        default: {
          return <BaseRenderBlock>{
            id: block.id,
            type: block.type,
            local_index: block.local_index,
            parent_id: block.parent_id,
          };
        }
      }
    })
    .filter(Boolean);

  // if no blocks, render a simple form based on fields
  if (!render_blocks.length) {
    render_blocks = fields.map((field: any, i) => {
      return {
        id: field.id,
        type: "field",
        field: {
          id: field.id,
          type: field.type,
          name: field.name,
        },
        local_index: i,
        parent_id: null,
      };
    });
  }

  const tree = blockstree(render_blocks);

  const required_hidden_fields = fields.filter(
    (f) => f.type === "hidden" && f.required
  );

  const { seed, missing_required_hidden_fields } = parseSeedFromSearchParams({
    searchParams,
    fields,
    required_hidden_fields,
  });

  // check if required hidden fields are provided.
  // if not, raise developer error.
  if (missing_required_hidden_fields.length) {
    response.error = {
      ...MISSING_REQUIRED_HIDDEN_FIELDS,
      missing_required_hidden_fields,
    };
  }

  // fetch customer
  let customer: { uid: string } | null = null;
  if (
    system_gf_keys.includes(SYSTEM_GF_CUSTOMER_UUID_KEY)
    // TODO: or fingerprint
  ) {
    customer = await upsert_customer_with({
      project_id: __project_id,
      uuid: searchParams.get(SYSTEM_GF_CUSTOMER_UUID_KEY) as string,
      hints: {
        // TODO: add fingerprint support
        _fp_fingerprintjs_visitorid: undefined,
      },
    });
  }

  // response number
  if (is_max_form_responses_in_total_enabled) {
    //
    const { count } = await client
      .from("response")
      .select("id", { count: "exact" })
      .eq("form_id", id);

    if ((count ?? 0) >= (max_form_responses_in_total ?? Infinity)) {
      // reject: cause the form has reached the limit
      response.error = FORM_RESPONSE_LIMIT_REACHED;
    }
  }
  // response number by customer
  if (is_max_form_responses_by_customer_enabled) {
    if (customer) {
      //
      const { count, data } = await client
        .from("response")
        .select("id", { count: "exact" })
        .eq("form_id", id)
        .eq("customer_id", customer.uid);

      if ((count ?? 0) >= (max_form_responses_by_customer ?? Infinity)) {
        // reject: cause the customer has reached the limit
        response.error = {
          ...FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED,
          max: max_form_responses_by_customer ?? Infinity,
          last_response_id: data?.[0]?.id,
        };
      }
    } else {
      // TODO:
      // there is a limit to 'by-customer' but there was no way to identify this customer, which forcing it to close.
    }
  }

  const payload: FormClientFetchResponseData = {
    title: title,
    tree: tree,
    blocks: render_blocks,
    fields: fields,
    required_hidden_fields: required_hidden_fields,
    lang: default_form_page_language,
    options: {
      is_powered_by_branding_enabled,
    },
    background: (data.default_page as unknown as FormPage).background,
    stylesheet: (data.default_page as unknown as FormPage).stylesheet,

    // default value
    default_values: seed,

    // access
    is_closed: response.error !== null,
    is_closed_for_customer:
      response.error?.code === FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED.code,
    // TODO:
    customer_identity_status: "anonymous",
    // TODO:
    customer_identity_checked_by: "fingerprint",
    last_customer_response_id: null,
  };

  response.data = payload;

  return NextResponse.json(response);
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
