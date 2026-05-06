import { createClient } from "@/lib/supabase/server";
import { PublicUrls } from "@/services/public-urls";
import { notFound } from "next/navigation";
import { type NextRequest, NextResponse } from "next/server";

type Params = { organization_id: string };

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  // TODO: optimize query

  const { organization_id: organization_id_param } = await context.params;
  const organization_id = Number(organization_id_param);
  if (!Number.isFinite(organization_id)) return notFound();
  const client = await createClient();

  const avatar_url = PublicUrls.organization_avatar_url(client);

  const { data: organizations, error: __organizations_err } = await client
    .from("organization")
    .select("*");

  if (!organizations) {
    return notFound();
  }

  // Resolve plan per org from the Stripe-backed billing source. Orgs without
  // an active subscription fall back to "free".
  const orgIds = organizations.map((o) => o.id);
  const { data: billingRows } = await client
    .from("v_billing_subscription")
    .select("organization_id, plan")
    .in("organization_id", orgIds);
  const planByOrg = new Map<number, "free" | "pro" | "team">();
  for (const r of billingRows ?? []) {
    if (r.organization_id != null && r.plan) {
      const p = r.plan;
      if (p === "free" || p === "pro" || p === "team") {
        planByOrg.set(r.organization_id, p);
      }
    }
  }

  const { data: projects, error: __projects_err } = await client
    .from("project")
    .select("*")
    .eq("organization_id", organization_id);

  if (!projects) {
    return notFound();
  }

  const { data: documents, error: documents_err } = await client
    .rpc(
      "workspace_documents",
      {
        p_organization_id: organization_id,
      },
      { get: true }
    )
    .order("updated_at", { ascending: false });

  if (documents_err) {
    console.error(documents_err);
  }

  if (!documents) {
    return notFound();
  }

  return NextResponse.json({
    data: {
      organizations: organizations.map((org) => ({
        ...org,
        avatar_url: org.avatar_path ? avatar_url(org.avatar_path) : null,
        plan: planByOrg.get(org.id) ?? "free",
      })),
      projects,
      documents,
    },
    error: null,
  });
}
