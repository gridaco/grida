import { FormDocumentSetupAssistantService } from "@/services/new";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const project_id = Number(request.nextUrl.searchParams.get("project_id"));
  const template_name = String(request.nextUrl.searchParams.get("template"));

  if (!project_id) {
    return NextResponse.error();
  }

  if (template_name == "headless") {
    try {
      const setup = new FormDocumentSetupAssistantService(project_id, {
        title: "Headless Form",
        description: "This is a headless form",
        unknown_field_handling_strategy: "accept",
      });
      const { form_id, form_document_id } = await setup.createFormDocument();

      return NextResponse.json({ form_id, form_document_id });
    } catch (e) {
      console.error("error while creating new form", e);
      return NextResponse.error();
    }
  } else {
    // not supported
    console.error("unsupported template", template_name);
    NextResponse.error();
  }
}
