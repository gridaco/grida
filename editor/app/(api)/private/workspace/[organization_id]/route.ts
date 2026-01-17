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

  const { data: organizations, error: organizations_err } = await client
    .from("organization")
    .select("*");

  if (!organizations) {
    return notFound();
  }

  const { data: projects, error: projects_err } = await client
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
      })),
      projects,
      documents,
    },
    error: null,
  });
}
