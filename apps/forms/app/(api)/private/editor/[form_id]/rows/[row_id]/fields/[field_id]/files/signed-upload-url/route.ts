import { NextRequest, NextResponse } from "next/server";
import { CreateSignedUploadUrlRequest } from "@/types/private/api";
import { cookies } from "next/headers";
import { createRouteHandlerFormsClient } from "@/supabase/server";
import { notFound } from "next/navigation";
import { FieldStorageService } from "@/services/form/storage";
import type { FormFieldStorageSchema } from "@/types";
import assert from "assert";

type Context = {
  params: {
    form_id: string;
    row_id: string;
    field_id: string;
  };
};

export function POST(req: NextRequest, context: Context) {
  return handler(req, context, {
    upsert: false,
  });
}

export function PUT(req: NextRequest, context: Context) {
  return handler(req, context, {
    upsert: true,
  });
}

async function handler(
  req: NextRequest,
  context: Context,
  options?: { upsert: boolean }
) {
  const body = (await req.json()) as CreateSignedUploadUrlRequest;

  const { file } = body;

  const { form_id, row_id, field_id } = context.params;

  const cookieStore = cookies();
  const supabase = createRouteHandlerFormsClient(cookieStore);

  const { data: form, error: formerr } = await supabase
    .from("form")
    .select(
      `
        *,
        fields:form_field( id, storage ),
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
    field.storage as FormFieldStorageSchema,
    form.supabase_connection
  );

  const res = await fs.createSignedUploadUrlFromFile(row_id, file, options);

  return NextResponse.json(res);
}
