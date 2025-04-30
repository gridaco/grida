import { createFormsClient } from "@/lib/supabase/server";
import type { FormFieldStorageSchema } from "@/types";
import type {
  FormsApiResponse,
  SignedUploadUrlData,
} from "@/types/private/api";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { queryorbody } from "@/utils/qs";
import { FieldStorageService } from "@/services/form/storage";
import assert from "assert";

type Params = { form_id: string; field_id: string };

export async function PUT(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const { form_id, field_id } = await context.params;

  let body = {};
  try {
    body = await req.json();
  } catch (e) {
    // when body is empty and only query params are present (this is ok.)
  }

  const path = queryorbody("path", {
    searchParams: req.nextUrl.searchParams,
    body: body,
  });

  assert(path);

  const formsClient = await createFormsClient();

  const { data: form, error: formerr } = await formsClient
    .from("form")
    .select(
      `
        *,
        fields:attribute( id, storage ),
        supabase_connection:connection_supabase(*)
      `
    )
    .eq("id", form_id)
    .single();

  if (formerr) console.error(formerr);
  if (!form) return notFound();

  const field = form.fields.find((f) => f.id === field_id);
  if (!field) return notFound();

  const fs = new FieldStorageService(
    field.id,
    field.storage as FormFieldStorageSchema,
    form.supabase_connection
  );
  const { data, error } = await fs.createSignedUpsertUrlFromPath(path);

  return NextResponse.json(<FormsApiResponse<SignedUploadUrlData>>{
    data: data,
    error: error,
  });
}
