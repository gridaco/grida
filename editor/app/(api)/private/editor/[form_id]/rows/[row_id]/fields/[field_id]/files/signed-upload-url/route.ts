import { NextRequest, NextResponse } from "next/server";
import { CreateSignedUploadUrlRequest } from "@/types/private/api";
import { createFormsClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { FieldStorageService } from "@/services/form/storage";
import type { FormFieldStorageSchema } from "@/grida-forms-hosted/types";
import assert from "assert";

type Params = {
  form_id: string;
  row_id: string;
  field_id: string;
};

export async function POST(
  req: NextRequest,
  segmentData: {
    params: Promise<Params>;
  }
) {
  return handler(req, await segmentData.params, {
    upsert: false,
  });
}

export async function PUT(
  req: NextRequest,
  segmentData: {
    params: Promise<Params>;
  }
) {
  return handler(req, await segmentData.params, {
    upsert: true,
  });
}

async function handler(
  req: NextRequest,
  params: Params,
  options?: { upsert: boolean }
) {
  const body = (await req.json()) as CreateSignedUploadUrlRequest;

  const { file } = body;

  const { form_id, row_id, field_id } = params;

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
    .filter("fields.id", "eq", field_id)
    .single();

  if (formerr) console.error(formerr);
  if (!form) return notFound();

  const { fields } = form;

  assert(fields.length === 1);
  const field = fields[0];
  assert(field);

  const fs = new FieldStorageService(
    field.id,
    field.storage as unknown as FormFieldStorageSchema,
    form.supabase_connection
  );

  const res = await fs.createSignedUploadUrlFromFile(row_id, file, options);

  return NextResponse.json(res);
}
