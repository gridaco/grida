import { editorlink } from "@/host/url";
import { notFound } from "next/navigation";
import { type NextRequest, NextResponse } from "next/server";
import type { GDocEditorRouteParams } from "@/scaffolds/editor/state";

// PostgreSQL accepts optional hyphens between groups of four hex digits.
// Checking the UUID shape keeps missing assets out of the workbench.
const DOCUMENT_ID = /^(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}$/i;

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<GDocEditorRouteParams>;
  }
) {
  const origin = req.nextUrl.origin;
  const { id, org, proj } = await context.params;

  const uuid = id.startsWith("{") && id.endsWith("}") ? id.slice(1, -1) : id;
  if (org.startsWith(".") || org.startsWith("_") || !DOCUMENT_ID.test(uuid)) {
    return notFound();
  }

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
