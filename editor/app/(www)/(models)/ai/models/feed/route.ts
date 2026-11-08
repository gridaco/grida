import { readPublicModels } from "@/lib/gg/public-models/server";

export const dynamic = "force-dynamic";
/** The page's unfiltered read model, not the installed-client /api/v1 catalogue. */
export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (new URL(request.url).search)
    return Response.json(
      { error: "Query parameters are not supported" },
      { status: 400, headers }
    );
  const view = await readPublicModels();
  return Response.json(view, {
    status: view.state === "unavailable" ? 503 : 200,
    headers,
  });
}
