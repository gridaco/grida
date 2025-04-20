import { GRIDA_FORMS_RESPONSE_BUCKET } from "@/k/env";
import { service_role } from "@/lib/supabase/server";
import { createXSupabaseClient } from "@/services/x-supabase";
import { FormFieldStorageSchema } from "@/types";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import assert from "assert";

type Params = { form_id: string; field_id: string };

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const { form_id, field_id } = await context.params;
  const qpath = req.nextUrl.searchParams.get("path");

  // passing the options will make image transform (even without empty options) - which will occur 403 on free plan tiers.
  // @see https://sweetcoding.tistory.com/257
  // const options = parseStorageUrlOptions(req.nextUrl.searchParams);

  assert(qpath);

  // TODO: support RLS
  const { data } = await service_role.forms
    .from("form")
    .select(
      `
        fields:attribute( id, storage ),
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

        const { data: singed } = client.storage
          .from(bucket)
          .getPublicUrl(qpath);

        const src = singed?.publicUrl;

        if (!src) {
          return notFound();
        }

        return NextResponse.json({ data: singed, error: null });
        //
      }
      case "grida":
      case "x-s3":
      default:
        return NextResponse.error();
    }
  }

  const { data: singed } = await service_role.forms.storage
    .from(GRIDA_FORMS_RESPONSE_BUCKET)
    .getPublicUrl(qpath);

  const src = singed?.publicUrl;

  if (!src) {
    return notFound();
  }

  return NextResponse.json({ data: singed, error: null });
}
