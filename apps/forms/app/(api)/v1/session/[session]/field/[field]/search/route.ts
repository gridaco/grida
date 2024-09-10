import { grida_forms_service_client } from "@/supabase/server";
import {
  GridaXSupabaseService,
  createXSupabaseClient,
} from "@/services/x-supabase";
import { FormFieldReferenceSchema, GridaXSupabase } from "@/types";
import assert from "assert";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

type SearchRes = {
  schema_name: string;
  table_name: string;
  table_schema: GridaXSupabase.SupabaseTable["sb_table_schema"];
  column: string;
  rows: Record<string, any>[];
};

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

  const _q_page = req.nextUrl.searchParams.get("page");
  const page = _q_page ? parseInt(_q_page) : 1;
  const _q_per_page = req.nextUrl.searchParams.get("per_page");
  const per_page = _q_per_page ? parseInt(_q_per_page) : 50;

  // FIXME: Strict Authorization - this route accesses auth.users

  const { data, error } = await grida_forms_service_client
    .from("response_session")
    .select(
      `id, form:form( fields:form_field( id, reference ), supabase_connection:connection_supabase(*) )`
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

        const client = await createXSupabaseClient(
          supabase_connection?.supabase_project_id,
          {
            service_role: true,
            db: {
              schema: schema,
            },
          }
        );

        switch (schema) {
          case "auth": {
            assert(
              table === "users",
              `Unsupported table "${table}" on schena "${schema}"`
            );
            const { data, error } = await client.auth.admin.listUsers({
              page: page,
              perPage: per_page,
            });

            if (error || !data) {
              console.error("search/err::user", error);
              return NextResponse.error();
            }

            return NextResponse.json({
              data: {
                schema_name: schema as string,
                table_name: table,
                table_schema: GridaXSupabase.SupabaseUserJsonSchema as any,
                column: column,
                rows: data.users,
              } satisfies SearchRes,
            });
          }
          case "public":
          default: {
            const r1 = (page - 1) * per_page;
            const r2 = r1 + per_page;

            const { data, error } = await client
              .from(table)
              .select()
              .range(r1, r2);

            if (error || !data) {
              console.error("search/err::table", error);
              return NextResponse.error();
            }

            return NextResponse.json({
              data: {
                schema_name: schema,
                table_name: table,
                column: column,
                table_schema: sb_schema_definitions[schema][table],
                rows: data,
              } satisfies SearchRes,
            });

            break;
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

  return NextResponse.json({});
}
