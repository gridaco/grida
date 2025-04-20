import { editorlink } from "@/lib/forms/url";
import { type NextRequest, NextResponse } from "next/server";
import type { GDocEditorRouteParams } from "@/scaffolds/editor/state";
import { notFound } from "next/navigation";
import { createFormsClient } from "@/lib/supabase/server";

export const revalidate = 0;

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<GDocEditorRouteParams>;
  }
) {
  const { id, org, proj } = await context.params;
  const origin = request.nextUrl.origin;

  const formsClient = await createFormsClient();

  const { data: formdoc } = await formsClient
    .from("form_document")
    .select("form_id")
    .eq("id", id)
    .single();

  if (!formdoc) {
    return notFound();
  }

  const { data: connection } = await formsClient
    .from("connection_commerce_store")
    .select()
    .eq("form_id", formdoc.form_id)
    .single();

  if (!connection) {
    return NextResponse.redirect(
      editorlink("connect/store/get-started", {
        org,
        proj,
        origin,
        document_id: id,
      }),
      {
        status: 307,
      }
    );
  }

  return NextResponse.redirect(
    editorlink("connect/store/products", {
      org,
      proj,
      origin,
      document_id: id,
    }),
    {
      status: 302,
    }
  );
}
