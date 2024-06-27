import { GRIDA_FORMS_RESPONSE_BUCKET } from "@/k/env";
import { client, createRouteHandlerClient } from "@/lib/supabase/server";
import { createXSupabaseClient } from "@/services/x-supabase";
import { FormFieldStorageSchema } from "@/types";
import assert from "assert";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  context: {
    params: {
      form_id: string;
      field_id: string;
    };
  }
) {
  const { form_id, field_id } = context.params;
  const qpath = req.nextUrl.searchParams.get("path");
  const qwidth = req.nextUrl.searchParams.get("width");
  const width = Number(qwidth) || undefined;
  const qdownload = req.nextUrl.searchParams.get("download");
  const download = qdownload === "true" || qdownload === "1";
  const format = download ? "origin" : undefined;
  const expiresIn = 60 * 60;
  const options = {
    download: download,
    format: format,
    transform: {
      width: width,
      resize: width ? ("contain" as const) : undefined,
    },
  };
  // TODO: support RLS
  // const cookieStore = cookies();
  // const supabase = createRouteHandlerClient(cookieStore);
  const supabase = client;

  assert(qpath);

  // const { data: field } = await supabase.from('form_field').select('*').eq('id', field_id).eq('form_id', form_id).single();
  // if (!field) return notFound();

  const { data } = await supabase
    .from("form")
    .select(
      `
        fields:form_field( id, storage ),
        supabase_connection:connection_supabase(
          *
        )
        `
    )
    .eq("id", form_id)
    .filter("fields.id", "eq", field_id)
    .single();

  if (!data) {
    return notFound();
  }

  const { fields, supabase_connection } = data;
  assert(fields.length === 1);
  const field = fields[0];
  assert(field);

  if (field.storage) {
    const { type, bucket } = field.storage as any as FormFieldStorageSchema;
    switch (type) {
      case "x-supabase": {
        assert(supabase_connection);
        const client = await createXSupabaseClient(
          supabase_connection.supabase_project_id,
          {
            service_role: true,
          }
        );
        const { data: singed } = await client.storage
          .from(bucket)
          .createSignedUrl(qpath, expiresIn, options);

        const src = singed?.signedUrl;

        if (!src) {
          return notFound();
        }

        return NextResponse.redirect(src);
        //
      }
      case "grida":
      case "x-s3":
      default:
        return NextResponse.error();
    }
  }

  const { data: singed } = await supabase.storage
    .from(GRIDA_FORMS_RESPONSE_BUCKET)
    .createSignedUrl(qpath, expiresIn, options);
  const src = singed?.signedUrl;

  if (!src) {
    return notFound();
  }

  return NextResponse.redirect(src);
}
