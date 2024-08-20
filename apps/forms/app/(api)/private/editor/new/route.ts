import { editorlink } from "@/lib/forms/url";
import { createRouteHandlerWorkspaceClient } from "@/lib/supabase/server";
import {
  SchemaDocumentSetupAssistantService,
  FormDocumentSetupAssistantService,
  SiteDocumentSetupAssistantService,
} from "@/services/new";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import type { GDocumentType } from "@/types";
import assert from "assert";

export const revalidate = 0;

export async function POST(request: NextRequest) {
  const cookieStore = cookies();
  const wsclient = createRouteHandlerWorkspaceClient(cookieStore);
  const origin = request.nextUrl.origin;
  const project_id = Number(request.nextUrl.searchParams.get("project_id"));
  const doctype = request.nextUrl.searchParams.get("doctype") as GDocumentType;

  assert(project_id, "project_id is required");
  assert(doctype, "doctype is required");

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

  switch (doctype) {
    case "v0_form": {
      try {
        const setup = new FormDocumentSetupAssistantService(project_id);
        const { form_document_id } = await setup.createFormDocument();

        try {
          await setup.seedFormDocumentBlocks();
        } catch (e) {
          // this won't be happening
          console.error("error while seeding form page blocks", e);
          // ignore and continue since the form itself is created anyway.
        }

        return NextResponse.redirect(
          editorlink("form/edit", {
            proj: project_ref.name,
            org: project_ref.organization!.name,
            origin,
            document_id: form_document_id,
          }),
          {
            status: 302,
          }
        );
      } catch (e) {
        console.error("error while creating new form", e);
        return NextResponse.error();
      }
      break;
    }
    case "v0_site": {
      const setup = new SiteDocumentSetupAssistantService(project_id);
      const { id } = await setup.createSiteDocument();
      return NextResponse.redirect(
        editorlink(".", {
          proj: project_ref.name,
          org: project_ref.organization!.name,
          origin,
          document_id: id,
        }),
        {
          status: 302,
        }
      );
      break;
    }
    case "v0_schema": {
      const setup = new SchemaDocumentSetupAssistantService(project_id);
      const { id } = await setup.createSchemaDocument({
        // TODO:
        name: "todo",
      });
      return NextResponse.redirect(
        editorlink(".", {
          proj: project_ref.name,
          org: project_ref.organization!.name,
          origin,
          document_id: id,
        }),
        {
          status: 302,
        }
      );
      break;
    }
    default: {
      console.error("unknown doctype", doctype);
      return NextResponse.error();
    }
  }
}
