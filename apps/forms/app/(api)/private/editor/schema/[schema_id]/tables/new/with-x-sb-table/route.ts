import {
  createRouteHandlerClient,
  createRouteHandlerXSBClient,
} from "@/lib/supabase/server";
import { FormInputType, GridaXSupabase } from "@/types";
import assert from "assert";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

type Context = {
  params: {
    schema_id: string;
  };
};

interface CreateNewSchemaTableWithXSBTableConnectionRequest {
  sb_schema_name: string;
  sb_table_name: string;
  connect_attributes_as: {
    [key: string]: {
      type: FormInputType;
    };
  };
}

export async function POST(req: NextRequest, context: Context) {
  const cookieStore = cookies();
  const schema_id = context.params.schema_id;
  const supabase = createRouteHandlerClient(cookieStore);
  const grida_x_sb_client = createRouteHandlerXSBClient(cookieStore);

  const data: CreateNewSchemaTableWithXSBTableConnectionRequest =
    await req.json();

  const { data: schema_ref, error: schema_ref_err } = await supabase
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

  // #region validations
  // check if supabase connection is established
  const { data: xsb_project_ref } = await grida_x_sb_client
    .from("supabase_project")
    .select()
    .eq("project_id", schema_ref.project_id)
    .single();

  assert(xsb_project_ref, "supabase project not found for the project");
  const { sb_schema_definitions, sb_schema_names } = xsb_project_ref;

  // validate target schema name is registered
  assert(
    sb_schema_names.includes(data.sb_schema_name),
    "schema name is not registered in the project"
  );

  // validate table & table attributes
  const tableschema = (
    sb_schema_definitions as {
      [schema: string]: GridaXSupabase.TableSchemaDefinitions;
    }
  )[data.sb_schema_name][data.sb_table_name];

  assert(tableschema, "table not found in the schema");

  // validate attributes (if exists)
  for (const [key, { type }] of Object.entries(data.connect_attributes_as)) {
    assert(tableschema[key], `attribute ${key} not found in the table schema`);
  }
  // #endregion validations

  // #region create

  // 1. create new table
  // 2. seed attributes
  // 3. connect x-sb main table

  // TODO: shall be renamed to "table"
  const { data: new_table_ref, error: new_table_ref_err } = await supabase
    .from("form")
    .insert({
      project_id: schema_ref.project_id,
      schema_id: schema_ref.id,
      // TODO: shall be renamed to "name"
      title: data.sb_table_name,
    })
    .select("id")
    .single();

  if (new_table_ref_err) {
    console.error("ERR: while creating new schema table", new_table_ref_err);
    return NextResponse.error();
  }

  // seed attributes

  const fields_init = Object.entries(data.connect_attributes_as).map(
    ([name, { type }]) => ({
      name,
      type,
    })
  );

  await supabase.from("form_field").insert(
    fields_init.map((field) => ({
      form_id: new_table_ref.id,
      type: field.type,
      name: field.name,
    }))
  );

  // connect x-sb main table
  // TODO:

  // get final
  const { data: new_table_detail, error: new_table_detail_err } = await supabase
    .from("form")
    .select(`*, attributes:form_field(*)`)
    .eq("id", new_table_ref.id)
    .single();

  if (new_table_detail_err) {
    console.error("ERR: while fetching new table detail", new_table_detail_err);
    return NextResponse.error();
  }

  return NextResponse.json({
    data: {
      // TODO:
      ...new_table_detail,
    },
  });
}
