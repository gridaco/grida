import { projectsRemoveProjectDomain } from "@/clients/vercel";
import { normalizeHostname } from "@/lib/domains";
import { createClient, createWWWClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { notFound } from "next/navigation";
import { revalidateTag } from "next/cache";

const IS_VERCEL_HOSTED = process.env.VERCEL === "1";
const IS_VERCEL_PROD = process.env.VERCEL_ENV === "production";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function errorMessage(e: unknown): string | null {
  if (e instanceof Error) return e.message;
  if (isPlainObject(e) && typeof e.message === "string") return e.message;
  return null;
}

function errorBody(e: unknown): unknown | null {
  if (isPlainObject(e) && "body" in e) return (e as { body?: unknown }).body ?? null;
  return null;
}

type Params = {
  org: string;
  proj: string;
  hostname: string;
};

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { org, proj, hostname: rawHostname } = await params;

  if (IS_VERCEL_HOSTED && !IS_VERCEL_PROD) {
    return NextResponse.json(
      {
        error: {
          code: "DOMAIN_MANAGEMENT_DISABLED_IN_THIS_ENV",
          message: "Custom domain management is enabled only in production.",
        },
      },
      { status: 403 }
    );
  }

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

  const { data: domain_row, error: domain_err } = await wwwClient
    .from("domain")
    .select("id, canonical")
    .eq("www_id", www.id)
    .ilike("hostname", hostname)
    .single();
  if (domain_err || !domain_row) return notFound();

  // Remove from Vercel project
  try {
    await projectsRemoveProjectDomain(hostname);
  } catch (e: unknown) {
    return NextResponse.json(
      {
        error: {
          code: "VERCEL_ERROR",
          message: errorMessage(e) ?? "Vercel domain removal failed.",
          provider: { name: "vercel", detail: errorBody(e) },
        },
      },
      { status: 502 }
    );
  }

  const { error: del_err } = await wwwClient
    .from("domain")
    .delete()
    .eq("id", domain_row.id);
  if (del_err) {
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: del_err.message } },
      { status: 500 }
    );
  }

  revalidateTag("grida:domain-registry", "max");

  // If canonical was removed, fall back to platform domain (no further action needed).
  return NextResponse.json({
    data: {
      ok: true,
      removed: hostname,
      canonical_was_removed: domain_row.canonical,
    },
  });
}
