import { createRouteHandlerClient } from "@/lib/supabase/server";
import { createSignedUploadUrl } from "@/services/form/storage";
import { ConnectionSupabaseJoint, FormFieldDefinition } from "@/types";
import type {
  FormsApiResponse,
  SignedUploadUrlData,
} from "@/types/private/api";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import assert from "assert";

type Context = {
  params: {
    form_id: string;
    field_id: string;
  };
};

export async function POST(req: NextRequest, context: Context) {
  const { form_id, field_id } = context.params;

  const path = queryorbody("path", {
    searchParams: req.nextUrl.searchParams,
    body: await req.json(),
  });

  assert(path);

  const { data, error } = await sign({
    form_id,
    field_id,
    path,
    options: {
      upsert: false,
    },
  });

  return NextResponse.json(<FormsApiResponse<SignedUploadUrlData>>{
    data: data,
    error: error,
  });
}

export async function PUT(req: NextRequest, context: Context) {
  const { form_id, field_id } = context.params;

  const path = queryorbody("path", {
    searchParams: req.nextUrl.searchParams,
    body: await req.json(),
  });

  assert(path);

  const { data, error } = await sign({
    form_id,
    field_id,
    path,
    options: {
      upsert: true,
    },
  });

  return NextResponse.json(<FormsApiResponse<SignedUploadUrlData>>{
    data: data,
    error: error,
  });
}

function queryorbody(
  key: string,
  b: {
    searchParams: URLSearchParams;
    body: any;
  }
) {
  return b.searchParams.get(key) || b.body?.[key];
}

async function sign({
  form_id,
  field_id,
  path,
  options,
}: {
  form_id: string;
  field_id: string;
  path: string;
  options?: {
    upsert: boolean;
  };
}) {
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

  return await createSignedUploadUrl({
    field_id,
    file: { path },
    form: form satisfies {
      fields: Pick<FormFieldDefinition, "id" | "storage">[];
      supabase_connection: ConnectionSupabaseJoint | null;
    } as any,
    options: options,
  });
}
