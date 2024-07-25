import { editorlink } from "@/lib/forms/url";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

export async function GET(
  request: NextRequest,
  context: {
    params: {
      org: string;
      proj: string;
      id: string;
    };
  }
) {
  const form_id = context.params.id;
  const { org, proj } = context.params;
  const origin = request.nextUrl.origin;
  const cookieStore = cookies();

  const supabase = createRouteHandlerClient(cookieStore);

  const { data: connection } = await supabase
    .from("connection_commerce_store")
    .select()
    .eq("form_id", form_id)
    .single();

  if (!connection) {
    return NextResponse.redirect(
      editorlink("connect/store/get-started", {
        org,
        proj,
        origin,
        form_id,
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
      form_id,
    }),
    {
      status: 302,
    }
  );
}
