import { GRIDA_FORMS_RESPONSE_BUCKET } from "@/k/env";
import { createFormsClient, service_role } from "@/lib/supabase/server";
import { isResponseFieldStorageObjectPath } from "@/services/form/storage";
import { createXSupabaseClient } from "@/services/x-supabase";
import type { FormFieldStorageSchema } from "@/grida-forms-hosted/types";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import assert from "assert";

type Params = { form_id: string; field_id: string };
const cacheHeaders = { "Cache-Control": "private, no-store" };

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const { form_id, field_id } = await context.params;
  const qpath = req.nextUrl.searchParams.get("path");

  // Keep original-object URLs here. parseStorageUrlOptions always supplies
  // `transform`, which selects the image-rendering endpoint even when empty.
  // Hosted image transformations require Pro or above.
  // @see https://supabase.com/docs/guides/storage/serving/image-transformations

  if (!qpath) return notFound();

  // Authorize the form through RLS before accessing privileged storage.
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
    .single();

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

        const { data } = client.storage.from(bucket).getPublicUrl(qpath);

        const src = data?.publicUrl;

        if (!src) {
          return notFound();
        }

        return NextResponse.json(
          { data, error: null },
          { headers: cacheHeaders }
        );
      }
      case "grida":
      case "x-s3":
      default:
        return NextResponse.error();
    }
  }

  // The managed bucket is shared by every project.
  if (!isResponseFieldStorageObjectPath(qpath, field.id)) {
    return notFound();
  }

  const { data } = service_role.forms.storage
    .from(GRIDA_FORMS_RESPONSE_BUCKET)
    .getPublicUrl(qpath);

  const src = data?.publicUrl;

  if (!src) {
    return notFound();
  }

  return NextResponse.json({ data, error: null }, { headers: cacheHeaders });
}
