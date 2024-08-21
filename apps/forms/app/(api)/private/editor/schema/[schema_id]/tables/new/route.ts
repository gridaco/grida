import { createRouteHandlerClient } from "@/lib/supabase/server";
import {
  CreateNewSchemaTableRequest,
  CreateNewSchemaTableResponse,
  EditorApiResponse,
} from "@/types/private/api";
import assert from "assert";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

type ResponsePayload = EditorApiResponse<CreateNewSchemaTableResponse>;

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const data = (await req.json()) as CreateNewSchemaTableRequest;

  assert(data.schema_id, "schema_id is required");
  assert(data.table_name, "table_name is required");

  const supabase = createRouteHandlerClient(cookieStore);

  const { data: schema_ref, error: schema_ref_err } = await supabase
    .from("schema_document")
    .select()
    .eq("id", data.schema_id)
    .single();

  if (schema_ref_err) {
    console.error(
      "ERR: while fetching schema ref (might be caused by RLS change)",
      schema_ref_err
    );
    return notFound();
  }

  // TODO: shall be renamed to "table"
  const { data: new_table_ref, error: new_table_ref_err } = await supabase
    .from("form")
    .insert({
      project_id: schema_ref.project_id,
      schema_id: schema_ref.id,
      // TODO: shall be renamed to "name"
      title: data.table_name,
      description: data.description,
    })
    .select()
    .single();

  if (new_table_ref_err) {
    console.error("ERR: while creating new schema table", new_table_ref_err);
    return NextResponse.error();
  }

  //
  return NextResponse.json({
    data: {
      id: new_table_ref.id,
      // TODO: shall be renamed to "name"
      name: new_table_ref.title,
      description: new_table_ref.description,
    },
  } satisfies ResponsePayload);
}
