import { editorlink } from "@/host/url";
import { notFound } from "next/navigation";
import { type NextRequest, NextResponse } from "next/server";
import type { GDocEditorRouteParams } from "@/scaffolds/editor/state";

/**
 * Shape of `public.document.id`. This route is the only match for an otherwise
 * unrouted three-segment path, so anything else (a missing asset such as
 * `/templates/slides/index.json`) can't name a document and must stay a 404.
 */
const DOCUMENT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<GDocEditorRouteParams>;
  }
) {
  const origin = req.nextUrl.origin;
  const { id, org, proj } = await context.params;

  if (!DOCUMENT_ID.test(id)) return notFound();

  // Temporary: browsers cache a 301 indefinitely, so a mistaken match would
  // keep redirecting after the path starts resolving.
  return NextResponse.redirect(
    editorlink("data", {
      org,
      proj,
      origin,
      document_id: id,
    }),
    {
      status: 307,
    }
  );
}
