import {
  createWestReferralClient,
  service_role,
} from "@/lib/supabase/server";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

type Context = {
  params: Promise<{ campaign_id: string }>;
};

export async function DELETE(req: NextRequest, context: Context) {
  const { campaign_id } = await context.params;
  const headerList = await headers();

  const project_id = Number(
    headerList.get("x-grida-editor-user-current-project-id")
  );

  if (!project_id || Number.isNaN(project_id)) {
    return NextResponse.json(
      { error: "Missing or invalid project id" },
      { status: 400 }
    );
  }

  // Verify the campaign exists and belongs to the project.
  // This client uses the caller's session (cookie-based, publishable key),
  // so RLS is enforced — only org members can see the campaign row.
  const client = await createWestReferralClient();

  const { data: campaign, error: fetchErr } = await client
    .from("campaign")
    .select("id, project_id")
    .eq("id", campaign_id)
    .eq("project_id", project_id)
    .single();

  if (fetchErr || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  // Delete the parent document — this cascades to the campaign row
  // and all related tables. The campaign table has a trigger
  // (trg_prevent_orphan_document_subtype) that blocks direct deletion
  // of the subtype; the document row must be deleted instead.
  //
  // We use service_role because the document table lives in the public
  // schema and the caller's session may lack direct DELETE grant.
  // The RLS-protected SELECT above is the authorization gate.
  const { error: docErr } = await service_role.workspace
    .from("document")
    .delete()
    .eq("id", campaign_id)
    .eq("project_id", project_id);

  if (docErr) {
    console.error("Failed to delete campaign", docErr);
    return NextResponse.json(
      { error: "Failed to delete campaign" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: { id: campaign_id } }, { status: 200 });
}
