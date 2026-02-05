import {
  projectsGetProjectDomain,
  projectsVerifyProjectDomain,
  vercelGetDomainConfig,
} from "@/clients/vercel";
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

type VercelDomainConfig = {
  misconfigured: boolean;
} & Record<string, unknown>;

function isVercelDomainConfig(v: unknown): v is VercelDomainConfig {
  return isPlainObject(v) && typeof v.misconfigured === "boolean";
}

// Local JSON type compatible with Supabase `jsonb` columns.
type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

function toJson(value: unknown): Json | null {
  try {
    return JSON.parse(JSON.stringify(value)) as Json;
  } catch {
    return null;
  }
}

type Params = {
  org: string;
  proj: string;
  hostname: string;
};

export async function refreshDomain(
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
    .select("id, canonical, vercel")
    .eq("www_id", www.id)
    .ilike("hostname", hostname)
    .single();

  if (domain_err || !domain_row) return notFound();

  let vercel_verify: unknown = null;
  let vercel_domain: Awaited<ReturnType<typeof projectsGetProjectDomain>> | null =
    null;
  let vercel_config: unknown = null;
  try {
    vercel_verify = await projectsVerifyProjectDomain(hostname);
    vercel_domain = await projectsGetProjectDomain(hostname);
    vercel_config = await vercelGetDomainConfig(hostname);
  } catch (e: unknown) {
    const prevObj = isPlainObject(domain_row.vercel) ? domain_row.vercel : {};
    await wwwClient
      .from("domain")
      .update({
        status: "error",
        last_checked_at: new Date().toISOString(),
        last_error: errorMessage(e) ?? "Vercel domain refresh failed.",
        last_error_code: "VERCEL_API_ERROR",
        vercel: toJson({
          ...prevObj,
          verify: vercel_verify,
          domain: null,
          config: null,
        }),
      })
      .eq("id", domain_row.id);

    return NextResponse.json(
      {
        error: {
          code: "VERCEL_ERROR",
          message: errorMessage(e) ?? "Vercel domain refresh failed.",
          provider: { name: "vercel", detail: errorBody(e) },
        },
      },
      { status: 502 }
    );
  }

  // Vercel has two relevant concepts:
  // - `domain.verified`: ownership verified for use on the project
  // - `config.misconfigured`: whether DNS is correctly configured and Vercel can issue TLS
  //
  // For Grida routing, "active" should mean the domain is actually ready to serve HTTPS traffic,
  // so we require both ownership verification and a non-misconfigured config.
  const ownershipVerified = vercel_domain?.verified === true;
  const cfg = isVercelDomainConfig(vercel_config) ? vercel_config : null;
  const properlyConfigured = cfg?.misconfigured === false;
  const active = ownershipVerified && properlyConfigured;

  const verification = vercel_domain?.verification;
  const verificationRequired =
    ownershipVerified === false &&
    Array.isArray(verification) &&
    verification.length > 0;

  const last_error_code = active
    ? null
    : verificationRequired
      ? "VERIFICATION_REQUIRED"
      : ownershipVerified
        ? properlyConfigured
          ? null
          : "DNS_MISCONFIGURED"
        : null;

  const { data: updated, error: update_err } = await wwwClient
    .from("domain")
    .update({
      status: active ? "active" : "pending",
      last_checked_at: new Date().toISOString(),
      last_verified_at: active ? new Date().toISOString() : null,
      last_error: null,
      last_error_code,
      vercel: (() => {
        const prevObj = isPlainObject(domain_row.vercel) ? domain_row.vercel : {};
        return toJson({
          ...prevObj,
          verify: vercel_verify,
          domain: vercel_domain,
          config: vercel_config,
        });
      })(),
    })
    .eq("id", domain_row.id)
    .select()
    .single();

  if (update_err) {
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: update_err.message } },
      { status: 500 }
    );
  }

  // If this domain just became active AND is flagged canonical ("make primary once active"),
  // enforce single-canonical by clearing other canonicals.
  if (active && domain_row.canonical === true) {
    await wwwClient
      .from("domain")
      .update({ canonical: false })
      .eq("www_id", www.id)
      .neq("id", domain_row.id);
  }

  // TODO(optimization): sync Redis routing index here (write-through cache).
  // Reliability-first routing should resolve from DB even if Redis is empty.
  revalidateTag("grida:domain-registry", "max");

  return NextResponse.json({
    data: {
      www: { id: www.id, name: www.name },
      domain: updated,
      provider: {
        name: "vercel",
        verify: vercel_verify,
        domain: vercel_domain,
        config: vercel_config,
      },
    },
  });
}
