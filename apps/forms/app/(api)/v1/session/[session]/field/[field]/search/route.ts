import { client } from "@/lib/supabase/server";
import { createXSupabaseClient } from "@/services/x-supabase";
import { FormFieldReferenceSchema } from "@/types";
import assert from "assert";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

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

  // TODO: Strict Authorization

  const { data, error } = await client
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
        console.log("schema", schema);
        assert(supabase_connection, "No connection found");

        const client = await createXSupabaseClient(
          supabase_connection?.supabase_project_id,
          {
            service_role: true,
          }
        );

        switch (schema) {
          case "auth": {
            assert(
              table === "users",
              `Unsupported table "${table}" on schena "${schema}"`
            );
            const { data } = await client.auth.admin.listUsers({
              page: page,
            });

            return NextResponse.json({
              data: {
                schema: schema,
                table: table,
                column: column,
                ...data,
              },
            });
          }
          case "public": {
            break;
          }
          default: {
            throw new Error(`Unsupported schema: ${schema}`);
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
