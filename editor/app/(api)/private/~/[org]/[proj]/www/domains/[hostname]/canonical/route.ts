import { normalizeHostname } from "@/lib/domains";
import { createClient, createWWWClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { notFound } from "next/navigation";
import { revalidateTag } from "next/cache";

type Params = {
  org: string;
  proj: string;
  hostname: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { org, proj, hostname: rawHostname } = await params;

  const hostname = normalizeHostname(rawHostname);
  if (!hostname) {
    return NextResponse.json(
      { error: { code: "INVALID_HOSTNAME", message: "Invalid hostname." } },
      { status: 400 }
    );
  }

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

  const { data: target, error: target_err } = await wwwClient
    .from("domain")
    .select("id, hostname, status")
    .eq("www_id", www.id)
    .ilike("hostname", hostname)
    .single();

  if (target_err || !target) return notFound();

  // Only allow canonicalizing active domains.
  if (target.status !== "active") {
    return NextResponse.json(
      {
        error: {
          code: "DOMAIN_NOT_ACTIVE",
          message: "Only active domains can be set as canonical.",
        },
      },
      { status: 409 }
    );
  }

  // Set requested domain canonical, clear others.
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

  const { data: updated, error: set_err } = await wwwClient
    .from("domain")
    .update({ canonical: true })
    .eq("id", target.id)
    .select()
    .single();
  if (set_err) {
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: set_err.message } },
      { status: 500 }
    );
  }

  // TODO(optimization): sync Redis routing index here (write-through cache).
  // Reliability-first routing should resolve from DB even if Redis is empty.
  revalidateTag("grida:domain-registry", "max");

  return NextResponse.json({
    data: { www: { id: www.id, name: www.name }, domain: updated },
  });
}
