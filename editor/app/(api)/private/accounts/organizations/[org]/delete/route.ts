import { createRouteHandlerWorkspaceClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

//
// !!!!!DANGER!!!!!
// !!!!!DANGER!!!!!
// !!!!!DANGER!!!!!
// !!!!!DANGER!!!!!
//
// be extra careful with this route
//
export async function POST(
  req: NextRequest,
  context: {
    params: {
      org: string;
    };
  }
) {
  const origin = req.nextUrl.origin;
  const org = context.params.org;
  const cookieStore = cookies();
  const wsclient = createRouteHandlerWorkspaceClient(cookieStore);

  const { data: orgref, error: orgreferr } = await wsclient
    .from("organization")
    .select("*")
    .eq("name", org)
    .single();

  if (orgreferr) {
    console.error(orgreferr);
    return NextResponse.error();
  }

  if (!orgref) {
    return notFound();
  }

  const body = await req.formData();

  const confirm = body.get("confirm");

  if (!confirm || confirm !== orgref.name) {
    return NextResponse.json(
      { message: "Invalid confirmation" },
      { status: 400 }
    );
  }

  const { count, error } = await wsclient
    .from("organization")
    .delete({ count: "exact" })
    .eq("name", org);

  if (error) {
    console.error(error);
    return NextResponse.error();
  }

  if (count) {
    return NextResponse.redirect(origin + "/dashboard", {
      status: 301,
    });
  } else {
    console.error("Failed to delete organization", org); // no permission
    return NextResponse.error();
  }
}
