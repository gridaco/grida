import { service_role } from "../db";
import { GridaXSupabaseService } from "../services/x-supabase/index";
import type { FormReferenceSearchMetaResponse } from "@grida/forms";
import type { FormFieldReferenceSchema } from "@grida/forms";

import { notFound } from "../http";
import assert from "assert";
import { SupabasePostgRESTOpenApi } from "@grida/postgrest";

type Params = { session: string; field: string };

/**
 * [search/meta] This endpoint serves the meta information for the search action.
 * since we support db connection and search field on form can be a potential security risk,
 * this endpoint only provides the meta information of the search field, and how the actual query can be made.
 */
export async function GET(req: Request, params: Params) {
  const { session: session_id, field: field_id } = params;

  const { data, error: _error } = await service_role.forms
    .from("response_session")
    .select(
      `id, form:form( fields:attribute( id, name, reference ), supabase_connection:connection_supabase(*) )`
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
      field.reference as unknown as FormFieldReferenceSchema;

    switch (type) {
      case "x-supabase": {
        assert(supabase_connection, "No connection found");

        switch (schema) {
          case "auth": {
            assert(
              table === "users",
              `Unsupported table "${table}" on schena "${schema}"`
            );

            return Response.json({
              meta: {
                provider: "x-supabase",
                supabase_project_id: supabase_connection.supabase_project_id,
                schema_name: "auth",
                referenced_table: table,
                referenced_column: column,
              },
            } satisfies FormReferenceSearchMetaResponse);
          }
          case "public":
          default: {
            return Response.json({
              meta: {
                provider: "x-supabase",
                supabase_project_id: supabase_connection.supabase_project_id,
                schema_name: schema,
                referenced_table: table,
                referenced_column: column,
              },
            } satisfies FormReferenceSearchMetaResponse);
          }
        }
      }
      default: {
        return Response.json({ error: "internal error" }, { status: 500 });
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
          return Response.json({
            meta: {
              provider: "x-supabase",
              supabase_project_id: supabase_connection.supabase_project_id,
              schema_name: sb_schema_name, // forced to be within the same schema
              referenced_table: column.fk.referenced_table,
              referenced_column: column.fk.referenced_column,
            },
          } satisfies FormReferenceSearchMetaResponse);
        }
      }
    }

    return Response.json(
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
