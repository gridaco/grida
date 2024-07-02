import { NextRequest, NextResponse } from "next/server";
import { CreateSignedUploadUrlRequest } from "@/types/private/api";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { FieldStorageService } from "@/services/form/storage";
import type { FormFieldStorageSchema } from "@/types";

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
  const supabase = createRouteHandlerClient(cookieStore);

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
    .single();

  if (formerr) console.error(formerr);
  if (!form) return notFound();

  const field = form.fields.find((f) => f.id === field_id);
  if (!field) return notFound();

  const fs = new FieldStorageService(
    field.storage as FormFieldStorageSchema,
    form.supabase_connection
  );

  const res = fs.createSignedUploadUrlFromFile(
    file,
    // TODO: provide context
    {},
    options
  );

  return NextResponse.json(res);
}
