import { createClient } from "@/lib/supabase/server";
import { PublicUrls } from "@/services/public-urls";
import {
  platformBilling,
  type BillingSummary,
} from "@/lib/platform/billing-consumer";
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

  // A passive Platform projection never invents a Free plan when billing is
  // unavailable. Keep source RLS reads and workspace availability independent.
  const planByOrg = new Map<number, BillingSummary["plan"]>();
  try {
    const { data, error } = await client.auth.getSession();
    const bearer = data.session?.access_token;
    if (!error && bearer) {
      const platform = platformBilling();
      await Promise.all(
        organizations.map(async (org) => {
          try {
            const summary = await platform.summary(org.id, bearer);
            planByOrg.set(org.id, summary.plan);
          } catch {
            // A denied or unavailable projection is unknown for this org only.
          }
        })
      );
    }
  } catch {
    // Public contributors can use their workspace without private billing config.
  }

  return NextResponse.json({
    data: {
      organizations: organizations.map((org) => ({
        ...org,
        avatar_url: org.avatar_path ? avatar_url(org.avatar_path) : null,
        plan: planByOrg.get(org.id) ?? null,
      })),
      projects,
      documents,
    },
    error: null,
  });
}
