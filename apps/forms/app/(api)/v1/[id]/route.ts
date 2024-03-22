import { client, createRouteHandlerClient } from "@/lib/supabase/server";
import { FormFieldType } from "@/types";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

interface DBBlock {
  id: string;
  data: any;
  form_id: string;
  parent_id?: string | null;
  created_at: string;
  local_index: number;
  form_field_id: string | null;
}

export interface FormClientFetchResponse {
  title: string;
  blocks: ClientRenderBlock[];
  //
}

export type ClientRenderBlock =
  | ClientFieldRenderBlock
  | ClientSectionRenderBlock;
interface ClientFieldRenderBlock {
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
interface ClientSectionRenderBlock {
  type: "section";
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
        blocks:form_block(*)
      `
    )
    .eq("id", id)
    .single();

  error && console.error(id, error);

  if (!data) {
    return notFound();
  }

  const { title, blocks, fields } = data;

  // @ts-ignore
  let render_blocks: ClientRenderBlock[] = blocks
    .sort((a: DBBlock, b: DBBlock) => a.local_index - b.local_index)
    ?.map((block: any) => {
      const is_field = block.type === "field";
      const field = is_field
        ? fields.find((f: any) => f.id === block.form_field_id) ?? null
        : null;

      if (is_field) {
        // assert fiel to be not null
        if (!field) {
          return null; // filter this out
        }
        return {
          type: "field",
          field: field,
        };
      }

      return {
        type: "section",
      };
    })
    .filter(Boolean);
  // if no blocks, render a simple form based on fields
  if (!render_blocks.length) {
    render_blocks = fields.map((field: any) => {
      return {
        type: "field",
        field: {
          id: field.id,
          type: field.type,
          name: field.name,
        },
      };
    });
  }

  const payload: FormClientFetchResponse = {
    title: title,
    blocks: render_blocks,
  };

  return NextResponse.json({
    data: payload,
  });
}
