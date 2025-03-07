import { grida_forms_client } from "@/lib/supabase/server";
import { GridaXSupabaseService } from "@/services/x-supabase";
import { type FormFieldReferenceSchema, GridaXSupabase } from "@/types";
import { NextRequest, NextResponse } from "next/server";
import { notFound } from "next/navigation";
import assert from "assert";
import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";

type Params = { session: string; field: string };

/**
 * [search/meta] This endpoint serves the meta information for the search action.
 * since we support db connection and search field on form can be a potential security risk,
 * this endpoint only provides the meta information of the search field, and how the actual query can be made.
 */
export async function GET(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const { session: session_id, field: field_id } = await context.params;

  const { data, error } = await grida_forms_client
    .from("response_session")
    .select(
      `id, form:form( fields:attribute( id, name, reference ), supabase_connection:connection_supabase(*) )`
    )
    .eq("id", session_id)
    .single();

  if (!data) {
    console.error("session not found", session_id, error);
    return notFound();
  }

  const { supabase_connection, fields } = data.form!;

  const field = fields.find((field) => field.id === field_id);

  if (!field) {
    console.error("field not found", field_id);
    return notFound();
  }

  if (field.reference) {
    const { type, schema, table, column } =
      field.reference as any as FormFieldReferenceSchema;

    switch (type) {
      case "x-supabase": {
        assert(supabase_connection, "No connection found");

        switch (schema) {
          case "auth": {
            assert(
              table === "users",
              `Unsupported table "${table}" on schena "${schema}"`
            );

            return NextResponse.json({
              meta: {
                provider: "x-supabase",
                supabase_project_id: supabase_connection.supabase_project_id,
                schema_name: "auth",
                referenced_table: table,
                referenced_column: column,
              },
            } satisfies GridaXSupabase.Forms.XSBSearchMetaResult);
          }
          case "public":
          default: {
            return NextResponse.json({
              meta: {
                provider: "x-supabase",
                supabase_project_id: supabase_connection.supabase_project_id,
                schema_name: schema,
                referenced_table: table,
                referenced_column: column,
              },
            } satisfies GridaXSupabase.Forms.XSBSearchMetaResult);
          }
        }
      }
      default: {
        return NextResponse.error();
      }
    }
  } else {
    // if supabase connection is present (although reference not explicitly set - which is normal for known fks), we can tell the relation and return that.
    if (supabase_connection) {
      const xsupabase = new GridaXSupabaseService();
      const conn =
        await xsupabase.getXSBMainTableConnectionState(supabase_connection);
      assert(conn, "connection fetch failed");
      const {
        supabase_project: { sb_schema_definitions },
        main_supabase_table,
      } = conn;

      assert(main_supabase_table, "main supabase table not found");
      const { sb_schema_name, sb_table_name } = main_supabase_table;

      const schema_json = sb_schema_definitions[sb_schema_name][sb_table_name];
      assert(schema_json, "schema json not found");

      const definition =
        SupabasePostgRESTOpenApi.parse_supabase_postgrest_schema_definition(
          schema_json
        );

      if (field.name in definition.properties) {
        const column = definition.properties[field.name];
        if (column.fk) {
          return NextResponse.json({
            meta: {
              provider: "x-supabase",
              supabase_project_id: supabase_connection.supabase_project_id,
              schema_name: sb_schema_name, // forced to be within the same schema
              referenced_table: column.fk.referenced_table,
              referenced_column: column.fk.referenced_column,
            },
          } satisfies GridaXSupabase.Forms.XSBSearchMetaResult);
        }
      }
    }

    return NextResponse.json(
      {
        error: {
          message: "This field does not support search",
        },
      },
      {
        status: 400,
      }
    );
  }
}
