import { blockstree } from "@/lib/forms/tree";
import { FormBlockTree } from "@/lib/forms/types";
import { client, createRouteHandlerClient } from "@/lib/supabase/server";
import {
  FormBlock,
  FormBlockType,
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
}

export type ClientRenderBlock =
  | ClientFieldRenderBlock
  | ClientSectionRenderBlock;

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
  };
}
interface ClientSectionRenderBlock extends BaseRenderBlock {
  type: "section";
  children?: ClientRenderBlock[];
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

  const { title, default_page, fields } = data;

  const page_blocks = (data.default_page as unknown as FormPage).blocks;

  // @ts-ignore
  let render_blocks: ClientRenderBlock[] = page_blocks
    ?.map((block: any) => {
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
          field: field,
          local_index: block.local_index,
          parent_id: block.parent_id,
        };
      }

      return <BaseRenderBlock>{
        id: block.id,
        type: block.type,
        local_index: block.local_index,
        parent_id: block.parent_id,
      };
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
  };

  return NextResponse.json({
    data: payload,
  });
}
