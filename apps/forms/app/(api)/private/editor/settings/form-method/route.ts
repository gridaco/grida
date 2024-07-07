import { createRouteHandlerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import type { FormMethod } from "@/types";

export const revalidate = 0;

export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const formdata = await req.formData();

  const cookieStore = cookies();

  const form_id = String(formdata.get("form_id"));

  const __raw_method = formdata.get("method");
  const method = __raw_method
    ? (String(__raw_method) as FormMethod)
    : undefined;

  if (!form_id) {
    return notFound();
  }

  const supabase = createRouteHandlerClient(cookieStore);

  await supabase
    .from("form")
    .update({
      method: method,
    })
    .eq("id", form_id)
    .single();

  // redirect to the page requested
  return NextResponse.redirect(origin + `/d/${form_id}/settings/security`, {
    status: 301,
  });
}
