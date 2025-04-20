import { createWWWClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";

const IS_HOSTED = process.env.VERCEL === "1";

type Params = {
  organization_id: number;
  project_id: number;
  docid: string;
  path_tokens: string[];
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { organization_id, project_id, docid, path_tokens } = await params;

  const client = await createWWWClient();

  const { data: www, error: www_err } = await client
    .from("www")
    .select("id, name")
    .eq("project_id", project_id)
    .single();
  if (www_err) return notFound();

  const { data: routing, error: routing_err } = await client
    .from("public_route")
    .select()
    .eq("www_id", www.id)
    .eq("document_id", docid)
    .single();

  if (routing_err) return notFound();

  const request_path = path_tokens.join("/");

  if (IS_HOSTED) {
    return NextResponse.redirect(
      `https://${www.name}.grida.site/${routing.route_path}/${request_path}`,
      { status: 302 }
    );
  } else {
    return NextResponse.redirect(
      `http://${www.name}.localhost:3000/${routing.route_path}/${request_path}`,
      { status: 302 }
    );
  }
}
