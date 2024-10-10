import { grida_forms_client } from "@/lib/supabase/server";
import { GridaXSupabaseService } from "@/services/x-supabase";
import { type FormFieldReferenceSchema, GridaXSupabase } from "@/types";
import { NextRequest, NextResponse } from "next/server";
import { notFound } from "next/navigation";
import assert from "assert";

/**
 * [search/meta] This endpoint serves the meta information for the search action.
 * since we support db connection and search field on form can be a potential security risk,
 * this endpoint only provides the meta information of the search field, and how the actual query can be made.
 */
export async function GET(
  req: NextRequest,
  context: {
    params: {
      session: string;
      field: string;
    };
  }
) {
  const { session: session_id, field: field_id } = context.params;

  const { data, error } = await grida_forms_client
    .from("response_session")
    .select(
      `id, form:form( fields:attribute( id, reference ), supabase_connection:connection_supabase(*) )`
    )
    .eq("id", session_id)
    .single();

  if (!data) {
    return notFound();
  }

  const { supabase_connection, fields } = data.form!;

  const field = fields.find((field) => field.id === field_id);

  if (!field) {
    return notFound();
  }

  if (field.reference) {
    const { type, schema, table, column } =
      field.reference as any as FormFieldReferenceSchema;

    switch (type) {
      case "x-supabase": {
        assert(supabase_connection, "No connection found");

        const xsupabase = new GridaXSupabaseService();
        const conn =
          await xsupabase.getXSBMainTableConnectionState(supabase_connection);
        assert(conn, "connection fetch failed");
        const {
          supabase_project: { sb_schema_definitions },
        } = conn;

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
                schema_name: schema as string,
                table_name: table,
                table_schema: GridaXSupabase.SupabaseUserJsonSchema as any,
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
                table_name: table,
                table_schema: sb_schema_definitions[schema][table],
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
