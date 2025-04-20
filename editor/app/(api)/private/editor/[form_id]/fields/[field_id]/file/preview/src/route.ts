import { GRIDA_FORMS_RESPONSE_BUCKET } from "@/k/env";
import { _sr_grida_forms_client } from "@/lib/supabase/server";
import { parseStorageUrlOptions } from "@/services/form/storage";
import { createXSupabaseClient } from "@/services/x-supabase";
import { FormFieldStorageSchema } from "@/types";
import assert from "assert";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

const expiresIn = 60 * 60;

export const revalidate = expiresIn;

type Params = { form_id: string; field_id: string };

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const { form_id, field_id } = await context.params;

  const qpath = req.nextUrl.searchParams.get("path");
  const options = parseStorageUrlOptions(req.nextUrl.searchParams);

  assert(qpath);

  // TODO: support RLS
  const { data } = await _sr_grida_forms_client
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

        // check if bucket is public
        const { data: bucket_ref, error: bucket_ref_err } =
          await client.storage.getBucket(bucket);

        if (bucket_ref_err || !bucket_ref) {
          return notFound();
        }

        if (bucket_ref.public) {
          // use public url when possible (this can utilize caching from supabase cdn)
          const { publicUrl: src } = client.storage
            .from(bucket)
            .getPublicUrl(qpath, options).data;
          return NextResponse.redirect(src);
        } else {
          const { data: singed } = await client.storage
            .from(bucket)
            .createSignedUrl(qpath, expiresIn, options);

          const src = singed?.signedUrl;

          if (!src) {
            return notFound();
          }
          return NextResponse.redirect(src);
        }

        //
      }
      case "grida":
      case "x-s3":
      default:
        return NextResponse.error();
    }
  }

  const { data: singed } = await _sr_grida_forms_client.storage
    .from(GRIDA_FORMS_RESPONSE_BUCKET)
    .createSignedUrl(qpath, expiresIn, options);
  const src = singed?.signedUrl;

  if (!src) {
    return notFound();
  }

  return NextResponse.redirect(src, {
    status: 302,
    headers: {
      "Cache-Control": `public, max-age=${expiresIn}, s-maxage=${expiresIn}`,
    },
  });
}
