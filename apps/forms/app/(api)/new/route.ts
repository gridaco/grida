import { editorlink } from "@/lib/forms/url";
import {
  create_new_form_with_document,
  seed_form_document_blocks,
} from "@/services/new";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const project_id = Number(request.nextUrl.searchParams.get("project_id"));

  if (!project_id) {
    return NextResponse.error();
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

    return NextResponse.redirect(editorlink("design", { origin, form_id }), {
      status: 302,
    });
  } catch (e) {
    console.error("error while creating new form", e);
    return NextResponse.error();
  }
}
