import { createRouteHandlerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const formdata = await req.formData();

  const cookieStore = cookies();

  const form_id = String(formdata.get("form_id"));

  const __raw_is_force_closed = formdata.get("is_force_closed");
  const is_force_closed = String(__raw_is_force_closed) === "on";

  console.log("POST /private/editor/settings/force-close-form", {
    form_id,
    is_force_closed: is_force_closed,
  });

  if (!form_id) {
    return notFound();
  }

  const supabase = createRouteHandlerClient(cookieStore);

  await supabase
    .from("form")
    .update({
      is_force_closed: is_force_closed,
    })
    .eq("id", form_id)
    .single();

  // redirect to the page requested
  return NextResponse.redirect(
    origin + `/d/${form_id}/settings/general#access`,
    {
      status: 301,
    }
  );
}
