import { createRouteHandlerClient } from "@/lib/supabase/server";
import { createSignedUpsertUploadUrl } from "@/services/form/storage";
import { ConnectionSupabaseJoint, FormFieldDefinition } from "@/types";
import type {
  CreateSignedUploadUrlUpsertRequest,
  FormsApiResponse,
  SignedUploadUrlData,
} from "@/types/private/api";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

type Context = {
  params: {
    form_id: string;
    field_id: string;
  };
};

export async function PUT(req: NextRequest, context: Context) {
  const { form_id, field_id } = context.params;

  const body = (await req.json()) as CreateSignedUploadUrlUpsertRequest;

  const { path } = body;

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

  const { data, error } = await createSignedUpsertUploadUrl({
    field_id,
    path,
    form: form satisfies {
      fields: Pick<FormFieldDefinition, "id" | "storage">[];
      supabase_connection: ConnectionSupabaseJoint | null;
    } as any,
  });

  return NextResponse.json(<FormsApiResponse<SignedUploadUrlData>>{
    data: data,
    error: error,
  });
}
