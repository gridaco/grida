import { editorlink } from "@/lib/forms/url";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { GDocEditorRouteParams } from "@/scaffolds/editor/state";
import { notFound } from "next/navigation";

export const revalidate = 0;

export async function GET(
  request: NextRequest,
  context: {
    params: GDocEditorRouteParams;
  }
) {
  const { id, org, proj } = context.params;
  const origin = request.nextUrl.origin;
  const cookieStore = cookies();

  const supabase = createRouteHandlerClient(cookieStore);

  const { data: formdoc } = await supabase
    .from("form_document")
    .select("form_id")
    .eq("id", id)
    .single();

  if (!formdoc) {
    return notFound();
  }

  const { data: connection } = await supabase
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
