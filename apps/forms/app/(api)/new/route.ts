import { editorlink } from "@/lib/forms/url";
import { createRouteHandlerWorkspaceClient } from "@/lib/supabase/server";
import {
  create_new_form_with_document,
  seed_form_document_blocks,
} from "@/services/new";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

export async function POST(request: NextRequest) {
  const cookieStore = cookies();
  const wsclient = createRouteHandlerWorkspaceClient(cookieStore);
  const origin = request.nextUrl.origin;
  const project_id = Number(request.nextUrl.searchParams.get("project_id"));

  if (!project_id) {
    return NextResponse.error();
  }

  const { data: project_ref, error: project_ref_err } = await wsclient
    .from("project")
    .select(`id, name, organization(name)`)
    .eq("id", project_id)
    .single();
  if (project_ref_err) {
    console.error(project_ref_err);
    return NextResponse.error();
  }

  if (!project_ref) {
    return notFound();
  }

  try {
    const { form_id, form_document_id } = await create_new_form_with_document({
      project_id,
    });

    try {
      await seed_form_document_blocks({
        form_id,
        form_document_id: form_document_id,
      });
    } catch (e) {
      // this won't be happening
      console.error("error while seeding form page blocks", e);
      // ignore and continue since the form itself is created anyway.
    }

    return NextResponse.redirect(
      editorlink("design", {
        proj: project_ref.name,
        org: project_ref.organization!.name,
        origin,
        form_id,
      }),
      {
        status: 302,
      }
    );
  } catch (e) {
    console.error("error while creating new form", e);
    return NextResponse.error();
  }
}
