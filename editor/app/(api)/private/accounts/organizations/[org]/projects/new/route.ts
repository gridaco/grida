import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

type Params = { org: string };

export async function POST(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const origin = req.nextUrl.origin;
  const { org } = await context.params;
  const client = await createClient();

  const { data: orgref, error: orgerr } = await client
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

  const { error } = await client.from("project").insert({
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
