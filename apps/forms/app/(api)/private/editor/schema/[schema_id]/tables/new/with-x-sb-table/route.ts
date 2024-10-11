import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";
import {
  createRouteHandlerClient,
  createRouteHandlerXSBClient,
} from "@/lib/supabase/server";
import { GridaXSupabase } from "@/types";
import {
  CreateNewSchemaTableWithXSBTableConnectionRequest,
  CreateNewSchemaTableWithXSBTableConnectionResponse,
} from "@/types/private/api";
import assert from "assert";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

type Context = {
  params: {
    schema_id: string;
  };
};

export async function POST(req: NextRequest, context: Context) {
  const cookieStore = cookies();
  const schema_id = context.params.schema_id;
  const supabase = createRouteHandlerClient(cookieStore);
  const grida_x_sb_client = createRouteHandlerXSBClient(cookieStore);

  const data: CreateNewSchemaTableWithXSBTableConnectionRequest =
    await req.json();

  console.log("CREATE NEW TABLE WITH XSB TABLE CONNECTION", {
    schema_id,
    data: data,
  });

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
  const { sb_schema_definitions, sb_schema_names, sb_schema_openapi_docs } =
    xsb_project_ref;

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

  // validate at least one attribute is connected (unless readonly pg view)
  assert(
    Object.keys(data.connect_attributes_as).length > 0,
    "at least one attribute should be connected"
  );

  // TODO: validate if at least one pk is connected
  // .....

  // validate attributes
  for (const [key, { type }] of Object.entries(data.connect_attributes_as)) {
    assert(
      tableschema.properties[key],
      `attribute "${key}" not found in the table schema`
    );
  }
  // #endregion validations

  // #region create

  // 1. prep x-sb main table
  // 2. create new table
  // 3. seed attributes
  // 4. create connection

  // #region prep x-sb main table
  // upsert the grida_x_supabase.supabase_table

  const { methods: sb_postgrest_methods } =
    SupabasePostgRESTOpenApi.parse_supabase_postgrest_table_path(
      (
        sb_schema_openapi_docs as any as {
          [schema: string]: SupabasePostgRESTOpenApi.SupabaseOpenAPIDocument;
        }
      )[data.sb_schema_name],
      data.sb_table_name
    );

  const { data: upserted_supabase_table, error: x_sb_table_err } =
    await grida_x_sb_client
      .from("supabase_table")
      .upsert(
        {
          supabase_project_id: xsb_project_ref.id,
          sb_table_name: data.sb_table_name,
          sb_schema_name: data.sb_schema_name,
          sb_table_schema: tableschema,
          sb_postgrest_methods: sb_postgrest_methods,
        },
        {
          onConflict: "supabase_project_id, sb_table_name, sb_schema_name",
        }
      )
      .select()
      .single();

  if (x_sb_table_err) {
    console.error("ERR: while upserting x-sb table", x_sb_table_err);
    return NextResponse.error();
  }

  // check if connection already exists for other table within the same schema_document
  const { count: conn_ref_count, error: conn_ref_error } = await supabase
    .from("connection_supabase")
    .select("id, schema:form!inner(schema_id)", { count: "exact" })
    .eq("main_supabase_table_id", upserted_supabase_table.id)
    .eq("supabase_project_id", xsb_project_ref.id)
    .eq("schema.schema_id", schema_id);

  if (conn_ref_error) {
    console.error("ERR: while validatting existing connection", conn_ref_error);
    return NextResponse.error();
  }

  assert(conn_ref_count === 0, "connection already exists for other table");

  // #endregion prep x-sb main table

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

  const { error: fields_init_err } = await supabase.from("form_field").insert(
    fields_init.map((field) => ({
      form_id: new_table_ref.id,
      type: field.type ?? "text",
      name: field.name,
    }))
  );

  if (fields_init_err) {
    console.error("ERR: while seeding attributes [IGNORED]", fields_init_err, {
      fields_init,
    });
  }

  // create connection

  const { data: conn, error: conn_err } = await supabase
    .from("connection_supabase")
    .upsert(
      {
        // TODO: shall be renamed to "table_id"
        form_id: new_table_ref.id,
        main_supabase_table_id: upserted_supabase_table.id,
        supabase_project_id: xsb_project_ref.id,
      },
      {
        onConflict: "form_id",
      }
    )
    .select()
    .single();

  if (conn_err) {
    console.error("ERR: while creating connection (IGNORED)", conn_err);
    // ignore. before we migrate the entire transaction via rpc, at this point, if it fails, we let it.
  }

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
      table: {
        id: new_table_detail.id,
        // TODO: shall be renamed to "name"
        name: new_table_detail.title,
        description: new_table_detail.description,
        attributes: new_table_detail.attributes,
      },
      connection: {
        sb_schema_name: upserted_supabase_table.sb_schema_name,
        sb_table_name: upserted_supabase_table.sb_table_name,
        sb_table_id: upserted_supabase_table.id,
        sb_postgrest_methods: upserted_supabase_table.sb_postgrest_methods,
        sb_table_schema: tableschema,
      },
    } satisfies CreateNewSchemaTableWithXSBTableConnectionResponse,
  });
}
