import { GRIDA_FORMS_RESPONSE_BUCKET } from "@/k/env";
import { createFormsClient, service_role } from "@/lib/supabase/server";
import {
  isResponseFieldStorageObjectPath,
  parseStorageUrlOptions,
} from "@/services/form/storage";
import { createXSupabaseClient } from "@/services/x-supabase";
import type { FormFieldStorageSchema } from "@/grida-forms-hosted/types";
import assert from "assert";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

const expiresIn = 60 * 60;

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

  // GRIDA-SEC-016 — resolve the form as the caller. RLS limits it to members of
  // the owning project; the storage access below runs with the service role.
  const formsClient = await createFormsClient();
  const { data: form, error: formerr } = await formsClient
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
    .maybeSingle();

  if (formerr) console.error(formerr);
  if (!form) return notFound();

  const { fields, supabase_connection } = form;
  const field = fields.find((f) => f.id === field_id);
  if (!field) return notFound();

  if (field.storage) {
    const { type, bucket } = field.storage as unknown as FormFieldStorageSchema;
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

  // GRIDA-SEC-016 — the response bucket is shared by every organization.
  if (!isResponseFieldStorageObjectPath(qpath, field.id)) {
    return notFound();
  }

  const { data: singed } = await service_role.forms.storage
    .from(GRIDA_FORMS_RESPONSE_BUCKET)
    .createSignedUrl(qpath, expiresIn, options);
  const src = singed?.signedUrl;

  if (!src) {
    return notFound();
  }

  return NextResponse.redirect(src, {
    status: 302,
    headers: {
      // GRIDA-SEC-016 — authorized per caller; shared caches must not reuse it.
      "Cache-Control": `private, max-age=${expiresIn}`,
    },
  });
}
