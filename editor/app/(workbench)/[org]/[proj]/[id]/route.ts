import { editorlink } from "@/lib/forms/url";
import { type NextRequest, NextResponse } from "next/server";
import type { GDocEditorRouteParams } from "@/scaffolds/editor/state";

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<GDocEditorRouteParams>;
  }
) {
  const origin = req.nextUrl.origin;
  const { id, org, proj } = await context.params;

  return NextResponse.redirect(
    editorlink("data", {
      org,
      proj,
      origin,
      document_id: id,
    }),
    {
      status: 301,
    }
  );
}
