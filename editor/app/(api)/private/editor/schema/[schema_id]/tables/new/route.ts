import { createFormsClient } from "@/lib/supabase/server";
import type { FormInputType } from "@/grida-forms-hosted/types";
import {
  CreateNewSchemaTableRequest,
  CreateNewSchemaTableResponse,
  EditorApiResponse,
} from "@/types/private/api";
import assert from "assert";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

type Params = {
  schema_id: string;
};

type ResponsePayload = EditorApiResponse<CreateNewSchemaTableResponse>;

type Context = {
  params: Promise<Params>;
};

export async function POST(req: NextRequest, context: Context) {
  const data = (await req.json()) as Omit<
    CreateNewSchemaTableRequest,
    "schema_id"
  >;
  const { schema_id } = await context.params;
  assert(data.table_name, "table_name is required");

  const formsClient = await createFormsClient();

  const { data: schema_ref, error: schema_ref_err } = await formsClient
    .from("schema_document")
    .select()
    .eq("id", schema_id)
    .single();

  if (schema_ref_err) {
    console.error(
      "ERR: while fetching schema ref (might be caused by RLS change)",
      schema_ref_err
    );
    return notFound();
  }

  // TODO: shall be renamed to "table"
  const { data: new_table_ref, error: new_table_ref_err } = await formsClient
    .from("form")
    .insert({
      project_id: schema_ref.project_id,
      schema_id: schema_ref.id,
      // TODO: shall be renamed to "name"
      title: data.table_name,
      description: data.description,
    })
    .select("id")
    .single();

  if (new_table_ref_err) {
    console.error("ERR: while creating new schema table", new_table_ref_err);
    return NextResponse.error();
  }

  if (data.template) {
    let fields: Array<{
      type: FormInputType;
      name: string;
      label: string;
    }>;
    switch (data.template) {
      case "cms-starter": {
        // create fields
        // title, date, content
        fields = [
          {
            type: "text",
            name: "title",
            label: "Title",
          },
          {
            type: "date",
            name: "date",
            label: "Date",
          },
          {
            type: "richtext",
            name: "content",
            label: "Content",
          },
        ];
        break;
      }
      case "cms-blog-starter":
        // title, slug, date, cover, content, tags,
        fields = [
          {
            type: "text",
            name: "title",
            label: "Title",
          },
          {
            type: "text",
            name: "slug",
            label: "Slug",
          },
          {
            type: "date",
            name: "date",
            label: "Date",
          },
          {
            type: "image",
            name: "cover",
            label: "Cover",
          },
          {
            type: "richtext",
            name: "content",
            label: "Content",
          },
          {
            type: "toggle-group",
            name: "tags",
            label: "Tags",
          },
        ];
        break;
    }
    await formsClient.from("attribute").insert(
      fields.map((field) => ({
        form_id: new_table_ref.id,
        type: field.type,
        name: field.name,
        label: field.label,
      }))
    );
  }

  const { data: new_table_detail, error: new_table_detail_err } =
    await formsClient
      .from("form")
      .select(`*, attributes:attribute(*)`)
      .eq("id", new_table_ref.id)
      .single();

  if (new_table_detail_err) {
    console.error("ERR: while fetching new table detail", new_table_detail_err);
    return NextResponse.error();
  }

  //
  return NextResponse.json({
    data: {
      id: new_table_detail.id,
      // TODO: shall be renamed to "name"
      name: new_table_detail.title,
      description: new_table_detail.description,
      attributes: new_table_detail.attributes,
    },
  } satisfies ResponsePayload);
}
