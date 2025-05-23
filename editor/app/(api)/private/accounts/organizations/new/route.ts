import { createClient, service_role } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;

  const body = await req.formData();

  const name = body.get("name");
  const email = body.get("email");

  const client = await createClient();
  const { data: userdata } = await client.auth.getUser();
  if (!userdata.user) {
    return NextResponse.redirect(origin + "/sign-in", {
      status: 301,
    });
  }

  const { data, error } = await service_role.workspace
    .from("organization")
    .insert({
      name: String(name),
      email: email ? String(email) : null,
      owner_id: userdata.user.id,
    })
    .select()
    .single();

  if (error) {
    console.error(error);

    const q = new URLSearchParams({
      error:
        "An error occurred while creating the organization. Please try again.",
    });

    return NextResponse.redirect(
      origin + "/organizations/new" + "?" + q.toString()
    );
  }

  if (!data) {
    return NextResponse.error();
  }

  // TODO: invitation is not ready
  // return NextResponse.redirect(origin + `/organizations/${data.name}/invite`);

  return NextResponse.redirect(origin + `/${data.name}`);
}
