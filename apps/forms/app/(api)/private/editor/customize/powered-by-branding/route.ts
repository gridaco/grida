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

  const __raw_is_powered_by_branding_enabled = formdata.get(
    "is_powered_by_branding_enabled"
  );
  console.log(__raw_is_powered_by_branding_enabled);
  const is_powered_by_branding_enabled =
    String(__raw_is_powered_by_branding_enabled) === "on";

  console.log("POST /private/editor/settings/powered-by-branding", {
    form_id,
    is_powered_by_branding_enabled: is_powered_by_branding_enabled,
  });

  if (!form_id) {
    return notFound();
  }

  const supabase = createRouteHandlerClient(cookieStore);

  await supabase
    .from("form")
    .update({
      is_powered_by_branding_enabled: is_powered_by_branding_enabled,
    })
    .eq("id", form_id)
    .single();

  // redirect to the page requested
  return NextResponse.redirect(origin + `/d/${form_id}/settings/customize`, {
    status: 301,
  });
}
