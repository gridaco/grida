import { createClient, createWWWClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { notFound } from "next/navigation";
import { revalidateTag } from "next/cache";

type Params = {
  org: string;
  proj: string;
};

/**
 * Make the platform domain the primary domain by clearing
 * any custom-domain canonical flags for this tenant.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { org, proj } = await params;

  const client = await createClient();
  const wwwClient = await createWWWClient();

  const { data: project, error: project_err } = await client
    .rpc("find_project", { p_org_ref: org, p_proj_ref: proj }, { get: true })
    .single();
  if (project_err) return notFound();

  const { data: www, error: www_err } = await wwwClient
    .from("www")
    .select("id, name")
    .eq("project_id", project.id)
    .single();
  if (www_err) return notFound();

  const { error: clear_err } = await wwwClient
    .from("domain")
    .update({ canonical: false })
    .eq("www_id", www.id);

  if (clear_err) {
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: clear_err.message } },
      { status: 500 }
    );
  }

  // TODO(optimization): sync Redis routing index here (write-through cache).
  // Reliability-first routing should resolve from DB even if Redis is empty.
  revalidateTag("grida:domain-registry", "max");

  return NextResponse.json({ data: { ok: true, primary: "platform" } });
}
