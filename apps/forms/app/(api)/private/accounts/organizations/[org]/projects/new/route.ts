import { createRouteHandlerWorkspaceClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  context: {
    params: {
      org: string;
    };
  }
) {
  const origin = req.nextUrl.origin;
  const cookieStore = cookies();
  const wsclient = createRouteHandlerWorkspaceClient(cookieStore);

  const org = context.params.org;

  const { data: orgref, error: orgerr } = await wsclient
    .from("organization")
    .select("id")
    .eq("name", org)
    .single();

  if (orgerr) {
    console.error(orgerr);
    return NextResponse.error();
  }

  if (!orgref) {
    return notFound();
  }

  const body = await req.formData();

  const name = body.get("name");

  const { error } = await wsclient.from("project").insert({
    organization_id: orgref.id,
    name: String(name),
  });

  if (error) {
    console.error("project/new", error, {
      organization_id: orgref.id,
      name: String(name),
    });
    return NextResponse.error();
  }

  const dashboard = `/${org}/${name}`;
  return NextResponse.redirect(origin + dashboard, {
    status: 302,
  });
}
