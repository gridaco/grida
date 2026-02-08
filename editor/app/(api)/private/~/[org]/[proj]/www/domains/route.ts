import {
  projectsAddProjectDomain,
  projectsGetProjectDomain,
} from "@/clients/vercel";
import { vercelGetDomainConfig } from "@/clients/vercel";
import {
  isBlacklistedHostname,
  isPlatformSiteHostname,
  isReservedAppHostname,
  normalizeHostname,
} from "@/lib/domains";
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
  if (isPlainObject(e) && "body" in e)
    return (e as { body?: unknown }).body ?? null;
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
};

type DomainRow = {
  id: string;
  www_id: string;
  hostname: string;
  status: "pending" | "active" | "error";
  canonical: boolean;
  kind: "apex" | "subdomain";
  vercel: unknown | null;
  last_verified_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

function log_domains_api_error(
  message: string,
  context: Record<string, unknown>,
  error?: unknown
) {
  // Keep logs high-signal for local debugging and production ops.
  // Avoid logging secrets; hostname/org/proj are safe and actionable.
  if (error) {
    console.error(`[www/domains] ${message}`, context, error);
  } else {
    console.error(`[www/domains] ${message}`, context);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { org, proj } = await params;

  const context = { method: "GET", org, proj };

  try {
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

    const { data: domains, error } = await wwwClient
      .from("domain")
      .select("*")
      .eq("www_id", www.id)
      .order("canonical", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) {
      log_domains_api_error(
        "db error listing domains",
        { ...context, www_id: www.id },
        error
      );
      return NextResponse.json(
        { error: { code: "DB_ERROR", message: error.message } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        www: { id: www.id, name: www.name },
        domains: (domains ?? []) as DomainRow[],
      },
    });
  } catch (e) {
    log_domains_api_error("unexpected error", context, e);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { org, proj } = await params;
  const contextBase = { method: "POST", org, proj };

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

  const body = (await req.json().catch(() => null)) as {
    hostname?: string;
    canonical?: boolean;
  } | null;

  const hostname = normalizeHostname(body?.hostname ?? "");
  if (!hostname) {
    return NextResponse.json(
      { error: { code: "INVALID_HOSTNAME", message: "Invalid hostname." } },
      { status: 400 }
    );
  }

  // Disallow platform domains as “custom domains”.
  if (isPlatformSiteHostname(hostname)) {
    return NextResponse.json(
      {
        error: {
          code: "HOSTNAME_NOT_ALLOWED",
          message: "Platform domains cannot be attached as custom domains.",
        },
      },
      { status: 400 }
    );
  }

  // Disallow Grida-owned app hostnames (and subdomains) to prevent hijacking.
  if (isReservedAppHostname(hostname)) {
    return NextResponse.json(
      {
        error: {
          message:
            "This hostname is reserved by Grida and cannot be attached as a custom domain.",
        },
      },
      { status: 400 }
    );
  }

  // Disallow blacklisted hostnames (provider-owned / keyword blocked).
  if (isBlacklistedHostname(hostname)) {
    return NextResponse.json(
      {
        error: {
          message:
            "This hostname is not allowed. Please use a different domain name.",
        },
      },
      { status: 400 }
    );
  }

  const context = {
    ...contextBase,
    hostname,
    canonical: body?.canonical === true,
  };

  try {
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

    // 1) Attach to Vercel project
    let vercel_add: unknown = null;
    let vercel_domain: Awaited<
      ReturnType<typeof projectsGetProjectDomain>
    > | null = null;
    let vercel_config: unknown = null;
    try {
      vercel_add = await projectsAddProjectDomain(hostname);
      vercel_domain = await projectsGetProjectDomain(hostname);
      vercel_config = await vercelGetDomainConfig(hostname);
    } catch (e: unknown) {
      log_domains_api_error("vercel domain attach failed", context, e);
      return NextResponse.json(
        {
          error: {
            code: "VERCEL_ERROR",
            message: errorMessage(e) ?? "Vercel domain operation failed.",
            provider: { name: "vercel", detail: errorBody(e) },
          },
        },
        { status: 502 }
      );
    }

    // 2) Persist in DB (pending by default; UI can trigger verify/refresh)
    const canonical = body?.canonical === true;
    const ownershipVerified = vercel_domain?.verified === true;
    const cfg = isVercelDomainConfig(vercel_config) ? vercel_config : null;
    const properlyConfigured = cfg?.misconfigured === false;
    const verification = vercel_domain?.verification;
    const verificationRequired =
      ownershipVerified === false &&
      Array.isArray(verification) &&
      verification.length > 0;

    const last_error_code =
      ownershipVerified && properlyConfigured
        ? null
        : verificationRequired
          ? "VERIFICATION_REQUIRED"
          : properlyConfigured
            ? null
            : "DNS_MISCONFIGURED";

    const { data: inserted, error: insert_err } = await wwwClient
      .from("domain")
      .insert({
        www_id: www.id,
        hostname,
        // "canonical" here means "make this primary once active".
        // We only enforce "single canonical" among *active* domains at the DB level.
        canonical,
        status: "pending",
        last_checked_at: new Date().toISOString(),
        last_error_code,
        vercel: {
          add: toJson(vercel_add),
          domain: toJson(vercel_domain),
          config: toJson(vercel_config),
        },
      })
      .select()
      .single();

    if (insert_err) {
      log_domains_api_error(
        "db error inserting domain",
        { ...context, www_id: www.id, www_name: www.name },
        insert_err
      );
      return NextResponse.json(
        { error: { code: "DB_ERROR", message: insert_err.message } },
        { status: 500 }
      );
    }

    // NOTE:
    // We intentionally do NOT clear other canonical domains here.
    // Primary routing uses the *active* canonical domain only; pending canonicals do not affect routing.
    // Canonical conflicts are resolved when a domain becomes active (verify) or when explicitly set canonical.

    // Invalidate internal resolver cache (best-effort).
    revalidateTag("grida:domain-registry", "max");

    return NextResponse.json({
      data: {
        www: { id: www.id, name: www.name },
        domain: inserted as DomainRow,
        provider: { name: "vercel", add: vercel_add, domain: vercel_domain },
      },
    });
  } catch (e) {
    log_domains_api_error("unexpected error", context, e);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
      { status: 500 }
    );
  }
}
