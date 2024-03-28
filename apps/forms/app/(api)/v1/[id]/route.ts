import { blockstree } from "@/lib/forms/tree";
import { FormBlockTree } from "@/lib/forms/types";
import { client } from "@/lib/supabase/server";
import {
  FormBlock,
  FormBlockType,
  FormFieldDataSchema,
  FormFieldDefinition,
  FormFieldType,
  FormPage,
} from "@/types";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export interface FormClientFetchResponse {
  title: string;
  tree: FormBlockTree<ClientRenderBlock[]>;
  blocks: ClientRenderBlock[];
  fields: FormFieldDefinition[];
  lang: string;
  options: {
    is_powered_by_branding_enabled: boolean;
  };
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
  const id = context.params.id;

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

  const payload: FormClientFetchResponse = {
    title: title,
    tree: tree,
    blocks: render_blocks,
    fields: fields,
    lang: default_form_page_language,
    options: {
      is_powered_by_branding_enabled,
    },
  };

  return NextResponse.json({
    data: payload,
  });
}
