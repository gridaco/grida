import { grida_forms_client } from "@/lib/supabase/server";
import {
  GridaXSupabaseService,
  createXSupabaseClient,
} from "@/services/x-supabase";
import { FormFieldReferenceSchema, GridaXSupabase } from "@/types";
import assert from "assert";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

//
// TODO: consider dropping the `reference` field from the field schema - on x-sb, it's not needed
//
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
  const _q_perPage = req.nextUrl.searchParams.get("perPage");
  const perPage = _q_perPage ? parseInt(_q_perPage) : 50;

  // FIXME: Strict Authorization - this route accesses auth.users
  // TODO: get session from cookies to strictly match the authorization
  // 0. user must configure protection layer for their form (e.g. password protection)
  // 1. check if session is expired
  // 2. check if session signature matches

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

        const x_client = await createXSupabaseClient(
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
            const { data, error } = await x_client.auth.admin.listUsers({
              page: page,
              perPage: perPage,
            });

            if (error || !data) {
              console.error("search/err::user", error);
              return NextResponse.error();
            }

            return NextResponse.json({
              meta: {
                schema_name: schema as string,
                table_name: table,
                table_schema: GridaXSupabase.SupabaseUserJsonSchema as any,
                column: column,
              },
              data: data.users,
              count: data.total,
              // always ok - for xsb auth
              error: null,
              status: 200,
              statusText: "OK",
            } satisfies GridaXSupabase.XSBSearchResult<
              any,
              {
                column: string;
              }
            >);
          }
          case "public":
          default: {
            const r1 = (page - 1) * perPage;
            const r2 = r1 + perPage;

            const res = await x_client.from(table).select().range(r1, r2);

            return NextResponse.json({
              ...res,
              meta: {
                schema_name: schema,
                table_name: table,
                column: column,
                table_schema: sb_schema_definitions[schema][table],
              },
            } satisfies GridaXSupabase.XSBSearchResult<
              any,
              {
                column: string;
              }
            >);

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
